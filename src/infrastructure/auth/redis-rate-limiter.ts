import type { Redis } from 'ioredis';
import type { RateLimit, RateLimiter } from '../../domain/ports/auth.ports.js';

/**
 * Ventana fija en Redis: la clave vence a los 15 minutos del primer intento.
 * En Redis y no en memoria para que reiniciar la API no regale intentos.
 *
 * `consume` reserva el intento antes de verificar, en un MULTI: INCR y
 * EXPIRE NX viajan juntos, así una ráfaga en paralelo ve contadores reales
 * y una caída entre los dos comandos no deja una clave sin vencimiento.
 */
export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly windowSeconds = 900,
    private readonly prefix = 'lifeos:ratelimit:',
  ) {}

  async consume(limits: RateLimit[]): Promise<number | null> {
    const tx = this.redis.multi();
    for (const { key } of limits) tx.incr(this.prefix + key).expire(this.prefix + key, this.windowSeconds, 'NX').ttl(this.prefix + key);
    const replies = (await tx.exec()) ?? [];
    let retryAfter: number | null = null;
    limits.forEach(({ limit }, i) => {
      const count = Number(replies[i * 3]?.[1] ?? 0);
      const ttl = Number(replies[i * 3 + 2]?.[1] ?? this.windowSeconds);
      if (count > limit) retryAfter = Math.max(retryAfter ?? 0, ttl > 0 ? ttl : this.windowSeconds);
    });
    return retryAfter;
  }

  async blockedFor(limits: RateLimit[]): Promise<number | null> {
    let retryAfter: number | null = null;
    for (const { key, limit } of limits) {
      const count = Number((await this.redis.get(this.prefix + key)) ?? 0);
      if (count >= limit) {
        const ttl = await this.redis.ttl(this.prefix + key);
        retryAfter = Math.max(retryAfter ?? 0, ttl > 0 ? ttl : this.windowSeconds);
      }
    }
    return retryAfter;
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(this.prefix + key);
  }
}

import type { Redis } from 'ioredis';
import type { RateLimit, RateLimiter } from '../../domain/ports/auth.ports.js';

/**
 * Ventana fija en Redis: cada fallo hace INCR y la clave vence a los 15
 * minutos del primero. En Redis y no en memoria para que reiniciar la API
 * no le regale intentos a nadie.
 */
export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly windowSeconds = 900,
    private readonly prefix = 'lifeos:ratelimit:',
  ) {}

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

  async recordFailure(keys: string[]): Promise<void> {
    for (const key of keys) {
      const count = await this.redis.incr(this.prefix + key);
      if (count === 1) await this.redis.expire(this.prefix + key, this.windowSeconds);
    }
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(this.prefix + key);
  }
}

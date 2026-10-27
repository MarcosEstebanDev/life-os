import type { SessionRecord } from '../../domain/auth/session.js';
import type {
  AuthEvent,
  AuthEventLog,
  PasswordHasher,
  RateLimit,
  RateLimiter,
  RecoveryCodeRepository,
  SessionRepository,
  UserRecord,
  UserRepository,
} from '../../domain/ports/auth.ports.js';
import type { SecretBox } from '../../domain/ports/secret-box.port.js';

/** Dobles en memoria para los casos de uso de autenticación. */

export class InMemoryUsers implements UserRepository {
  readonly items = new Map<string, UserRecord>();
  private seq = 0;
  async findByEmail(email: string) {
    return [...this.items.values()].find((u) => u.email === email) ?? null;
  }
  async get(id: string) {
    const u = this.items.get(id);
    if (!u) throw new Error(`usuario ${id} no existe`);
    return u;
  }
  async create(input: { email: string; passwordHash: string }) {
    const u: UserRecord = { id: `u${++this.seq}`, ...input, totpSecretSealed: null, totpEnabledAt: null, totpLastStep: null, createdAt: new Date(0) };
    this.items.set(u.id, u);
    return u;
  }
  async update(id: string, patch: Partial<UserRecord>) {
    this.items.set(id, { ...(await this.get(id)), ...patch });
  }
  async count() {
    return this.items.size;
  }
  async claimTotpStep(id: string, step: number) {
    const u = this.items.get(id);
    if (!u || (u.totpLastStep !== null && u.totpLastStep >= step)) return false;
    this.items.set(id, { ...u, totpLastStep: step });
    return true;
  }
}

export class InMemorySessions implements SessionRepository {
  readonly items = new Map<string, SessionRecord>();
  private seq = 0;
  async create(s: Omit<SessionRecord, 'id'>) {
    const record = { ...s, id: `s${++this.seq}` };
    this.items.set(record.id, record);
    return record;
  }
  async findByTokenHash(hash: string) {
    return [...this.items.values()].find((s) => s.tokenHash === hash) ?? null;
  }
  async get(id: string) {
    return this.items.get(id) ?? null;
  }
  async update(id: string, patch: Partial<SessionRecord>) {
    const s = this.items.get(id);
    if (s) this.items.set(id, { ...s, ...patch });
  }
  async listActive(userId: string, now: Date) {
    return [...this.items.values()].filter((s) => s.userId === userId && !s.revokedAt && s.expiresAt > now);
  }
  async revokeAll(userId: string, at: Date, exceptId?: string) {
    for (const s of this.items.values()) {
      if (s.userId === userId && s.id !== exceptId && !s.revokedAt) this.items.set(s.id, { ...s, revokedAt: at });
    }
  }
}

export class InMemoryRecoveryCodes implements RecoveryCodeRepository {
  readonly items: Array<{ userId: string; hash: string; usedAt: Date | null }> = [];
  async replaceAll(userId: string, hashes: string[]) {
    await this.deleteAll(userId);
    this.items.push(...hashes.map((hash) => ({ userId, hash, usedAt: null })));
  }
  async consume(userId: string, hash: string, at: Date) {
    const code = this.items.find((c) => c.userId === userId && c.hash === hash && !c.usedAt);
    if (!code) return false;
    code.usedAt = at;
    return true;
  }
  async deleteAll(userId: string) {
    for (let i = this.items.length - 1; i >= 0; i--) if (this.items[i].userId === userId) this.items.splice(i, 1);
  }
  async countUnused(userId: string) {
    return this.items.filter((c) => c.userId === userId && !c.usedAt).length;
  }
}

/** No es argon2, pero registra cada verificación: así se prueba que el email inexistente también verifica. */
export class FakeHasher implements PasswordHasher {
  verifications = 0;
  async hash(password: string) {
    return `hashed:${password}`;
  }
  async verify(hash: string, password: string) {
    this.verifications++;
    return hash === `hashed:${password}`;
  }
}

export class InMemoryRateLimiter implements RateLimiter {
  readonly failures = new Map<string, number>();
  async consume(limits: RateLimit[]) {
    for (const l of limits) this.failures.set(l.key, (this.failures.get(l.key) ?? 0) + 1);
    return limits.some((l) => (this.failures.get(l.key) ?? 0) > l.limit) ? 900 : null;
  }
  async blockedFor(limits: RateLimit[]) {
    return limits.some((l) => (this.failures.get(l.key) ?? 0) >= l.limit) ? 900 : null;
  }
  async reset(key: string) {
    this.failures.delete(key);
  }
}

export class InMemoryAuthEvents implements AuthEventLog {
  readonly items: AuthEvent[] = [];
  async record(e: AuthEvent) {
    this.items.push(e);
  }
  async listForUser(userId: string, limit: number) {
    return this.items.filter((e) => e.userId === userId).slice(-limit).reverse();
  }
}

export class FakeSecretBox implements SecretBox {
  seal(plaintext: string) {
    return `sealed:${plaintext}`;
  }
  open(sealed: string) {
    return sealed.replace(/^sealed:/, '');
  }
}

export class MutableClock {
  constructor(public current = new Date('2026-10-27T12:00:00Z')) {}
  now() {
    return this.current.toISOString();
  }
  today() {
    return this.current.toISOString().slice(0, 10);
  }
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}

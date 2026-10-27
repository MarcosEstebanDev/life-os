import type { PrismaClient } from '../../generated/prisma/client.js';
import type { SessionRecord } from '../../domain/auth/session.js';
import type {
  AuthEvent,
  AuthEventLog,
  AuthEventType,
  RecoveryCodeRepository,
  SessionRepository,
  UserRecord,
  UserRepository,
} from '../../domain/ports/auth.ports.js';

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  get(id: string): Promise<UserRecord> {
    return this.prisma.user.findUniqueOrThrow({ where: { id } });
  }

  create(input: { email: string; passwordHash: string }): Promise<UserRecord> {
    return this.prisma.user.create({ data: input });
  }

  async update(id: string, patch: Partial<Omit<UserRecord, 'id' | 'createdAt'>>): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: patch });
  }

  count(): Promise<number> {
    return this.prisma.user.count();
  }

  /** La condición va en el WHERE: Postgres serializa los dos UPDATE y sólo uno cambia la fila. */
  async claimTotpStep(id: string, step: number): Promise<boolean> {
    const { count } = await this.prisma.user.updateMany({
      where: { id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpLastStep: step },
    });
    return count === 1;
  }
}

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(s: Omit<SessionRecord, 'id'>): Promise<SessionRecord> {
    return this.prisma.session.create({ data: s });
  }

  findByTokenHash(hash: string): Promise<SessionRecord | null> {
    return this.prisma.session.findUnique({ where: { tokenHash: hash } });
  }

  get(id: string): Promise<SessionRecord | null> {
    return this.prisma.session.findUnique({ where: { id } });
  }

  async update(id: string, patch: Partial<Pick<SessionRecord, 'lastSeenAt' | 'expiresAt' | 'revokedAt'>>): Promise<void> {
    await this.prisma.session.update({ where: { id }, data: patch });
  }

  listActive(userId: string, now: Date): Promise<SessionRecord[]> {
    return this.prisma.session.findMany({ where: { userId, revokedAt: null, expiresAt: { gt: now } } });
  }

  async revokeAll(userId: string, at: Date, exceptId?: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { revokedAt: at },
    });
  }
}

export class PrismaRecoveryCodeRepository implements RecoveryCodeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async replaceAll(userId: string, hashes: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.recoveryCode.deleteMany({ where: { userId } }),
      this.prisma.recoveryCode.createMany({ data: hashes.map((codeHash) => ({ userId, codeHash })) }),
    ]);
  }

  /** `updateMany` con `usedAt: null` en el filtro: dos usos simultáneos del mismo código, sólo uno gana. */
  async consume(userId: string, hash: string, at: Date): Promise<boolean> {
    const { count } = await this.prisma.recoveryCode.updateMany({ where: { userId, codeHash: hash, usedAt: null }, data: { usedAt: at } });
    return count === 1;
  }

  async deleteAll(userId: string): Promise<void> {
    await this.prisma.recoveryCode.deleteMany({ where: { userId } });
  }

  countUnused(userId: string): Promise<number> {
    return this.prisma.recoveryCode.count({ where: { userId, usedAt: null } });
  }
}

export class PrismaAuthEventLog implements AuthEventLog {
  constructor(private readonly prisma: PrismaClient) {}

  async record(e: AuthEvent): Promise<void> {
    await this.prisma.authEvent.create({ data: e });
  }

  async listForUser(userId: string, limit: number): Promise<AuthEvent[]> {
    const rows = await this.prisma.authEvent.findMany({ where: { userId }, orderBy: { at: 'desc' }, take: limit });
    return rows.map(({ id, ...e }) => ({ ...e, type: e.type as AuthEventType }));
  }
}

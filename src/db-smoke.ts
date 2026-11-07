import { randomUUID } from 'node:crypto';
import { nextExpiry } from './domain/auth/session.js';
import { newSessionToken } from './domain/auth/session-token.js';
import { Redis } from 'ioredis';
import { RedisRateLimiter } from './infrastructure/auth/redis-rate-limiter.js';
import { createPrismaClient } from './infrastructure/persistence/prisma.js';
import { PrismaRecoveryCodeRepository, PrismaSessionRepository, PrismaUserRepository } from './infrastructure/persistence/prisma-auth.repositories.js';
import { PrismaDocumentRepository } from './infrastructure/persistence/prisma-document.repository.js';
import { PrismaObligationRepository } from './infrastructure/persistence/prisma-obligation.repository.js';

/** Ida y vuelta contra la base real: fechas, montos, sesiones, códigos de recuperación y aislamiento. */
const prisma = createPrismaClient(process.env.DATABASE_URL!);
const users = new PrismaUserRepository(prisma);
const sessions = new PrismaSessionRepository(prisma);
const recovery = new PrismaRecoveryCodeRepository(prisma);
const docs = new PrismaDocumentRepository(prisma);
const obligations = new PrismaObligationRepository(prisma);

const check = (ok: boolean, what: string) => {
  if (!ok) throw new Error(what);
};

const owner = await users.create({ email: `smoke-${randomUUID()}@example.com`, passwordHash: 'x' });
const intruder = await users.create({ email: `smoke-${randomUUID()}@example.com`, passwordHash: 'x' });
try {
  const doc = await docs.create({
    ownerId: owner.id, path: 'smoke.txt', sha256: 'smoke', mimeType: 'text/plain', sizeBytes: 1, status: 'PENDING', error: null, text: null,
  });
  const id = randomUUID();
  await obligations.insert({
    id, ownerId: owner.id, title: 'Smoke', kind: 'DEADLINE', dueDate: '2027-10-21', recurrence: 'NONE', amount: '1234.56', currency: 'NZD',
    counterparty: null, sourceDocumentId: doc.id, evidence: ['a', 'b'], confidence: 0.5, status: 'PROPOSED',
    seriesKey: '|DEADLINE|smoke', possibleUpdateOf: null, doneAt: null,
  });
  const back = await obligations.get(id);
  check(back.dueDate === '2027-10-21', `dueDate corrida: ${back.dueDate}`);
  check(back.amount === '1234.56', `amount distinto: ${back.amount}`);
  check(back.evidence.length === 2, 'evidencia perdida');

  check((await docs.findBySha(owner.id, 'smoke'))?.id === doc.id, 'findBySha del dueño');
  check((await docs.findBySha(intruder.id, 'smoke')) === null, 'findBySha de otro usuario');
  check((await docs.findOwned(intruder.id, doc.id)) === null, 'documento visible para otro usuario');
  check((await obligations.findOwned(intruder.id, id)) === null, 'obligación visible para otro usuario');
  check((await obligations.list(intruder.id)).length === 0, 'listado con datos ajenos');

  const now = new Date();
  const { hash } = newSessionToken();
  const s = await sessions.create({
    userId: owner.id, tokenHash: hash, createdAt: now, lastSeenAt: now, expiresAt: nextExpiry(now, now),
    revokedAt: null, mfaPending: false, userAgent: 'smoke', ip: '127.0.0.1',
  });
  check((await sessions.findByTokenHash(hash))?.id === s.id, 'sesión por hash');
  await sessions.revokeAll(owner.id, now);
  check((await sessions.listActive(owner.id, now)).length === 0, 'revokeAll');

  await recovery.replaceAll(owner.id, ['h1', 'h2']);
  check(await recovery.consume(owner.id, 'h1', now), 'consumir código');
  check(!(await recovery.consume(owner.id, 'h1', now)), 'código reusado');
  check((await recovery.countUnused(owner.id)) === 1, 'códigos sin usar');

  // Dos usos del mismo paso TOTP en paralelo: la base deja pasar uno solo.
  const claims = await Promise.all([users.claimTotpStep(owner.id, 1000), users.claimTotpStep(owner.id, 1000)]);
  check(claims.filter(Boolean).length === 1, `claimTotpStep en paralelo: ${claims}`);
  check(!(await users.claimTotpStep(owner.id, 999)), 'un paso anterior no se acepta');

  // Ráfaga de 10 intentos en paralelo con límite 5: Redis deja pasar exactamente 5.
  const redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
  try {
    const limiter = new RedisRateLimiter(redis, 60, `lifeos:smoke:${randomUUID()}:`);
    const results = await Promise.all(Array.from({ length: 10 }, () => limiter.consume([{ key: 'k', limit: 5 }])));
    check(results.filter((r) => r === null).length === 5, `ráfaga: ${results.filter((r) => r === null).length} permitidos`);
    check(results.every((r) => r === null || (r > 0 && r <= 60)), 'Retry-After dentro de la ventana');
    check((await limiter.blockedFor([{ key: 'k', limit: 5 }])) !== null, 'blockedFor ve el bloqueo');
    await limiter.reset('k');
  } finally {
    await redis.quit();
  }

  console.log('db-smoke OK');
} finally {
  // ON DELETE CASCADE: borrar los usuarios limpia documentos, obligaciones, sesiones y códigos.
  await prisma.user.deleteMany({ where: { id: { in: [owner.id, intruder.id] } } });
  await prisma.$disconnect();
}

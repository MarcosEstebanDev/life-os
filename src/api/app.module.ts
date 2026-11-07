import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Redis } from 'ioredis';
import type { AuthDeps } from '../application/auth/auth-deps.js';
import { AuthenticateUseCase } from '../application/auth/authenticate.use-case.js';
import { ChangePasswordUseCase } from '../application/auth/change-password.use-case.js';
import { CompleteMfaUseCase, LoginUseCase } from '../application/auth/login.use-case.js';
import { RegisterUseCase } from '../application/auth/register.use-case.js';
import { SessionsUseCase } from '../application/auth/sessions.use-case.js';
import { TotpUseCase } from '../application/auth/totp.use-case.js';
import { CompleteObligationUseCase } from '../application/complete-obligation.use-case.js';
import { GetBriefUseCase } from '../application/get-brief.use-case.js';
import { ReprocessDocumentUseCase } from '../application/reprocess-document.use-case.js';
import { ReviewObligationUseCase } from '../application/review-obligation.use-case.js';
import { ConfigError, loadConfig, type Config } from '../config.js';
import type { DocumentRepository } from '../domain/ports/document-repository.port.js';
import type { ObligationRepository } from '../domain/ports/obligation-repository.port.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { Argon2PasswordHasher } from '../infrastructure/auth/argon2-password-hasher.js';
import { RedisRateLimiter } from '../infrastructure/auth/redis-rate-limiter.js';
import { SystemClock } from '../infrastructure/clock/system-clock.js';
import { AesGcmSecretBox } from '../infrastructure/crypto/aes-gcm-secret-box.js';
import { createPrismaClient } from '../infrastructure/persistence/prisma.js';
import {
  PrismaAuthEventLog,
  PrismaRecoveryCodeRepository,
  PrismaSessionRepository,
  PrismaUserRepository,
} from '../infrastructure/persistence/prisma-auth.repositories.js';
import { PrismaDocumentRepository } from '../infrastructure/persistence/prisma-document.repository.js';
import { PrismaObligationRepository } from '../infrastructure/persistence/prisma-obligation.repository.js';
import { BullMqJobQueue } from '../infrastructure/queue/bullmq-job-queue.js';
import { AuthController } from './auth.controller.js';
import { SessionGuard } from './auth/session.guard.js';
import { BriefController } from './brief.controller.js';
import { DocumentsController } from './documents.controller.js';
import { ObligationsController } from './obligations.controller.js';
import {
  AUTH_DEPS,
  AUTHENTICATE,
  BRIEF,
  CHANGE_PASSWORD,
  COMPLETE,
  COMPLETE_MFA,
  CONFIG,
  DOCUMENTS,
  LOGIN,
  OBLIGATIONS,
  REGISTER,
  REPROCESS,
  REVIEW,
  SESSIONS,
  TOTP,
} from './tokens.js';

/**
 * Composition root de la API. No conoce el LLM: lee, revisa y encola.
 * El trabajo pesado vive en el worker.
 */
const PRISMA = Symbol('PRISMA');
const REDIS = Symbol('REDIS');
const QUEUE = Symbol('QUEUE');

/** Sin esto Ctrl+C no termina: Redis y Postgres mantienen vivo el event loop. */
@Injectable()
class Shutdown implements OnApplicationShutdown {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(QUEUE) private readonly queue: BullMqJobQueue,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async onApplicationShutdown() {
    await this.queue.close();
    await this.redis.quit();
    await this.prisma.$disconnect();
  }
}

function authDeps(config: Config, prisma: PrismaClient, redis: Redis): AuthDeps {
  if (!config.auth.encryptionKey) {
    throw new ConfigError('falta AUTH_ENCRYPTION_KEY (32 bytes en base64). Generala con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
  }
  return {
    users: new PrismaUserRepository(prisma),
    sessions: new PrismaSessionRepository(prisma),
    recovery: new PrismaRecoveryCodeRepository(prisma),
    hasher: new Argon2PasswordHasher(),
    limiter: new RedisRateLimiter(redis),
    events: new PrismaAuthEventLog(prisma),
    clock: new SystemClock(),
    box: new AesGcmSecretBox(config.auth.encryptionKey),
    signup: config.auth.signup,
  };
}

const useCase = <T>(provide: symbol, build: (d: AuthDeps) => T) => ({ provide, useFactory: build, inject: [AUTH_DEPS] });

@Module({
  controllers: [AuthController, BriefController, ObligationsController, DocumentsController],
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig(process.env) },
    { provide: PRISMA, useFactory: (c: Config) => createPrismaClient(c.databaseUrl), inject: [CONFIG] },
    { provide: REDIS, useFactory: (c: Config) => new Redis(c.redisUrl, { maxRetriesPerRequest: null }), inject: [CONFIG] },
    { provide: QUEUE, useFactory: (r: Redis) => new BullMqJobQueue(r), inject: [REDIS] },
    { provide: AUTH_DEPS, useFactory: authDeps, inject: [CONFIG, PRISMA, REDIS] },
    useCase(AUTHENTICATE, (d) => new AuthenticateUseCase(d)),
    useCase(REGISTER, (d) => new RegisterUseCase(d)),
    useCase(LOGIN, (d) => new LoginUseCase(d)),
    useCase(COMPLETE_MFA, (d) => new CompleteMfaUseCase(d)),
    useCase(SESSIONS, (d) => new SessionsUseCase(d)),
    useCase(CHANGE_PASSWORD, (d) => new ChangePasswordUseCase(d)),
    useCase(TOTP, (d) => new TotpUseCase(d)),
    {
      provide: APP_GUARD,
      useFactory: (auth: AuthenticateUseCase, reflector: Reflector) => new SessionGuard(auth, reflector),
      inject: [AUTHENTICATE, Reflector],
    },
    { provide: DOCUMENTS, useFactory: (p: PrismaClient) => new PrismaDocumentRepository(p), inject: [PRISMA] },
    { provide: OBLIGATIONS, useFactory: (p: PrismaClient) => new PrismaObligationRepository(p), inject: [PRISMA] },
    { provide: REVIEW, useFactory: (o: ObligationRepository) => new ReviewObligationUseCase(o), inject: [OBLIGATIONS] },
    {
      provide: COMPLETE,
      useFactory: (o: ObligationRepository) => new CompleteObligationUseCase(o, new SystemClock(), randomUUID),
      inject: [OBLIGATIONS],
    },
    { provide: BRIEF, useFactory: (o: ObligationRepository) => new GetBriefUseCase(o, new SystemClock()), inject: [OBLIGATIONS] },
    {
      provide: REPROCESS,
      useFactory: (d: DocumentRepository, o: ObligationRepository, q: BullMqJobQueue) => new ReprocessDocumentUseCase(d, o, q),
      inject: [DOCUMENTS, OBLIGATIONS, QUEUE],
    },
    Shutdown,
  ],
})
export class AppModule {}

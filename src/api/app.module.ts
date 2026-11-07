import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { CompleteObligationUseCase } from '../application/complete-obligation.use-case.js';
import { GetBriefUseCase } from '../application/get-brief.use-case.js';
import { ReprocessDocumentUseCase } from '../application/reprocess-document.use-case.js';
import { ReviewObligationUseCase } from '../application/review-obligation.use-case.js';
import { loadConfig, type Config } from '../config.js';
import type { DocumentRepository } from '../domain/ports/document-repository.port.js';
import type { ObligationRepository } from '../domain/ports/obligation-repository.port.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { SystemClock } from '../infrastructure/clock/system-clock.js';
import { createPrismaClient } from '../infrastructure/persistence/prisma.js';
import { PrismaDocumentRepository } from '../infrastructure/persistence/prisma-document.repository.js';
import { PrismaObligationRepository } from '../infrastructure/persistence/prisma-obligation.repository.js';
import { BullMqJobQueue } from '../infrastructure/queue/bullmq-job-queue.js';
import { BriefController } from './brief.controller.js';
import { DocumentsController } from './documents.controller.js';
import { ObligationsController } from './obligations.controller.js';
import { BRIEF, COMPLETE, CONFIG, DOCUMENTS, OBLIGATIONS, REPROCESS, REVIEW } from './tokens.js';

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

@Module({
  controllers: [BriefController, ObligationsController, DocumentsController],
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig(process.env) },
    { provide: PRISMA, useFactory: (c: Config) => createPrismaClient(c.databaseUrl), inject: [CONFIG] },
    { provide: REDIS, useFactory: (c: Config) => new Redis(c.redisUrl, { maxRetriesPerRequest: null }), inject: [CONFIG] },
    { provide: QUEUE, useFactory: (r: Redis) => new BullMqJobQueue(r), inject: [REDIS] },
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

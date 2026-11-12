import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { ExtractObligationsUseCase } from '../application/extract-obligations.use-case.js';
import { ExtractTextUseCase } from '../application/extract-text.use-case.js';
import { IngestFileUseCase } from '../application/ingest-file.use-case.js';
import { loadConfig } from '../config.js';
import { SystemClock } from '../infrastructure/clock/system-clock.js';
import { sha256File } from '../infrastructure/hash.js';
import { OpenAiCompatibleAdapter } from '../infrastructure/llm/openai-compatible.adapter.js';
import { createPrismaClient } from '../infrastructure/persistence/prisma.js';
import { PrismaUserRepository } from '../infrastructure/persistence/prisma-auth.repositories.js';
import { PrismaDocumentRepository } from '../infrastructure/persistence/prisma-document.repository.js';
import { PrismaObligationRepository } from '../infrastructure/persistence/prisma-obligation.repository.js';
import { BullMqJobQueue, EXTRACT_OBLIGATIONS, EXTRACT_TEXT, JOB_OPTIONS } from '../infrastructure/queue/bullmq-job-queue.js';
import { FileTextExtractor } from '../infrastructure/text/file-text-extractor.js';
import { startFolderWatcher } from '../infrastructure/watcher/folder-watcher.js';

const config = loadConfig(process.env);
const prisma = createPrismaClient(config.databaseUrl);
const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
const documents = new PrismaDocumentRepository(prisma);
const obligations = new PrismaObligationRepository(prisma);
const queue = new BullMqJobQueue(redis);
const extractor = new FileTextExtractor();
const llm = new OpenAiCompatibleAdapter(config.llm);

const ingest = new IngestFileUseCase(documents, queue, extractor);
const extractText = new ExtractTextUseCase(documents, queue, extractor);
const extractObligations = new ExtractObligationsUseCase(documents, obligations, llm, new SystemClock(config.timeZone), randomUUID);

type Payload = { documentId: string };

/** Agotados los reintentos (LLM caído, por ejemplo), el documento queda FAILED con el motivo a la vista. */
async function markFailed(job: Job<Payload> | undefined, error: Error) {
  if (!job || job.attemptsMade < (JOB_OPTIONS.attempts ?? 1)) return;
  await documents.update(job.data.documentId, { status: 'FAILED', error: error.message.slice(0, 500) });
  console.error(`[${job.name}] ${job.data.documentId} FAILED: ${error.message}`);
}

const workers = [
  new Worker<Payload>(EXTRACT_TEXT, (job) => extractText.execute(job.data.documentId), { connection: redis }),
  // Uno a la vez: el LLM corre en la CPU de esta PC.
  new Worker<Payload>(
    EXTRACT_OBLIGATIONS,
    async (job) => {
      const result = await extractObligations.execute(job.data.documentId);
      console.log(`[extract-obligations] ${job.data.documentId}`, result);
    },
    { connection: redis, concurrency: 1 },
  ),
];
for (const w of workers) w.on('failed', (job, err) => void markFailed(job, err));

const users = new PrismaUserRepository(prisma);

/**
 * La carpeta es de un usuario, y se fija al arrancar: si se resolviera en cada
 * archivo, quien registrara ese email antes que el dueño se quedaría con los
 * documentos que entren después. Sin dueño, el worker procesa la cola pero no
 * mira la carpeta (y no se cae: `npm run dev` bajaría la API y la web con él).
 */
async function resolveWatchOwner(): Promise<string | null> {
  if (!config.watchOwnerEmail) {
    console.warn('[watcher] falta WATCH_OWNER_EMAIL en .env: no miro la carpeta.');
    return null;
  }
  const owner = await users.findByEmail(config.watchOwnerEmail);
  if (!owner) {
    console.warn(`[watcher] no hay una cuenta con ${config.watchOwnerEmail}: creala en la web y reiniciá el worker. No miro la carpeta.`);
    return null;
  }
  return owner.id;
}

const ownerId = await resolveWatchOwner();
const watcher = ownerId
  ? startFolderWatcher(config.watchDir, async (path) => {
      const [sha256, info] = await Promise.all([sha256File(path), stat(path)]);
      const result = await ingest.execute({ path, sha256, sizeBytes: info.size, ownerId });
      console.log(`[ingest] ${result.status} ${path}`);
    })
  : null;

console.log(`worker listo · ${watcher ? `carpeta ${config.watchDir} de ${config.watchOwnerEmail}` : 'sin carpeta'} · modelo ${llm.modelName}`);

async function shutdown() {
  await watcher?.close();
  await Promise.all(workers.map((w) => w.close()));
  await queue.close();
  await redis.quit();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

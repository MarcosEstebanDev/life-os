import { Queue, type JobsOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import type { JobQueue } from '../../domain/ports/queue.port.js';

export const EXTRACT_TEXT = 'extract-text';
export const EXTRACT_OBLIGATIONS = 'extract-obligations';

export const JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

/**
 * BullMQ 6 no trae cliente de Redis: recibe una conexión ya construida
 * (`maxRetriesPerRequest: null`). Lo que BullMQ no creó, BullMQ no lo cierra.
 */
export class BullMqJobQueue implements JobQueue {
  private readonly text: Queue;
  private readonly obligations: Queue;

  constructor(connection: Redis) {
    this.text = new Queue(EXTRACT_TEXT, { connection });
    this.obligations = new Queue(EXTRACT_OBLIGATIONS, { connection });
  }

  async enqueueExtractText(documentId: string) {
    await this.text.add(EXTRACT_TEXT, { documentId }, JOB_OPTIONS);
  }

  async enqueueExtractObligations(documentId: string) {
    await this.obligations.add(EXTRACT_OBLIGATIONS, { documentId }, JOB_OPTIONS);
  }

  async close() {
    await Promise.all([this.text.close(), this.obligations.close()]);
  }
}

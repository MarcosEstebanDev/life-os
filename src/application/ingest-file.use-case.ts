import { extname } from 'node:path';
import type { DocumentRepository } from '../domain/ports/document-repository.port.js';
import type { JobQueue } from '../domain/ports/queue.port.js';
import type { TextExtractor } from '../domain/ports/text-extractor.port.js';

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
};

/**
 * Entrada de un archivo de la carpeta observada. La identidad es el hash:
 * copiar o renombrar un archivo no lo vuelve a procesar.
 */
export class IngestFileUseCase {
  constructor(
    private readonly documents: DocumentRepository,
    private readonly queue: JobQueue,
    private readonly extractor: TextExtractor,
  ) {}

  async execute(input: { path: string; sha256: string; sizeBytes: number; ownerId: string }): Promise<{
    status: 'created' | 'duplicate' | 'unsupported';
    documentId?: string;
  }> {
    const ext = extname(input.path).toLowerCase();
    if (!this.extractor.supports(ext)) return { status: 'unsupported' };

    const existing = await this.documents.findBySha(input.ownerId, input.sha256);
    if (existing) return { status: 'duplicate', documentId: existing.id };

    const doc = await this.documents.create({
      ownerId: input.ownerId,
      path: input.path,
      sha256: input.sha256,
      mimeType: MIME_TYPES[ext] ?? 'application/octet-stream',
      sizeBytes: input.sizeBytes,
      status: 'PENDING',
      error: null,
      text: null,
    });
    await this.queue.enqueueExtractText(doc.id);
    return { status: 'created', documentId: doc.id };
  }
}

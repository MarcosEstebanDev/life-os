import type { DocumentRepository } from '../domain/ports/document-repository.port.js';
import type { JobQueue } from '../domain/ports/queue.port.js';
import type { TextExtractor } from '../domain/ports/text-extractor.port.js';

const MIN_TEXT_CHARS = 20;
export const NO_TEXT_ERROR = 'sin texto (requiere OCR)';

export class ExtractTextUseCase {
  constructor(
    private readonly documents: DocumentRepository,
    private readonly queue: JobQueue,
    private readonly extractor: TextExtractor,
  ) {}

  async execute(documentId: string): Promise<void> {
    const doc = await this.documents.get(documentId);
    let text: string;
    try {
      text = await this.extractor.extract(doc.path);
    } catch (e) {
      await this.documents.update(documentId, { status: 'FAILED', error: (e as Error).message });
      return;
    }
    // Un escaneo da un PDF válido sin capa de texto: no es un error del lector, es que falta OCR.
    if (text.replace(/\s/g, '').length < MIN_TEXT_CHARS) {
      await this.documents.update(documentId, { status: 'FAILED', error: NO_TEXT_ERROR });
      return;
    }
    await this.documents.update(documentId, { status: 'TEXT_EXTRACTED', error: null, text });
    await this.queue.enqueueExtractObligations(documentId);
  }
}

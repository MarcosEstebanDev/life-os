import type { DocumentRepository } from '../domain/ports/document-repository.port.js';
import type { ObligationRepository } from '../domain/ports/obligation-repository.port.js';
import type { JobQueue } from '../domain/ports/queue.port.js';

/** Reemplaza las propuestas sin revisar; lo que ya acepté o descarté no se toca. */
export class ReprocessDocumentUseCase {
  constructor(
    private readonly documents: DocumentRepository,
    private readonly obligations: ObligationRepository,
    private readonly queue: JobQueue,
  ) {}

  async execute(documentId: string): Promise<void> {
    await this.documents.get(documentId);
    await this.obligations.deleteProposedByDocument(documentId);
    await this.documents.update(documentId, { status: 'PENDING', error: null });
    await this.queue.enqueueExtractText(documentId);
  }
}

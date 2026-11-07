export type DocumentStatus = 'PENDING' | 'TEXT_EXTRACTED' | 'PROCESSED' | 'FAILED';

export interface DocumentRecord {
  id: string;
  ownerId: string;
  path: string;
  sha256: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  error: string | null;
  text: string | null;
  createdAt: string;
}

/**
 * `get` es para el worker, que procesa documentos sin un usuario detrás.
 * Todo lo que llega desde la API pasa por `findOwned` / `list(ownerId)`.
 */
export interface DocumentRepository {
  findBySha(ownerId: string, sha: string): Promise<DocumentRecord | null>;
  create(d: Omit<DocumentRecord, 'id' | 'createdAt'>): Promise<DocumentRecord>;
  get(id: string): Promise<DocumentRecord>;
  findOwned(ownerId: string, id: string): Promise<DocumentRecord | null>;
  update(id: string, patch: Partial<Omit<DocumentRecord, 'id' | 'ownerId'>>): Promise<void>;
  list(ownerId: string): Promise<DocumentRecord[]>;
}

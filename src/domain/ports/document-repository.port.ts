export type DocumentStatus = 'PENDING' | 'TEXT_EXTRACTED' | 'PROCESSED' | 'FAILED';

export interface DocumentRecord {
  id: string;
  path: string;
  sha256: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  error: string | null;
  text: string | null;
  createdAt: string;
}

export interface DocumentRepository {
  findBySha(sha: string): Promise<DocumentRecord | null>;
  create(d: Omit<DocumentRecord, 'id' | 'createdAt'>): Promise<DocumentRecord>;
  get(id: string): Promise<DocumentRecord>;
  update(id: string, patch: Partial<Omit<DocumentRecord, 'id'>>): Promise<void>;
  list(): Promise<DocumentRecord[]>;
}

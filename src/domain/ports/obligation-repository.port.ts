import type { Obligation, ObligationStatus } from '../obligation.js';

export interface ObligationRepository {
  findBySeries(key: string): Promise<Obligation[]>;
  insert(o: Obligation): Promise<void>;
  update(o: Obligation): Promise<void>;
  get(id: string): Promise<Obligation>;
  list(filter?: { status?: ObligationStatus }): Promise<Obligation[]>;
  /** Reprocesar reemplaza las propuestas de un documento; lo revisado no se toca. */
  deleteProposedByDocument(documentId: string): Promise<number>;
}

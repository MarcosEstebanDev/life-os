import type { Obligation, ObligationStatus } from '../obligation.js';

/** Igual que documentos: `get` es interno; desde la API se entra por el dueño. */
export interface ObligationRepository {
  findBySeries(ownerId: string, key: string): Promise<Obligation[]>;
  insert(o: Obligation): Promise<void>;
  update(o: Obligation): Promise<void>;
  get(id: string): Promise<Obligation>;
  findOwned(ownerId: string, id: string): Promise<Obligation | null>;
  list(ownerId: string, filter?: { status?: ObligationStatus }): Promise<Obligation[]>;
  /** Reprocesar reemplaza las propuestas de un documento; lo revisado no se toca. */
  deleteProposedByDocument(documentId: string): Promise<number>;
}

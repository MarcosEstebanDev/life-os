import { addMonths, type IsoDate } from './dates.js';

export type ObligationKind = 'PAYMENT' | 'RENEWAL' | 'DEADLINE' | 'EXPIRY' | 'OTHER';
export type Recurrence = 'NONE' | 'MONTHLY' | 'YEARLY';
export type ObligationStatus = 'PROPOSED' | 'ACTIVE' | 'DONE' | 'DISMISSED';

/**
 * Algo que tengo que hacer o pagar, con el documento del que salió como
 * evidencia. Nada entra como ACTIVE sin pasar por mi revisión.
 */
export interface Obligation {
  id: string;
  title: string;
  kind: ObligationKind;
  /** Opcional sólo mientras es PROPOSED: la completo al revisarla. */
  dueDate: IsoDate | null;
  recurrence: Recurrence;
  /** Decimal como string ("1234.56"): nada de floats para plata. */
  amount: string | null;
  currency: string | null;
  counterparty: string | null;
  sourceDocumentId: string;
  /** Fragmentos literales del texto que justifican fecha y monto. */
  evidence: string[];
  confidence: number;
  status: ObligationStatus;
  seriesKey: string;
  /** Propuesta que podría actualizar a una ACTIVE existente. */
  possibleUpdateOf: string | null;
  doneAt: string | null;
}

export class ObligationError extends Error {}

function requireStatus(o: Obligation, expected: ObligationStatus, action: string): void {
  if (o.status !== expected) {
    throw new ObligationError(`no se puede ${action} una obligación ${o.status}`);
  }
}

export function activate(o: Obligation): Obligation {
  requireStatus(o, 'PROPOSED', 'activar');
  if (!o.dueDate) throw new ObligationError('falta la fecha de vencimiento');
  return { ...o, status: 'ACTIVE' };
}

export function dismiss(o: Obligation): Obligation {
  requireStatus(o, 'PROPOSED', 'descartar');
  return { ...o, status: 'DISMISSED' };
}

/** El id de la siguiente ocurrencia lo pone quien llama: el dominio no genera ids. */
export function complete(
  o: Obligation,
  now: string,
  newId: string,
): { done: Obligation; next: Obligation | null } {
  requireStatus(o, 'ACTIVE', 'completar');
  const done: Obligation = { ...o, status: 'DONE', doneAt: now };
  if (o.recurrence === 'NONE' || !o.dueDate) return { done, next: null };
  const months = o.recurrence === 'MONTHLY' ? 1 : 12;
  const next: Obligation = { ...o, id: newId, dueDate: addMonths(o.dueDate, months), doneAt: null, possibleUpdateOf: null };
  return { done, next };
}

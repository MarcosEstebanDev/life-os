import { daysBetween, type IsoDate } from './dates.js';
import type { Obligation } from './obligation.js';

export const DUPLICATE_TOLERANCE_DAYS = 3;

export type DedupeDecision =
  | { action: 'new' }
  | { action: 'attach'; to: string }
  | { action: 'possibleUpdate'; of: string };

/**
 * ¿La obligación que propone el LLM ya la conozco?
 *
 * - Misma serie y fecha a ±3 días con el mismo monto: es la misma, se le suma evidencia.
 * - Misma serie y fecha cercana con otro monto: posible actualización de la activa.
 * - Misma serie y fecha lejana: en una recurrente es otra ocurrencia (el resumen
 *   del mes que viene); en un plazo único es que la fecha cambió.
 */
export function decideDuplicate(
  candidate: { seriesKey: string; dueDate: IsoDate | null; amount: string | null },
  existing: Obligation[],
): DedupeDecision {
  const series = existing.filter((o) => o.seriesKey === candidate.seriesKey && o.status !== 'DISMISSED');
  const active = series
    .filter((o) => o.status === 'ACTIVE')
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));

  if (!candidate.dueDate) {
    const undated = series.find((o) => o.status === 'PROPOSED' && !o.dueDate);
    if (undated) return { action: 'attach', to: undated.id };
    return active[0] ? { action: 'possibleUpdate', of: active[0].id } : { action: 'new' };
  }
  const due = candidate.dueDate;
  const distance = (o: Obligation) => Math.abs(daysBetween(o.dueDate!, due));

  const near = series
    .filter((o) => o.dueDate && distance(o) <= DUPLICATE_TOLERANCE_DAYS)
    .sort((a, b) => distance(a) - distance(b));
  if (near.length > 0) {
    const sameAmount = near.find((o) => !o.amount || !candidate.amount || o.amount === candidate.amount);
    if (sameAmount) return { action: 'attach', to: sameAmount.id };
    const nearActive = near.find((o) => o.status === 'ACTIVE');
    return nearActive ? { action: 'possibleUpdate', of: nearActive.id } : { action: 'new' };
  }

  const moved = active.find((o) => o.recurrence === 'NONE');
  return moved ? { action: 'possibleUpdate', of: moved.id } : { action: 'new' };
}

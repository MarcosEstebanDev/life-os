import { activate, dismiss, ObligationError, type Obligation } from '../domain/obligation.js';
import type { ObligationRepository } from '../domain/ports/obligation-repository.port.js';
import { seriesKey } from '../domain/series-key.js';

export type ObligationEdits = Partial<
  Pick<Obligation, 'title' | 'kind' | 'dueDate' | 'recurrence' | 'amount' | 'currency' | 'counterparty'>
>;

export class ReviewObligationUseCase {
  constructor(private readonly obligations: ObligationRepository) {}

  async accept(id: string, edits: ObligationEdits = {}): Promise<Obligation> {
    const edited = { ...(await this.obligations.get(id)), ...edits };
    const accepted = activate({ ...edited, seriesKey: seriesKey(edited) });
    await this.obligations.update(accepted);
    return accepted;
  }

  async dismiss(id: string): Promise<Obligation> {
    const dismissed = dismiss(await this.obligations.get(id));
    await this.obligations.update(dismissed);
    return dismissed;
  }

  /** La propuesta trae datos más nuevos de una obligación que ya existe. */
  async merge(id: string): Promise<Obligation> {
    const proposal = await this.obligations.get(id);
    if (!proposal.possibleUpdateOf) throw new ObligationError('la propuesta no actualiza a ninguna obligación');
    const original = await this.obligations.get(proposal.possibleUpdateOf);
    const merged: Obligation = {
      ...original,
      dueDate: proposal.dueDate ?? original.dueDate,
      amount: proposal.amount ?? original.amount,
      evidence: [...original.evidence, ...proposal.evidence],
    };
    await this.obligations.update(merged);
    await this.obligations.update(dismiss(proposal));
    return merged;
  }
}

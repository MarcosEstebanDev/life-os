import type { IsoDate } from '../domain/dates.js';
import type { ObligationKind, Recurrence } from '../domain/obligation.js';

export type Expected = {
  label: string;
  due: (IsoDate | null)[];
  kind: ObligationKind[];
  recurrence: Recurrence;
  amount?: string;
};

export type Predicted = {
  title: string;
  kind: ObligationKind;
  dueDate: IsoDate | null;
  recurrence: Recurrence;
  amount: string | null;
  counterparty: string | null;
};

export type ItemScore = {
  expected: Expected;
  predicted: Predicted | null;
  kind: boolean;
  recurrence: boolean;
  /** null: el caso no pide monto. */
  amount: boolean | null;
};

export type CaseScore = { items: ItemScore[]; extra: Predicted[] };

type Ratio = { ok: number; of: number };
export type Summary = { expected: number; found: number; extra: number; kind: Ratio; recurrence: Ratio; amount: Ratio };

/**
 * Cada esperada se empareja con una propuesta de fecha aceptable; entre varias, gana la que
 * coincide en tipo y monto (un turno y su arancel caen el mismo día). Lo que queda sin
 * emparejar son propuestas de más.
 */
export function scoreCase(expected: Expected[], predicted: Predicted[]): CaseScore {
  const free = [...predicted];
  const items = expected.map((e): ItemScore => {
    const candidates = free.filter((p) => e.due.includes(p.dueDate));
    const fit = (p: Predicted) => Number(e.kind.includes(p.kind)) + Number(e.amount !== undefined && p.amount === e.amount);
    const best = candidates.sort((a, b) => fit(b) - fit(a))[0] ?? null;
    if (best) free.splice(free.indexOf(best), 1);
    return {
      expected: e,
      predicted: best,
      kind: best !== null && e.kind.includes(best.kind),
      recurrence: best !== null && best.recurrence === e.recurrence,
      amount: e.amount === undefined ? null : best?.amount === e.amount,
    };
  });
  return { items, extra: free };
}

export function summarize(cases: CaseScore[]): Summary {
  const items = cases.flatMap((c) => c.items);
  const ratio = (pick: (i: ItemScore) => boolean | null): Ratio => {
    const rated = items.map(pick).filter((v) => v !== null);
    return { ok: rated.filter(Boolean).length, of: rated.length };
  };
  return {
    expected: items.length,
    found: items.filter((i) => i.predicted !== null).length,
    extra: cases.reduce((n, c) => n + c.extra.length, 0),
    kind: ratio((i) => i.kind),
    recurrence: ratio((i) => i.recurrence),
    amount: ratio((i) => i.amount),
  };
}

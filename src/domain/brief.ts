import { daysBetween, type IsoDate } from './dates.js';
import type { Obligation } from './obligation.js';

export interface Brief {
  today: IsoDate;
  overdue: Obligation[];
  next7: Obligation[];
  next30: Obligation[];
  toReview: Obligation[];
}

const byDueDate = (a: Obligation, b: Obligation) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31');

/** Se calcula en vivo: nada que persistir ni un cron que dependa de que la PC esté prendida. */
export function computeBrief(all: Obligation[], today: IsoDate): Brief {
  const active = all.filter((o) => o.status === 'ACTIVE' && o.dueDate).sort(byDueDate);
  const inDays = (o: Obligation) => daysBetween(today, o.dueDate!);
  return {
    today,
    overdue: active.filter((o) => inDays(o) < 0),
    next7: active.filter((o) => inDays(o) >= 0 && inDays(o) <= 7),
    next30: active.filter((o) => inDays(o) >= 8 && inDays(o) <= 30),
    toReview: all.filter((o) => o.status === 'PROPOSED').sort(byDueDate),
  };
}

import { addDays, addMonths, type IsoDate } from './dates.js';

export type DueDateSpec =
  | { type: 'absolute'; date: IsoDate }
  | { type: 'relative'; months: number; days: number }
  | { type: 'unknown' };

/**
 * "12 meses desde la emisión" corre desde la fecha del documento, no desde
 * el día en que se procesa. Sin esa fecha no se adivina: queda para revisión.
 */
export function resolveDueDate(spec: DueDateSpec, documentDate: IsoDate | null): IsoDate | null {
  switch (spec.type) {
    case 'absolute':
      return spec.date;
    case 'relative':
      return documentDate ? addDays(addMonths(documentDate, spec.months), spec.days) : null;
    case 'unknown':
      return null;
  }
}

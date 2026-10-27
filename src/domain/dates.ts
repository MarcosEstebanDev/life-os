/**
 * Fechas sin hora. Un vencimiento es un día, no un instante: trabajar con
 * `YYYY-MM-DD` y aritmética en UTC evita los corrimientos por zona horaria.
 */
export type IsoDate = string;

function toUtc(d: IsoDate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function fromUtc(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: IsoDate, n: number): IsoDate {
  const date = toUtc(d);
  date.setUTCDate(date.getUTCDate() + n);
  return fromUtc(date);
}

/** Si el día no existe en el mes destino (31 → febrero), cae el último día. */
export function addMonths(d: IsoDate, n: number): IsoDate {
  const [y, m, day] = d.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return fromUtc(target);
}

/** b − a en días. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

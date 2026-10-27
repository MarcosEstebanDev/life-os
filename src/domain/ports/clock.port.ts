import type { IsoDate } from '../dates.js';

export interface Clock {
  /** Hoy en la zona horaria del usuario. */
  today(): IsoDate;
  /** Instante ISO completo. */
  now(): string;
}

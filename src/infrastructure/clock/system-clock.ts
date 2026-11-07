import type { IsoDate } from '../../domain/dates.js';
import type { Clock } from '../../domain/ports/clock.port.js';

/** "Hoy" es el día en la zona local: a las 23 hs no puede figurar vencido lo de mañana. */
export class SystemClock implements Clock {
  private readonly format = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });

  constructor(private readonly current: () => Date = () => new Date()) {}

  today(): IsoDate {
    return this.format.format(this.current());
  }

  now(): string {
    return this.current().toISOString();
  }
}

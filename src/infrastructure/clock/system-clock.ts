import type { IsoDate } from '../../domain/dates.js';
import type { Clock } from '../../domain/ports/clock.port.js';

/**
 * "Hoy" es el día en la zona horaria configurada (`TIME_ZONE`): a las 23 hs no
 * puede figurar vencido lo de mañana, aunque en UTC ya sea el día siguiente.
 */
export class SystemClock implements Clock {
  private readonly format: Intl.DateTimeFormat;

  constructor(
    timeZone: string,
    private readonly current: () => Date = () => new Date(),
  ) {
    this.format = new Intl.DateTimeFormat('en-CA', { timeZone });
  }

  today(): IsoDate {
    return this.format.format(this.current());
  }

  now(): string {
    return this.current().toISOString();
  }
}

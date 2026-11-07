import { decideDuplicate } from '../domain/dedupe.js';
import { NotFoundError } from '../domain/errors.js';
import { complete } from '../domain/obligation.js';
import type { Clock } from '../domain/ports/clock.port.js';
import type { ObligationRepository } from '../domain/ports/obligation-repository.port.js';

export class CompleteObligationUseCase {
  constructor(
    private readonly obligations: ObligationRepository,
    private readonly clock: Clock,
    private readonly newId: () => string,
  ) {}

  async execute(ownerId: string, id: string): Promise<void> {
    const current = await this.obligations.findOwned(ownerId, id);
    if (!current) throw new NotFoundError('la obligación no existe');
    const { done, next } = complete(current, this.clock.now(), this.newId());
    await this.obligations.update(done);
    if (!next) return;
    // Si el resumen del mes siguiente llegó antes y ya lo acepté, la siguiente ocurrencia ya existe.
    const series = (await this.obligations.findBySeries(ownerId, next.seriesKey)).filter((o) => o.id !== done.id);
    if (decideDuplicate(next, series).action === 'attach') return;
    await this.obligations.insert(next);
  }
}

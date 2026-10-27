import { complete } from '../domain/obligation.js';
import type { Clock } from '../domain/ports/clock.port.js';
import type { ObligationRepository } from '../domain/ports/obligation-repository.port.js';

export class CompleteObligationUseCase {
  constructor(
    private readonly obligations: ObligationRepository,
    private readonly clock: Clock,
    private readonly newId: () => string,
  ) {}

  async execute(id: string): Promise<void> {
    const { done, next } = complete(await this.obligations.get(id), this.clock.now(), this.newId());
    await this.obligations.update(done);
    if (next) await this.obligations.insert(next);
  }
}

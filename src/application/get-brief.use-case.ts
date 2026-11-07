import { computeBrief, type Brief } from '../domain/brief.js';
import type { Clock } from '../domain/ports/clock.port.js';
import type { ObligationRepository } from '../domain/ports/obligation-repository.port.js';

export class GetBriefUseCase {
  constructor(
    private readonly obligations: ObligationRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<Brief> {
    return computeBrief(await this.obligations.list(), this.clock.today());
  }
}

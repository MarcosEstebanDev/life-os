import { Controller, Get, Inject } from '@nestjs/common';
import type { GetBriefUseCase } from '../application/get-brief.use-case.js';
import { BRIEF } from './tokens.js';

@Controller('brief')
export class BriefController {
  constructor(@Inject(BRIEF) private readonly brief: GetBriefUseCase) {}

  @Get()
  get() {
    return this.brief.execute();
  }
}

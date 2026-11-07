import { Controller, Get, Inject } from '@nestjs/common';
import type { GetBriefUseCase } from '../application/get-brief.use-case.js';
import { CurrentAuth, type AuthContext } from './auth/session.guard.js';
import { BRIEF } from './tokens.js';

@Controller('brief')
export class BriefController {
  constructor(@Inject(BRIEF) private readonly brief: GetBriefUseCase) {}

  @Get()
  get(@CurrentAuth() auth: AuthContext) {
    return this.brief.execute(auth.user.id);
  }
}

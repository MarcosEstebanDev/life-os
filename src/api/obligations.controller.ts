import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { CompleteObligationUseCase } from '../application/complete-obligation.use-case.js';
import type { ReviewObligationUseCase } from '../application/review-obligation.use-case.js';
import { isoDate } from '../domain/extraction-schema.js';
import { RECURRENCES, type ObligationStatus } from '../domain/obligation.js';
import type { ObligationRepository } from '../domain/ports/obligation-repository.port.js';
import { CurrentAuth, type AuthContext } from './auth/session.guard.js';
import { COMPLETE, OBLIGATIONS, REVIEW } from './tokens.js';
import { IdParam } from './uuid-param.js';

const STATUSES = ['PROPOSED', 'ACTIVE', 'DONE', 'DISMISSED'] as const;

/** Lo que puedo corregir al revisar. Monto como string decimal, igual que en el dominio. */
const editsSchema = z
  .object({
    title: z.string().min(1),
    kind: z.enum(['PAYMENT', 'RENEWAL', 'DEADLINE', 'EXPIRY', 'OTHER']),
    dueDate: isoDate.nullable(),
    recurrence: z.enum(RECURRENCES),
    amount: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/).nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
    counterparty: z.string().nullable(),
  })
  .partial()
  .strict();

@Controller('obligations')
export class ObligationsController {
  constructor(
    @Inject(OBLIGATIONS) private readonly obligations: ObligationRepository,
    @Inject(REVIEW) private readonly review: ReviewObligationUseCase,
    @Inject(COMPLETE) private readonly completeObligation: CompleteObligationUseCase,
  ) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query('status') status?: string) {
    if (status && !STATUSES.includes(status as ObligationStatus)) {
      throw new BadRequestException(`status inválido: ${status}`);
    }
    return this.obligations.list(auth.user.id, status ? { status: status as ObligationStatus } : undefined);
  }

  @Post(':id/accept')
  @HttpCode(200)
  accept(@CurrentAuth() auth: AuthContext, @IdParam() id: string, @Body() body: unknown) {
    const edits = editsSchema.safeParse(body ?? {});
    if (!edits.success) {
      throw new BadRequestException(edits.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
    }
    return this.review.accept(auth.user.id, id, edits.data);
  }

  @Post(':id/dismiss')
  @HttpCode(200)
  dismiss(@CurrentAuth() auth: AuthContext, @IdParam() id: string) {
    return this.review.dismiss(auth.user.id, id);
  }

  @Post(':id/merge')
  @HttpCode(200)
  merge(@CurrentAuth() auth: AuthContext, @IdParam() id: string) {
    return this.review.merge(auth.user.id, id);
  }

  @Post(':id/complete')
  @HttpCode(204)
  async complete(@CurrentAuth() auth: AuthContext, @IdParam() id: string) {
    await this.completeObligation.execute(auth.user.id, id);
  }
}

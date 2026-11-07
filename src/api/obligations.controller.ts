import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { CompleteObligationUseCase } from '../application/complete-obligation.use-case.js';
import type { ReviewObligationUseCase } from '../application/review-obligation.use-case.js';
import { isoDate } from '../domain/extraction-schema.js';
import type { ObligationStatus } from '../domain/obligation.js';
import type { ObligationRepository } from '../domain/ports/obligation-repository.port.js';
import { COMPLETE, OBLIGATIONS, REVIEW } from './tokens.js';

const STATUSES = ['PROPOSED', 'ACTIVE', 'DONE', 'DISMISSED'] as const;

/** Lo que puedo corregir al revisar. Monto como string decimal, igual que en el dominio. */
const editsSchema = z
  .object({
    title: z.string().min(1),
    kind: z.enum(['PAYMENT', 'RENEWAL', 'DEADLINE', 'EXPIRY', 'OTHER']),
    dueDate: isoDate.nullable(),
    recurrence: z.enum(['NONE', 'MONTHLY', 'YEARLY']),
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
  list(@Query('status') status?: string) {
    if (status && !STATUSES.includes(status as ObligationStatus)) {
      throw new BadRequestException(`status inválido: ${status}`);
    }
    return this.obligations.list(status ? { status: status as ObligationStatus } : undefined);
  }

  @Post(':id/accept')
  @HttpCode(200)
  accept(@Param('id') id: string, @Body() body: unknown) {
    const edits = editsSchema.safeParse(body ?? {});
    if (!edits.success) {
      throw new BadRequestException(edits.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
    }
    return this.review.accept(id, edits.data);
  }

  @Post(':id/dismiss')
  @HttpCode(200)
  dismiss(@Param('id') id: string) {
    return this.review.dismiss(id);
  }

  @Post(':id/merge')
  @HttpCode(200)
  merge(@Param('id') id: string) {
    return this.review.merge(id);
  }

  @Post(':id/complete')
  @HttpCode(204)
  async complete(@Param('id') id: string) {
    await this.completeObligation.execute(id);
  }
}

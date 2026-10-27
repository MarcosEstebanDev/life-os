import { z } from 'zod';

/** El regex solo deja pasar "2027-02-30", que `Date` corre en silencio al 2 de marzo. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha en formato YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s, 'fecha inexistente');

const dueSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('absolute'), date: isoDate }),
  z.object({ type: z.literal('relative'), months: z.number().int().min(0), days: z.number().int().min(0) }),
  z.object({ type: z.literal('unknown') }),
]);

/**
 * Lo que el LLM tiene que devolver. Montos como número y fechas ISO: un
 * "$ 1.234,56" o un "15/03/2027" no pasan, y disparan el reintento en vez
 * de entrar como dato corrupto.
 */
export const extractionResultSchema = z.object({
  documentDate: z.object({ date: isoDate, evidence: z.string() }).nullable(),
  obligations: z.array(
    z.object({
      title: z.string().min(3),
      kind: z.enum(['PAYMENT', 'RENEWAL', 'DEADLINE', 'EXPIRY', 'OTHER']),
      due: dueSchema,
      recurrence: z.enum(['NONE', 'MONTHLY', 'YEARLY']),
      // Decimal(12,2): un CBU o un número de póliza tomado como monto no entra.
      amount: z.number().nonnegative().lt(1e10).nullable(),
      currency: z.string().regex(/^[A-Z]{3}$/, 'código ISO 4217').nullable(),
      counterparty: z.string().nullable(),
      evidence: z.string().min(8),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;

import { normalizeText } from './evidence.js';
import type { ObligationKind } from './obligation.js';

/** Identidad de una obligación a lo largo del tiempo: el resumen de cada mes es la misma serie. */
export function seriesKey(input: { counterparty: string | null; kind: ObligationKind; title: string }): string {
  return `${normalizeText(input.counterparty ?? '')}|${input.kind}|${normalizeText(input.title)}`;
}

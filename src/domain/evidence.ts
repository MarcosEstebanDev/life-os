/**
 * Barrera contra alucinaciones: una obligación sólo vale si su evidencia
 * aparece en el texto del documento. La comparación es normalizada, no byte
 * a byte, porque el modelo cambia separadores ("15-03" vs "15/03") al citar.
 */
const MIN_EVIDENCE_LENGTH = 8;

export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function evidenceAppears(evidence: string, text: string): boolean {
  const needle = normalizeText(evidence);
  if (needle.length < MIN_EVIDENCE_LENGTH) return false;
  return normalizeText(text).includes(needle);
}

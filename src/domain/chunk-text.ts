/**
 * Trozos que entran en el contexto de un modelo chico. El solape evita que
 * una obligación partida al medio se pierda; si aparece en dos trozos, la
 * deduplicación la junta.
 */
export function chunkText(text: string, maxChars = 12_000, overlap = 500): string[] {
  const chunks: string[] = [];
  for (let start = 0; ; start += maxChars - overlap) {
    chunks.push(text.slice(start, start + maxChars));
    if (start + maxChars >= text.length) return chunks;
  }
}

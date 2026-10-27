/**
 * Trozos que entran en el contexto de un modelo chico. El solape evita que
 * una obligación partida al medio se pierda; si aparece en dos trozos, la
 * deduplicación la junta.
 *
 * 6000 caracteres son ~1800 tokens: con el system prompt y la respuesta entra
 * en los 4096 que Ollama usa por defecto en su endpoint OpenAI. Si se pasa,
 * Ollama recorta desde el principio y lo primero que pierde es el esquema.
 */
export function chunkText(text: string, maxChars = 6_000, overlap = 300): string[] {
  const chunks: string[] = [];
  for (let start = 0; ; start += maxChars - overlap) {
    chunks.push(text.slice(start, start + maxChars));
    if (start + maxChars >= text.length) return chunks;
  }
}

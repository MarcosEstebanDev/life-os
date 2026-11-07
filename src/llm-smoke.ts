import { ExtractObligationsUseCase } from './application/extract-obligations.use-case.js';
import { FixedClock, InMemoryDocuments, InMemoryObligations, sequentialIds } from './application/fakes.js';
import { loadConfig } from './config.js';
import { OpenAiCompatibleAdapter } from './infrastructure/llm/openai-compatible.adapter.js';

/** Prueba el modelo configurado contra un texto de ejemplo, sin base ni cola. */
const config = loadConfig({ DATABASE_URL: '-', REDIS_URL: '-', WATCH_DIR: '-', ...process.env });
const llm = new OpenAiCompatibleAdapter(config.llm);
const docs = new InMemoryDocuments();
const obligations = new InMemoryObligations();
const doc = await docs.create({
  path: 'ejemplo.txt', sha256: 'x', mimeType: 'text/plain', sizeBytes: 0, status: 'TEXT_EXTRACTED', error: null,
  text: 'Banco Ejemplo - Resumen de tarjeta.\nFecha de emisión: 21/10/2026.\nTotal a pagar $ 1.234,56. Vence el 15/11/2026.\nPermiso emitido el 21/10/2026: must be used within 12 months of issue.',
});
const started = Date.now();
const result = await new ExtractObligationsUseCase(docs, obligations, llm, new FixedClock(), sequentialIds()).execute(doc.id);
console.log(`modelo ${llm.modelName} · ${((Date.now() - started) / 1000).toFixed(1)} s`, result, (await docs.get(doc.id)).error ?? '');
console.log(JSON.stringify(await obligations.list(), null, 2));

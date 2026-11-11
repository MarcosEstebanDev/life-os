import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ExtractObligationsUseCase } from '../application/extract-obligations.use-case.js';
import { FixedClock, InMemoryDocuments, InMemoryObligations, sequentialIds } from '../application/fakes.js';
import { loadConfig } from '../config.js';
import { OpenAiCompatibleAdapter } from '../infrastructure/llm/openai-compatible.adapter.js';
import { scoreCase, summarize, type CaseScore, type Expected } from './score.js';

/**
 * Corre la extracción real (modelo configurado, sin base ni cola) sobre eval/cases y la compara
 * con eval/expected.json. Uso: npm run eval:extraction -- <etiqueta> [caso ...]
 */
const [label = 'sin-etiqueta', ...only] = process.argv.slice(2);
const root = join(import.meta.dirname, '../../eval');
const config = loadConfig({ DATABASE_URL: '-', REDIS_URL: '-', WATCH_DIR: '-', ...process.env });
const llm = new OpenAiCompatibleAdapter(config.llm);
const expectedByCase = JSON.parse(await readFile(join(root, 'expected.json'), 'utf8')) as Record<string, Expected[]>;
const names = (await readdir(join(root, 'cases')))
  .map((f) => f.replace(/\.txt$/, ''))
  .filter((n) => n in expectedByCase && (only.length === 0 || only.includes(n)));

const mark = (ok: boolean | null) => (ok === null ? '·' : ok ? '✓' : '✗');
const report: Array<{ name: string; seconds: number; error: string | null } & CaseScore> = [];
for (const name of names) {
  const docs = new InMemoryDocuments();
  const obligations = new InMemoryObligations();
  const doc = await docs.create({
    ownerId: 'eval', path: `${name}.txt`, sha256: name, mimeType: 'text/plain', sizeBytes: 0,
    status: 'TEXT_EXTRACTED', error: null, text: await readFile(join(root, 'cases', `${name}.txt`), 'utf8'),
  });
  const started = Date.now();
  await new ExtractObligationsUseCase(docs, obligations, llm, new FixedClock('2026-11-11'), sequentialIds()).execute(doc.id);
  const seconds = Math.round((Date.now() - started) / 1000);
  const score = scoreCase(expectedByCase[name], await obligations.list('eval'));
  const error = (await docs.get(doc.id)).error;
  report.push({ name, seconds, error, ...score });

  console.log(`\n${name} · ${seconds} s${error ? ` · ${error}` : ''}`);
  for (const i of score.items) {
    const p = i.predicted;
    console.log(
      p
        ? `  ${i.expected.label}: tipo ${mark(i.kind)} ${p.kind} · recurrencia ${mark(i.recurrence)} ${p.recurrence} · monto ${mark(i.amount)} ${p.amount ?? '-'}`
        : `  ${i.expected.label}: NO ENCONTRADA`,
    );
  }
  for (const x of score.extra) console.log(`  de más: ${x.title} · ${x.dueDate ?? 'sin fecha'} · ${x.kind}`);
}

const summary = summarize(report);
const pct = (r: { ok: number; of: number }) => `${r.ok}/${r.of}`;
console.log(
  `\n[${label}] ${llm.modelName} · encontradas ${summary.found}/${summary.expected} · de más ${summary.extra}` +
    ` · tipo ${pct(summary.kind)} · recurrencia ${pct(summary.recurrence)} · monto ${pct(summary.amount)}`,
);
await mkdir(join(root, 'results'), { recursive: true });
await writeFile(
  join(root, 'results', `${label}.json`),
  JSON.stringify({ label, model: llm.modelName, summary, cases: report }, null, 2) + '\n',
);

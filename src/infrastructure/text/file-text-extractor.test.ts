import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileTextExtractor } from './file-text-extractor.js';

const extractor = new FileTextExtractor();

test('lee el texto de un PDF', async () => {
  const text = await extractor.extract(join(import.meta.dirname, '../../../test/fixtures/sample.pdf'));
  assert.match(text, /Vence el 15\/11\/2026/);
});

test('lee .txt y .md como utf-8', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'life-os-'));
  const file = join(dir, 'nota.md');
  await writeFile(file, 'Renovación póliza: 15/03/2027', 'utf8');
  assert.equal(await extractor.extract(file), 'Renovación póliza: 15/03/2027');
});

test('soporta sólo pdf, txt y md', () => {
  assert.deepEqual(['.pdf', '.txt', '.md', '.docx', '.png'].map((e) => extractor.supports(e)), [true, true, true, false, false]);
});

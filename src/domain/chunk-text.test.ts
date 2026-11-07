import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkText } from './chunk-text.js';

test('un texto corto es un solo trozo', () => {
  assert.deepEqual(chunkText('hola', 100, 10), ['hola']);
});

test('por defecto los trozos entran en el contexto de 4096 tokens de Ollama', () => {
  const chunks = chunkText('x'.repeat(30_000));
  assert.ok(chunks.every((c) => c.length <= 6_000));
  assert.equal(chunks.slice(1).reduce((n, c) => n + c.length - 300, chunks[0].length), 30_000);
});

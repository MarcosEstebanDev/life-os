import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkText } from './chunk-text.js';

test('un texto corto es un solo trozo', () => {
  assert.deepEqual(chunkText('hola', 100, 10), ['hola']);
});

test('30000 caracteres son 3 trozos que se solapan 500', () => {
  const chunks = chunkText('x'.repeat(30_000));
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 12_000);
  assert.equal(chunks.slice(1).reduce((n, c) => n + c.length - 500, chunks[0].length), 30_000);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeNext } from './safe-next';

test('una ruta interna se respeta', () => {
  assert.equal(safeNext('/review?x=1#a'), '/review?x=1#a');
});

test('cualquier cosa que salga del sitio vuelve al brief', () => {
  const evil = ['https://evil.com', '//evil.com', '/\\evil.com', '/\t/evil.com', '/\n/evil.com', 'javascript:alert(1)', null, ''];
  for (const next of evil) assert.equal(safeNext(next), '/brief', JSON.stringify(next));
});

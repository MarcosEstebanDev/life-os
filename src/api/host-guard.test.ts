import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedHost } from './host-guard.js';

test('acepta localhost y 127.0.0.1 en el puerto de la API', () => {
  assert.equal(isAllowedHost('127.0.0.1:3010', 3010), true);
  assert.equal(isAllowedHost('localhost:3010', 3010), true);
});

test('rechaza un dominio ajeno que resuelve a 127.0.0.1 (DNS rebinding)', () => {
  assert.equal(isAllowedHost('evil.example.com:3010', 3010), false);
  assert.equal(isAllowedHost(undefined, 3010), false);
  assert.equal(isAllowedHost('localhost:9999', 3010), false);
});

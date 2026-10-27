import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedHost, isAllowedOrigin } from './host-guard.js';

test('acepta localhost y 127.0.0.1 en el puerto de la API', () => {
  assert.equal(isAllowedHost('127.0.0.1:3010', 3010), true);
  assert.equal(isAllowedHost('localhost:3010', 3010), true);
});

test('rechaza un dominio ajeno que resuelve a 127.0.0.1 (DNS rebinding)', () => {
  assert.equal(isAllowedHost('evil.example.com:3010', 3010), false);
  assert.equal(isAllowedHost(undefined, 3010), false);
  assert.equal(isAllowedHost('localhost:9999', 3010), false);
});

const WEB = ['http://localhost:3011'];

test('un POST desde la web pasa; desde otro sitio no', () => {
  assert.equal(isAllowedOrigin('POST', 'http://localhost:3011', WEB), true);
  assert.equal(isAllowedOrigin('POST', 'https://evil.example.com', WEB), false);
  assert.equal(isAllowedOrigin('DELETE', 'null', WEB), false);
});

test('las lecturas no se chequean', () => {
  assert.equal(isAllowedOrigin('GET', 'https://evil.example.com', WEB), true);
});

test('un pedido que modifica sin Origin se rechaza: en localhost SameSite no separa puertos', () => {
  assert.equal(isAllowedOrigin('POST', undefined, WEB), false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seriesKey } from './series-key.js';

test('la misma serie con distinto formato da la misma clave', () => {
  const a = seriesKey({ counterparty: 'Sancor Seguros', kind: 'RENEWAL', title: 'Renovación póliza auto' });
  const b = seriesKey({ counterparty: 'sancor  seguros', kind: 'RENEWAL', title: 'renovacion poliza auto' });
  assert.equal(a, b);
});

test('distinto tipo es otra serie', () => {
  const a = seriesKey({ counterparty: 'Sancor', kind: 'RENEWAL', title: 'Póliza' });
  const b = seriesKey({ counterparty: 'Sancor', kind: 'PAYMENT', title: 'Póliza' });
  assert.notEqual(a, b);
});

test('sin contraparte igual arma clave', () => {
  assert.equal(seriesKey({ counterparty: null, kind: 'DEADLINE', title: 'Usar el permiso' }), '|DEADLINE|usar el permiso');
});

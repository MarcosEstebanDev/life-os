import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDueDate } from './resolve-due-date.js';

test('una fecha absoluta se usa tal cual', () => {
  assert.equal(resolveDueDate({ type: 'absolute', date: '2027-03-15' }, null), '2027-03-15');
});

test('un plazo relativo se cuenta desde la fecha del documento', () => {
  assert.equal(resolveDueDate({ type: 'relative', months: 12, days: 0 }, '2026-10-21'), '2027-10-21');
  assert.equal(resolveDueDate({ type: 'relative', months: 0, days: 30 }, '2026-10-21'), '2026-11-20');
});

test('un plazo relativo sin fecha de documento queda sin fecha', () => {
  assert.equal(resolveDueDate({ type: 'relative', months: 12, days: 0 }, null), null);
});

test('desconocido queda sin fecha', () => {
  assert.equal(resolveDueDate({ type: 'unknown' }, '2026-10-21'), null);
});

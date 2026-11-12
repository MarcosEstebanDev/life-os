import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SystemClock } from './system-clock.js';

test('hoy es la fecha de la zona configurada, no la de UTC', () => {
  // 02:00 UTC del 28 son las 23:00 del 27 en una zona UTC-3.
  const clock = new SystemClock('America/Sao_Paulo', () => new Date('2026-10-28T02:00:00Z'));
  assert.equal(clock.today(), '2026-10-27');
});

test('en UTC el mismo instante ya es el 28', () => {
  const clock = new SystemClock('UTC', () => new Date('2026-10-28T02:00:00Z'));
  assert.equal(clock.today(), '2026-10-28');
});

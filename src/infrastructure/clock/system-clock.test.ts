import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SystemClock } from './system-clock.js';

test('hoy es la fecha de la zona local, no la de UTC', () => {
  // 02:00 UTC del 28 son las 23:00 del 27 en la zona local (UTC-3).
  const clock = new SystemClock(() => new Date('2026-10-28T02:00:00Z'));
  assert.equal(clock.today(), '2026-10-27');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, addMonths, daysBetween } from './dates.js';

test('sumar un mes al 31 de enero cae el último día de febrero', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
});

test('sumar 12 meses conserva el día', () => {
  assert.equal(addMonths('2026-03-15', 12), '2027-03-15');
});

test('addDays cruza meses y años', () => {
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('daysBetween es b menos a, con signo', () => {
  assert.equal(daysBetween('2026-10-27', '2026-11-03'), 7);
  assert.equal(daysBetween('2026-10-27', '2026-10-26'), -1);
});

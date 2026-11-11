import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCase, summarize, type Expected, type Predicted } from './score.js';

const p = (o: Partial<Predicted>): Predicted => ({
  title: 'x', kind: 'PAYMENT', dueDate: null, recurrence: 'NONE', amount: null, counterparty: null, ...o,
});

test('empareja por fecha y prefiere el que coincide en tipo y monto', () => {
  const expected: Expected[] = [
    { label: 'turno', due: ['2026-11-19'], kind: ['DEADLINE'], recurrence: 'NONE' },
    { label: 'arancel', due: ['2026-11-19', null], kind: ['PAYMENT'], recurrence: 'NONE', amount: '75000.00' },
  ];
  const r = scoreCase(expected, [
    p({ title: 'pago', dueDate: '2026-11-19', amount: '75000.00' }),
    p({ title: 'turno', kind: 'DEADLINE', dueDate: '2026-11-19' }),
  ]);
  assert.deepEqual(r.items.map((i) => i.predicted?.title), ['turno', 'pago']);
  assert.equal(r.extra.length, 0);
});

test('cuenta tipo, recurrencia y monto por separado, y lo que sobra', () => {
  const expected: Expected[] = [{ label: 'alquiler', due: ['2026-12-10'], kind: ['PAYMENT'], recurrence: 'MONTHLY', amount: '520000.00' }];
  const r = scoreCase(expected, [p({ dueDate: '2026-12-10', amount: '520000.00' }), p({ dueDate: '2027-01-01' })]);
  assert.deepEqual(
    { kind: r.items[0].kind, recurrence: r.items[0].recurrence, amount: r.items[0].amount },
    { kind: true, recurrence: false, amount: true },
  );
  assert.equal(r.extra.length, 1);
});

test('lo no encontrado cuenta como fallo en todo y el resumen da proporciones', () => {
  const expected: Expected[] = [
    { label: 'a', due: ['2026-12-10'], kind: ['PAYMENT'], recurrence: 'MONTHLY' },
    { label: 'b', due: ['2026-12-20'], kind: ['PAYMENT'], recurrence: 'NONE', amount: '10.00' },
  ];
  const s = summarize([scoreCase(expected, [p({ dueDate: '2026-12-10', recurrence: 'MONTHLY' })])]);
  assert.deepEqual(s, {
    expected: 2, found: 1, extra: 0,
    kind: { ok: 1, of: 2 }, recurrence: { ok: 1, of: 2 }, amount: { ok: 0, of: 1 },
  });
});

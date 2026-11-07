import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideDuplicate } from './dedupe.js';
import type { Obligation } from './obligation.js';

const KEY = 'banco|PAYMENT|pagar tarjeta';

function existing(overrides: Partial<Obligation>): Obligation {
  return {
    id: 'x', title: 'Pagar tarjeta', kind: 'PAYMENT', dueDate: '2026-11-30', recurrence: 'MONTHLY',
    amount: '1000.00', currency: 'ARS', counterparty: 'Banco', sourceDocumentId: 'd0', evidence: [],
    confidence: 1, status: 'ACTIVE', seriesKey: KEY, possibleUpdateOf: null, doneAt: null, ...overrides,
  };
}

test('el resumen que repite la recurrente auto-generada se adjunta', () => {
  const d = decideDuplicate({ seriesKey: KEY, dueDate: '2026-12-01', amount: '1000.00' }, [existing({ id: 'a' })]);
  assert.deepEqual(d, { action: 'attach', to: 'a' });
});

test('monto sin dato en un lado igual se adjunta', () => {
  const d = decideDuplicate({ seriesKey: KEY, dueDate: '2026-11-30', amount: null }, [existing({ id: 'a' })]);
  assert.deepEqual(d, { action: 'attach', to: 'a' });
});

test('se adjunta a la de fecha más cercana', () => {
  const d = decideDuplicate({ seriesKey: KEY, dueDate: '2026-11-29', amount: null }, [
    existing({ id: 'lejos', dueDate: '2026-12-02' }),
    existing({ id: 'cerca', dueDate: '2026-11-30' }),
  ]);
  assert.deepEqual(d, { action: 'attach', to: 'cerca' });
});

test('misma fecha y monto distinto es posible actualización de la activa', () => {
  const d = decideDuplicate({ seriesKey: KEY, dueDate: '2026-12-02', amount: '1500.00' }, [existing({ id: 'a' })]);
  assert.deepEqual(d, { action: 'possibleUpdate', of: 'a' });
});

test('el mes siguiente de una recurrente ya pagada es una ocurrencia nueva', () => {
  const d = decideDuplicate({ seriesKey: KEY, dueDate: '2026-12-31', amount: '1000.00' }, [existing({ id: 'a', status: 'DONE' })]);
  assert.deepEqual(d, { action: 'new' });
});

test('el mes siguiente de una recurrente activa también es nueva', () => {
  const d = decideDuplicate({ seriesKey: KEY, dueDate: '2026-12-31', amount: '1000.00' }, [existing({ id: 'a' })]);
  assert.deepEqual(d, { action: 'new' });
});

test('un plazo único que cambió de fecha es posible actualización', () => {
  const d = decideDuplicate({ seriesKey: KEY, dueDate: '2027-02-15', amount: null }, [
    existing({ id: 'a', recurrence: 'NONE', dueDate: '2027-01-10' }),
  ]);
  assert.deepEqual(d, { action: 'possibleUpdate', of: 'a' });
});

test('sin fecha y con una activa de la misma serie es posible actualización', () => {
  const d = decideDuplicate({ seriesKey: KEY, dueDate: null, amount: null }, [existing({ id: 'a' })]);
  assert.deepEqual(d, { action: 'possibleUpdate', of: 'a' });
});

test('sin fecha y con una propuesta sin fecha de la misma serie se adjunta a esa', () => {
  const d = decideDuplicate({ seriesKey: KEY, dueDate: null, amount: null }, [
    existing({ id: 'p', status: 'PROPOSED', dueDate: null }),
    existing({ id: 'a' }),
  ]);
  assert.deepEqual(d, { action: 'attach', to: 'p' });
});

test('otra serie es nueva', () => {
  const d = decideDuplicate({ seriesKey: 'otra', dueDate: '2026-11-30', amount: null }, [existing({ id: 'a' })]);
  assert.deepEqual(d, { action: 'new' });
});

test('las descartadas no cuentan', () => {
  const d = decideDuplicate({ seriesKey: KEY, dueDate: '2026-11-30', amount: null }, [existing({ id: 'a', status: 'DISMISSED' })]);
  assert.deepEqual(d, { action: 'new' });
});

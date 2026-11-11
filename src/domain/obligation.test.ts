import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activate, complete, dismiss, ObligationError, type Obligation } from './obligation.js';

function obligation(overrides: Partial<Obligation> = {}): Obligation {
  return {
    id: 'o1',
    title: 'Pagar tarjeta',
    kind: 'PAYMENT',
    dueDate: '2026-10-31',
    recurrence: 'NONE',
    amount: '1234.56',
    currency: 'ARS',
    counterparty: 'Banco',
    sourceDocumentId: 'd1',
    evidence: ['vence el 31/10/2026'],
    confidence: 0.9,
    status: 'PROPOSED',
    seriesKey: 'banco|PAYMENT|pagar tarjeta',
    possibleUpdateOf: null, ownerId: 'u1',
    doneAt: null,
    ...overrides,
  };
}

test('no se puede activar una obligación sin fecha', () => {
  assert.throws(() => activate(obligation({ dueDate: null })), ObligationError);
});

test('activar una propuesta la deja ACTIVE', () => {
  assert.equal(activate(obligation()).status, 'ACTIVE');
});

test('no se puede activar algo que ya está activo', () => {
  assert.throws(() => activate(obligation({ status: 'ACTIVE' })), ObligationError);
});

test('descartar sólo aplica a propuestas', () => {
  assert.equal(dismiss(obligation()).status, 'DISMISSED');
  assert.throws(() => dismiss(obligation({ status: 'ACTIVE' })), ObligationError);
});

test('completar una mensual genera la siguiente ya activa, clampeada a fin de mes', () => {
  const { done, next } = complete(obligation({ status: 'ACTIVE', recurrence: 'MONTHLY' }), '2026-10-30T12:00:00Z', 'o2');
  assert.equal(done.status, 'DONE');
  assert.equal(done.doneAt, '2026-10-30T12:00:00Z');
  assert.ok(next);
  assert.equal(next.id, 'o2');
  assert.equal(next.dueDate, '2026-11-30');
  assert.equal(next.status, 'ACTIVE');
  assert.equal(next.seriesKey, done.seriesKey);
  assert.equal(next.doneAt, null);
});

test('completar una trimestral suma tres meses, clampeada a fin de mes', () => {
  const { next } = complete(obligation({ status: 'ACTIVE', recurrence: 'QUARTERLY', dueDate: '2026-11-30' }), '2026-11-30T12:00:00Z', 'o2');
  assert.equal(next?.dueDate, '2027-02-28');
});

test('completar una anual suma un año', () => {
  const { next } = complete(obligation({ status: 'ACTIVE', recurrence: 'YEARLY' }), '2026-10-30T12:00:00Z', 'o2');
  assert.equal(next?.dueDate, '2027-10-31');
});

test('completar una sin recurrencia no genera siguiente', () => {
  const { next } = complete(obligation({ status: 'ACTIVE' }), '2026-10-30T12:00:00Z', 'o2');
  assert.equal(next, null);
});

test('no se puede completar una propuesta', () => {
  assert.throws(() => complete(obligation(), '2026-10-30T12:00:00Z', 'o2'), ObligationError);
});

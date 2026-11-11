import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractionResultSchema } from './extraction-schema.js';

const valid = {
  documentDate: { date: '2026-10-21', evidence: 'emitida el 21/10/2026' },
  obligations: [
    {
      title: 'Usar el permiso',
      kind: 'DEADLINE',
      due: { type: 'relative', months: 12, days: 0 },
      recurrence: 'NONE',
      amount: null,
      currency: null,
      counterparty: 'Oficina de permisos',
      evidence: 'must travel within 12 months',
      confidence: 0.8,
    },
  ],
};

const withObligation = (patch: Record<string, unknown>) => ({ ...valid, obligations: [{ ...valid.obligations[0], ...patch }] });

test('acepta una extracción válida', () => {
  assert.equal(extractionResultSchema.safeParse(valid).success, true);
});

test('acepta la recurrencia trimestral y rechaza la bimestral', () => {
  assert.equal(extractionResultSchema.safeParse(withObligation({ recurrence: 'QUARTERLY' })).success, true);
  assert.equal(extractionResultSchema.safeParse(withObligation({ recurrence: 'BIMONTHLY' })).success, false);
});

test('rechaza montos en formato local en vez de número', () => {
  assert.equal(extractionResultSchema.safeParse(withObligation({ amount: '1.234,56' })).success, false);
});

test('rechaza fechas que no son ISO', () => {
  assert.equal(extractionResultSchema.safeParse(withObligation({ due: { type: 'absolute', date: '15/03/2027' } })).success, false);
});

test('rechaza fechas con formato ISO pero inexistentes', () => {
  assert.equal(extractionResultSchema.safeParse(withObligation({ due: { type: 'absolute', date: '2027-02-30' } })).success, false);
  assert.equal(extractionResultSchema.safeParse({ ...valid, documentDate: { date: '2026-13-45', evidence: 'x' } }).success, false);
});

test('rechaza montos negativos o absurdos (un CBU tomado como monto)', () => {
  assert.equal(extractionResultSchema.safeParse(withObligation({ amount: -5 })).success, false);
  assert.equal(extractionResultSchema.safeParse(withObligation({ amount: 2850590940090418135201 })).success, false);
});

test('rechaza confianza fuera de 0..1', () => {
  assert.equal(extractionResultSchema.safeParse(withObligation({ confidence: 1.5 })).success, false);
});

test('rechaza monedas que no son ISO 4217', () => {
  assert.equal(extractionResultSchema.safeParse(withObligation({ currency: 'pesos' })).success, false);
});

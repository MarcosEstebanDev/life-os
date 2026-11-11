import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExtractObligationsUseCase } from './extract-obligations.use-case.js';
import { FakeLlm, FixedClock, InMemoryDocuments, InMemoryObligations, sequentialIds } from './fakes.js';
import type { Obligation } from '../domain/obligation.js';

const TEXT = [
  'Banco Ejemplo - Resumen de tarjeta.',
  'Fecha de emisión: 21/10/2026.',
  'Total a pagar $ 1.234,56. Vence el 15/11/2026.',
  'Permiso emitido; must travel within 12 months of issue.',
].join('\n');

const SERIES = 'banco ejemplo|PAYMENT|pagar tarjeta';

function payment(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Pagar tarjeta',
    kind: 'PAYMENT',
    due: { type: 'absolute', date: '2026-11-15' },
    recurrence: 'MONTHLY',
    amount: 1234.56,
    currency: 'ARS',
    counterparty: 'Banco Ejemplo',
    evidence: 'Vence el 15/11/2026',
    confidence: 0.9,
    ...overrides,
  };
}

function visa(overrides: Record<string, unknown> = {}) {
  return payment({
    title: 'Usar el permiso', kind: 'DEADLINE', recurrence: 'NONE', amount: null, currency: null, counterparty: null,
    due: { type: 'relative', months: 12, days: 0 }, evidence: 'must travel within 12 months of issue', ...overrides,
  });
}

const ISSUED = { date: '2026-10-21', evidence: 'Fecha de emisión: 21/10/2026' };
const answer = (obligations: unknown[], documentDate: unknown = ISSUED) => JSON.stringify({ documentDate, obligations });

function activeCard(overrides: Partial<Obligation> = {}): Obligation {
  return {
    id: 'vieja', title: 'Pagar tarjeta', kind: 'PAYMENT', dueDate: '2026-11-14', recurrence: 'MONTHLY', amount: '1234.56',
    currency: 'ARS', counterparty: 'Banco Ejemplo', sourceDocumentId: 'otro', evidence: ['antes'], confidence: 1,
    status: 'ACTIVE', seriesKey: SERIES, possibleUpdateOf: null, ownerId: 'u1', doneAt: null, ...overrides,
  };
}

async function setup(responses: string[], text = TEXT) {
  const docs = new InMemoryDocuments();
  const obligations = new InMemoryObligations();
  const llm = new FakeLlm(responses);
  const doc = await docs.create({ ownerId: 'u1',
    path: 'C:/papeles/resumen.pdf', sha256: 'abc', mimeType: 'application/pdf', sizeBytes: 10,
    status: 'TEXT_EXTRACTED', error: null, text,
  });
  const useCase = new ExtractObligationsUseCase(docs, obligations, llm, new FixedClock(), sequentialIds());
  return { docs, obligations, llm, doc, useCase };
}

test('una respuesta válida deja una propuesta con evidencia y serie', async () => {
  const { useCase, obligations, docs, doc } = await setup([answer([payment()])]);
  const result = await useCase.execute(doc.id);
  assert.deepEqual(result, { proposed: 1, attached: 0, discarded: 0 });
  const [o] = await obligations.list('u1');
  assert.equal(o.status, 'PROPOSED');
  assert.equal(o.dueDate, '2026-11-15');
  assert.equal(o.amount, '1234.56');
  assert.deepEqual(o.evidence, ['Vence el 15/11/2026']);
  assert.equal(o.seriesKey, SERIES);
  assert.equal(o.sourceDocumentId, doc.id);
  assert.equal((await docs.get(doc.id)).status, 'PROCESSED');
});

test('el prompt lleva la fecha de hoy y el texto', async () => {
  const { useCase, llm, doc } = await setup([answer([payment()])]);
  await useCase.execute(doc.id);
  assert.match(llm.calls[0].system, /2026-10-27/);
  assert.match(llm.calls[0].user, /Vence el 15\/11\/2026/);
});

test('una obligación con evidencia inventada se descarta', async () => {
  const { useCase, obligations, doc } = await setup([answer([payment({ evidence: 'Vence el 20/12/2026 sin falta' })])]);
  const result = await useCase.execute(doc.id);
  assert.deepEqual(result, { proposed: 0, attached: 0, discarded: 1 });
  assert.equal((await obligations.list('u1')).length, 0);
});

test('si la primera respuesta es inválida se reintenta una vez con el error', async () => {
  const { useCase, obligations, llm, doc } = await setup(['{ esto no es json', answer([payment()])]);
  await useCase.execute(doc.id);
  assert.equal(llm.calls.length, 2);
  assert.match(llm.calls[1].user, /inválida/);
  assert.equal((await obligations.list('u1')).length, 1);
});

test('dos respuestas inválidas dejan el documento FAILED', async () => {
  const { useCase, docs, doc } = await setup([answer([payment({ amount: '1.234,56' })]), '[]']);
  await useCase.execute(doc.id);
  const d = await docs.get(doc.id);
  assert.equal(d.status, 'FAILED');
  assert.match(d.error ?? '', /^respuesta del LLM inválida/);
});

test('una obligación inválida tras el reintento se descarta sola: las demás entran y el documento avisa', async () => {
  // Caso real: en una planilla con "bimestral" el modelo insistió con BIMONTHLY y se perdía todo el documento.
  const bimestral = visa({ recurrence: 'BIMONTHLY' });
  const { useCase, obligations, docs, llm, doc } = await setup([answer([payment(), bimestral]), answer([payment(), bimestral])]);
  const result = await useCase.execute(doc.id);
  assert.equal(llm.calls.length, 2);
  assert.deepEqual(result, { proposed: 1, attached: 0, discarded: 1 });
  assert.equal((await obligations.list('u1'))[0].title, 'Pagar tarjeta');
  const d = await docs.get(doc.id);
  assert.equal(d.status, 'PROCESSED');
  assert.match(d.error ?? '', /^obligaciones inválidas 1: .*recurrence/);
});

test('un plazo relativo se cuenta desde la fecha del documento', async () => {
  const { useCase, obligations, doc } = await setup([answer([visa()])]);
  await useCase.execute(doc.id);
  assert.equal((await obligations.list('u1'))[0].dueDate, '2027-10-21');
});

test('una fecha de documento sin evidencia no se usa', async () => {
  const { useCase, obligations, doc } = await setup([answer([visa()], { date: '2026-10-21', evidence: 'issued on 21 October 2026' })]);
  await useCase.execute(doc.id);
  assert.equal((await obligations.list('u1'))[0].dueDate, null);
});

test('la misma obligación en dos trozos queda una sola, con las dos evidencias', async () => {
  const long = `${TEXT}\n${'relleno '.repeat(1_000)}\nRecordatorio: Total a pagar $ 1.234,56 hasta el 15/11/2026.`;
  const second = payment({ evidence: 'Total a pagar $ 1.234,56 hasta el 15/11/2026' });
  const { useCase, obligations, doc } = await setup([answer([payment()]), answer([second])], long);
  const result = await useCase.execute(doc.id);
  assert.deepEqual(result, { proposed: 1, attached: 1, discarded: 0 });
  assert.equal((await obligations.list('u1'))[0].evidence.length, 2);
});

test('si ya existe la activa de la misma serie se le suma evidencia', async () => {
  const { useCase, obligations, doc } = await setup([answer([payment()])]);
  await obligations.insert(activeCard());
  const result = await useCase.execute(doc.id);
  assert.deepEqual(result, { proposed: 0, attached: 1, discarded: 0 });
  assert.deepEqual((await obligations.get('vieja')).evidence, ['antes', 'Vence el 15/11/2026']);
});

test('un monto que no aparece en el texto no se guarda: lo completo al revisar', async () => {
  const { useCase, obligations, doc } = await setup([answer([payment({ amount: 1.234 })])]);
  await useCase.execute(doc.id);
  assert.equal((await obligations.list('u1'))[0].amount, null);
});

test('una fecha absoluta que no aparece en el texto (o leída mm/dd) no se guarda', async () => {
  const { useCase, obligations, doc } = await setup([answer([payment({ due: { type: 'absolute', date: '2026-12-20' } })])]);
  await useCase.execute(doc.id);
  assert.equal((await obligations.list('u1'))[0].dueDate, null);
});

test('una fecha de documento que no aparece en el texto no se usa para plazos relativos', async () => {
  const { useCase, obligations, doc } = await setup([answer([visa()], { date: '2026-10-12', evidence: 'Fecha de emisión: 21/10/2026' })]);
  await useCase.execute(doc.id);
  assert.equal((await obligations.list('u1'))[0].dueDate, null);
});

test('si un trozo falla dos veces, se usan los demás y el documento avisa', async () => {
  const long = `${TEXT}\n${'relleno '.repeat(1_000)}`;
  const { useCase, obligations, docs, doc } = await setup([answer([payment()]), 'roto', 'roto'], long);
  await useCase.execute(doc.id);
  assert.equal((await obligations.list('u1')).length, 1);
  const d = await docs.get(doc.id);
  assert.equal(d.status, 'PROCESSED');
  assert.match(d.error ?? '', /^trozos inválidos 1\/2/);
});

test('procesar dos veces el mismo documento no duplica propuestas ni evidencia', async () => {
  const { useCase, obligations, doc } = await setup([answer([payment()]), answer([payment()])]);
  await obligations.insert(activeCard({ id: 'otra', dueDate: '2027-06-01', seriesKey: 'x' }));
  await useCase.execute(doc.id);
  await useCase.execute(doc.id);
  const proposed = await obligations.list('u1', { status: 'PROPOSED' });
  assert.equal(proposed.length, 1);
  assert.deepEqual(proposed[0].evidence, ['Vence el 15/11/2026']);
});

test('adjuntar la misma evidencia dos veces no la repite', async () => {
  const { useCase, obligations, doc } = await setup([answer([payment()])]);
  await obligations.insert(activeCard({ evidence: ['Vence el 15/11/2026'] }));
  await useCase.execute(doc.id);
  assert.deepEqual((await obligations.get('vieja')).evidence, ['Vence el 15/11/2026']);
});

test('un monto distinto para la misma fecha queda como posible actualización', async () => {
  const { useCase, obligations, doc } = await setup([answer([payment({ amount: 999 })])], `${TEXT}\nAjuste: total $ 999,00.`);
  await obligations.insert(activeCard({ dueDate: '2026-11-15' }));
  await useCase.execute(doc.id);
  const proposed = await obligations.list('u1', { status: 'PROPOSED' });
  assert.equal(proposed.length, 1);
  assert.equal(proposed[0].possibleUpdateOf, 'vieja');
});

test('una fecha absoluta que está en el texto pero no en su evidencia no se guarda', async () => {
  // Resumen real: el modelo citó "Pago mínimo" y tomó el "Próximo cierre" como vencimiento.
  const text = 'Fecha de cierre: 29/10/2026 Próximo cierre: 26/11/2026\nFecha de vencimiento: 10/11/2026\nPago mínimo: $ 45.000,00';
  const minimum = payment({ due: { type: 'absolute', date: '2026-11-26' }, amount: 45000, evidence: 'Pago mínimo: $ 45.000,00' });
  const { useCase, obligations, doc } = await setup([answer([minimum], null)], text);
  await useCase.execute(doc.id);
  const [o] = await obligations.list('u1');
  assert.equal(o.dueDate, null);
  assert.equal(o.amount, '45000.00');
});

test('el prompt pide que la evidencia incluya la fecha y menciona turnos', async () => {
  const { useCase, llm, doc } = await setup([answer([payment()])]);
  await useCase.execute(doc.id);
  assert.match(llm.calls[0].system, /evidencia[^\n]*fecha/i);
  assert.match(llm.calls[0].system, /turno/i);
});

test('un plazo relativo que no está escrito en la evidencia no se calcula', async () => {
  // Póliza real: "debitado el día 5 de cada mes" salió como 1 mes y 5 días desde la emisión.
  const text = `${TEXT}\nPremio mensual: $ 38.900,00, debitado el día 5 de cada mes.`;
  const premium = payment({ due: { type: 'relative', months: 1, days: 5 }, amount: 38900, evidence: 'Premio mensual: $ 38.900,00, debitado el día 5 de cada mes.' });
  const { useCase, obligations, doc } = await setup([answer([premium])], text);
  await useCase.execute(doc.id);
  const [o] = await obligations.list('u1');
  assert.equal(o.dueDate, null);
  assert.equal(o.amount, '38900.00');
});

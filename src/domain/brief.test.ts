import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBrief } from './brief.js';
import type { Obligation } from './obligation.js';

function o(id: string, dueDate: string | null, status: Obligation['status'] = 'ACTIVE'): Obligation {
  return {
    id, title: id, kind: 'PAYMENT', dueDate, recurrence: 'NONE', amount: null, currency: null, counterparty: null,
    sourceDocumentId: 'd', evidence: [], confidence: 1, status, seriesKey: id, possibleUpdateOf: null, ownerId: 'u1', doneAt: null,
  };
}

const TODAY = '2026-10-27';
const ids = (list: Obligation[]) => list.map((x) => x.id);

test('reparte las activas por ventana', () => {
  const brief = computeBrief(
    [o('ayer', '2026-10-26'), o('hoy', '2026-10-27'), o('en7', '2026-11-03'), o('en8', '2026-11-04'), o('en30', '2026-11-26'), o('en31', '2026-11-27')],
    TODAY,
  );
  assert.equal(brief.today, TODAY);
  assert.deepEqual(ids(brief.overdue), ['ayer']);
  assert.deepEqual(ids(brief.next7), ['hoy', 'en7']);
  assert.deepEqual(ids(brief.next30), ['en8', 'en30']);
});

test('hechas y descartadas nunca aparecen', () => {
  const brief = computeBrief([o('hecha', '2026-10-20', 'DONE'), o('descartada', '2026-10-28', 'DISMISSED')], TODAY);
  assert.equal(brief.overdue.length + brief.next7.length + brief.next30.length + brief.toReview.length, 0);
});

test('las propuestas van a revisar, ordenadas y sin fecha al final', () => {
  const brief = computeBrief([o('sinFecha', null, 'PROPOSED'), o('tarde', '2026-12-01', 'PROPOSED'), o('pronto', '2026-10-30', 'PROPOSED')], TODAY);
  assert.deepEqual(ids(brief.toReview), ['pronto', 'tarde', 'sinFecha']);
});

test('cada lista ordenada por vencimiento', () => {
  const brief = computeBrief([o('b', '2026-10-25'), o('a', '2026-10-01')], TODAY);
  assert.deepEqual(ids(brief.overdue), ['a', 'b']);
});

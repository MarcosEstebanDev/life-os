import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundError } from '../domain/errors.js';
import type { Obligation } from '../domain/obligation.js';
import { CompleteObligationUseCase } from './complete-obligation.use-case.js';
import { ExtractObligationsUseCase } from './extract-obligations.use-case.js';
import { GetBriefUseCase } from './get-brief.use-case.js';
import { ReprocessDocumentUseCase } from './reprocess-document.use-case.js';
import { ReviewObligationUseCase } from './review-obligation.use-case.js';
import { FakeLlm, FixedClock, InMemoryDocuments, InMemoryObligations, RecordingQueue, sequentialIds } from './fakes.js';

/** Cada caso de uso, intentado por "intruso" sobre datos de "duenia": siempre 404, nunca efecto. */

function obligation(overrides: Partial<Obligation> = {}): Obligation {
  return {
    id: 'o1', ownerId: 'duenia', title: 'Pagar tarjeta', kind: 'PAYMENT', dueDate: '2026-11-15', recurrence: 'MONTHLY',
    amount: '100.00', currency: 'ARS', counterparty: 'Banco', sourceDocumentId: 'd', evidence: ['x'], confidence: 1,
    status: 'PROPOSED', seriesKey: 'banco|PAYMENT|pagar tarjeta', possibleUpdateOf: null, doneAt: null, ...overrides,
  };
}

async function repoWith(...items: Obligation[]) {
  const repo = new InMemoryObligations();
  for (const o of items) await repo.insert(o);
  return repo;
}

const notFound = (e: unknown) => e instanceof NotFoundError;

test('no se puede aceptar, descartar ni completar una obligación ajena', async () => {
  const repo = await repoWith(obligation(), obligation({ id: 'o2', status: 'ACTIVE' }));
  const review = new ReviewObligationUseCase(repo);
  await assert.rejects(review.accept('intruso', 'o1'), notFound);
  await assert.rejects(review.dismiss('intruso', 'o1'), notFound);
  await assert.rejects(new CompleteObligationUseCase(repo, new FixedClock(), sequentialIds()).execute('intruso', 'o2'), notFound);
  assert.equal((await repo.get('o1')).status, 'PROPOSED');
  assert.equal((await repo.get('o2')).status, 'ACTIVE');
});

test('fusionar no puede tocar una obligación de otro usuario', async () => {
  const repo = await repoWith(
    obligation({ id: 'ajena', status: 'ACTIVE' }),
    obligation({ id: 'mia', ownerId: 'intruso', possibleUpdateOf: 'ajena', dueDate: '2030-01-01' }),
  );
  await assert.rejects(new ReviewObligationUseCase(repo).merge('intruso', 'mia'), notFound);
  assert.equal((await repo.get('ajena')).dueDate, '2026-11-15');
});

test('el brief sólo muestra lo propio', async () => {
  const repo = await repoWith(obligation({ id: 'a', status: 'ACTIVE' }), obligation({ id: 'b', ownerId: 'otra', status: 'ACTIVE' }));
  const brief = await new GetBriefUseCase(repo, new FixedClock()).execute('duenia');
  assert.deepEqual(brief.next30.map((o) => o.id), ['a']);
});

test('no se puede reprocesar un documento ajeno', async () => {
  const docs = new InMemoryDocuments();
  const queue = new RecordingQueue();
  const doc = await docs.create({ ownerId: 'duenia', path: 'a.pdf', sha256: 'h', mimeType: 'application/pdf', sizeBytes: 1, status: 'PROCESSED', error: null, text: 't' });
  await assert.rejects(new ReprocessDocumentUseCase(docs, new InMemoryObligations(), queue).execute('intruso', doc.id), notFound);
  assert.equal(queue.jobs.length, 0);
});

test('la extracción asigna el dueño del documento y no deduplica contra otro usuario', async () => {
  const docs = new InMemoryDocuments();
  const repo = await repoWith(obligation({ id: 'ajena', ownerId: 'otra', status: 'ACTIVE', seriesKey: 'banco|PAYMENT|pagar tarjeta' }));
  const doc = await docs.create({
    ownerId: 'duenia', path: 'a.pdf', sha256: 'h', mimeType: 'application/pdf', sizeBytes: 1, status: 'TEXT_EXTRACTED', error: null,
    text: 'Banco - Pagar tarjeta. Total $ 100,00. Vence el 15/11/2026.',
  });
  const llm = new FakeLlm([
    JSON.stringify({
      documentDate: null,
      obligations: [{ title: 'Pagar tarjeta', kind: 'PAYMENT', due: { type: 'absolute', date: '2026-11-15' }, recurrence: 'MONTHLY', amount: 100, currency: 'ARS', counterparty: 'Banco', evidence: 'Vence el 15/11/2026', confidence: 1 }],
    }),
  ]);
  const result = await new ExtractObligationsUseCase(docs, repo, llm, new FixedClock(), sequentialIds('n')).execute(doc.id);
  assert.deepEqual(result, { proposed: 1, attached: 0, discarded: 0 });
  assert.equal((await repo.get('n1')).ownerId, 'duenia');
  assert.deepEqual((await repo.get('ajena')).evidence, ['x']);
});

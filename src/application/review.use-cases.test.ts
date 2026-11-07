import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReviewObligationUseCase } from './review-obligation.use-case.js';
import { CompleteObligationUseCase } from './complete-obligation.use-case.js';
import { GetBriefUseCase } from './get-brief.use-case.js';
import { FixedClock, InMemoryObligations, sequentialIds } from './fakes.js';
import { ObligationError, type Obligation } from '../domain/obligation.js';

function proposal(overrides: Partial<Obligation> = {}): Obligation {
  return {
    id: 'p', title: 'Pagar tarjeta', kind: 'PAYMENT', dueDate: null, recurrence: 'MONTHLY', amount: '100.00', currency: 'ARS',
    counterparty: 'Banco', sourceDocumentId: 'd', evidence: ['nueva'], confidence: 0.8, status: 'PROPOSED',
    seriesKey: 'banco|PAYMENT|pagar tarjeta', possibleUpdateOf: null, ownerId: 'u1', doneAt: null, ...overrides,
  };
}

async function repoWith(...items: Obligation[]) {
  const repo = new InMemoryObligations();
  for (const o of items) await repo.insert(o);
  return repo;
}

test('aceptar sin fecha falla', async () => {
  const repo = await repoWith(proposal());
  await assert.rejects(new ReviewObligationUseCase(repo).accept('u1', 'p'), ObligationError);
});

test('aceptar con la fecha editada la activa y recalcula la serie', async () => {
  const repo = await repoWith(proposal());
  await new ReviewObligationUseCase(repo).accept('u1', 'p', { dueDate: '2026-11-15', counterparty: 'Banco Nación' });
  const o = await repo.get('p');
  assert.equal(o.status, 'ACTIVE');
  assert.equal(o.dueDate, '2026-11-15');
  assert.equal(o.seriesKey, 'banco nacion|PAYMENT|pagar tarjeta');
});

test('descartar la deja DISMISSED', async () => {
  const repo = await repoWith(proposal());
  await new ReviewObligationUseCase(repo).dismiss('u1', 'p');
  assert.equal((await repo.get('p')).status, 'DISMISSED');
});

test('fusionar pasa fecha, monto y evidencia a la original y descarta la propuesta', async () => {
  const original = proposal({ id: 'orig', status: 'ACTIVE', dueDate: '2026-11-15', amount: '90.00', evidence: ['vieja'] });
  const repo = await repoWith(original, proposal({ dueDate: '2026-11-16', amount: '100.00', possibleUpdateOf: 'orig' }));
  await new ReviewObligationUseCase(repo).merge('u1', 'p');
  const o = await repo.get('orig');
  assert.equal(o.dueDate, '2026-11-16');
  assert.equal(o.amount, '100.00');
  assert.deepEqual(o.evidence, ['vieja', 'nueva']);
  assert.equal((await repo.get('p')).status, 'DISMISSED');
});

test('fusionar sin fecha nueva conserva la fecha de la original', async () => {
  const original = proposal({ id: 'orig', status: 'ACTIVE', dueDate: '2026-11-15' });
  const repo = await repoWith(original, proposal({ dueDate: null, possibleUpdateOf: 'orig' }));
  await new ReviewObligationUseCase(repo).merge('u1', 'p');
  assert.equal((await repo.get('orig')).dueDate, '2026-11-15');
});

test('fusionar algo que no es posible actualización falla', async () => {
  const repo = await repoWith(proposal());
  await assert.rejects(new ReviewObligationUseCase(repo).merge('u1', 'p'), ObligationError);
});

test('completar una mensual guarda la hecha e inserta la siguiente', async () => {
  const repo = await repoWith(proposal({ status: 'ACTIVE', dueDate: '2026-10-15' }));
  await new CompleteObligationUseCase(repo, new FixedClock(), sequentialIds('n')).execute('u1', 'p');
  assert.equal((await repo.get('p')).status, 'DONE');
  const next = await repo.get('n1');
  assert.equal(next.dueDate, '2026-11-15');
  assert.equal(next.status, 'ACTIVE');
});

test('completar no duplica la siguiente si ya la acepté desde el resumen del mes', async () => {
  const repo = await repoWith(
    proposal({ status: 'ACTIVE', dueDate: '2026-10-31' }),
    proposal({ id: 'nov', status: 'ACTIVE', dueDate: '2026-11-30' }),
  );
  await new CompleteObligationUseCase(repo, new FixedClock(), sequentialIds('n')).execute('u1', 'p');
  assert.equal((await repo.list('u1', { status: 'ACTIVE' })).length, 1);
});

test('el brief usa el día del reloj', async () => {
  const repo = await repoWith(proposal({ status: 'ACTIVE', dueDate: '2026-10-26' }));
  const brief = await new GetBriefUseCase(repo, new FixedClock('2026-10-27')).execute('u1');
  assert.equal(brief.today, '2026-10-27');
  assert.equal(brief.overdue.length, 1);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IngestFileUseCase } from './ingest-file.use-case.js';
import { ExtractTextUseCase } from './extract-text.use-case.js';
import { ReprocessDocumentUseCase } from './reprocess-document.use-case.js';
import { FakeTextExtractor, InMemoryDocuments, InMemoryObligations, RecordingQueue } from './fakes.js';
import type { Obligation } from '../domain/obligation.js';

const extractor = new FakeTextExtractor('texto');

test('un archivo nuevo crea el documento PENDING y encola la extracción de texto', async () => {
  const docs = new InMemoryDocuments();
  const queue = new RecordingQueue();
  const result = await new IngestFileUseCase(docs, queue, extractor).execute({ path: 'C:/p/a.pdf', sha256: 'h1', sizeBytes: 5 });
  assert.equal(result.status, 'created');
  const doc = await docs.get(result.documentId!);
  assert.equal(doc.status, 'PENDING');
  assert.equal(doc.mimeType, 'application/pdf');
  assert.deepEqual(queue.jobs, [{ name: 'extract-text', documentId: doc.id }]);
});

test('el mismo contenido con otro nombre no se reprocesa', async () => {
  const docs = new InMemoryDocuments();
  const queue = new RecordingQueue();
  const ingest = new IngestFileUseCase(docs, queue, extractor);
  await ingest.execute({ path: 'C:/p/a.pdf', sha256: 'h1', sizeBytes: 5 });
  const again = await ingest.execute({ path: 'C:/p/copia de a.pdf', sha256: 'h1', sizeBytes: 5 });
  assert.equal(again.status, 'duplicate');
  assert.equal(queue.jobs.length, 1);
  assert.equal((await docs.list()).length, 1);
});

test('una extensión no soportada se ignora', async () => {
  const docs = new InMemoryDocuments();
  const result = await new IngestFileUseCase(docs, new RecordingQueue(), extractor).execute({ path: 'C:/p/a.DOCX', sha256: 'h', sizeBytes: 1 });
  assert.equal(result.status, 'unsupported');
  assert.equal((await docs.list()).length, 0);
});

async function pendingDoc(docs: InMemoryDocuments) {
  return docs.create({ path: 'C:/p/a.pdf', sha256: 'h', mimeType: 'application/pdf', sizeBytes: 1, status: 'PENDING', error: null, text: null });
}

test('un PDF sin texto queda FAILED pidiendo OCR', async () => {
  const docs = new InMemoryDocuments();
  const queue = new RecordingQueue();
  const doc = await pendingDoc(docs);
  await new ExtractTextUseCase(docs, queue, new FakeTextExtractor('  \n\f  ')).execute(doc.id);
  const d = await docs.get(doc.id);
  assert.equal(d.status, 'FAILED');
  assert.equal(d.error, 'sin texto (requiere OCR)');
  assert.equal(queue.jobs.length, 0);
});

test('con texto, lo guarda y encola la extracción de obligaciones', async () => {
  const docs = new InMemoryDocuments();
  const queue = new RecordingQueue();
  const doc = await pendingDoc(docs);
  await new ExtractTextUseCase(docs, queue, new FakeTextExtractor('Póliza vigente hasta el 15/03/2027')).execute(doc.id);
  const d = await docs.get(doc.id);
  assert.equal(d.status, 'TEXT_EXTRACTED');
  assert.equal(d.text, 'Póliza vigente hasta el 15/03/2027');
  assert.deepEqual(queue.jobs, [{ name: 'extract-obligations', documentId: doc.id }]);
});

test('si el extractor explota, el documento queda FAILED con el motivo', async () => {
  const docs = new InMemoryDocuments();
  const doc = await pendingDoc(docs);
  await new ExtractTextUseCase(docs, new RecordingQueue(), new FakeTextExtractor(new Error('PDF cifrado'))).execute(doc.id);
  const d = await docs.get(doc.id);
  assert.equal(d.status, 'FAILED');
  assert.equal(d.error, 'PDF cifrado');
});

test('reprocesar borra sólo las propuestas del documento y vuelve a empezar', async () => {
  const docs = new InMemoryDocuments();
  const obligations = new InMemoryObligations();
  const queue = new RecordingQueue();
  const doc = await pendingDoc(docs);
  const base: Obligation = {
    id: 'p', title: 't', kind: 'OTHER', dueDate: null, recurrence: 'NONE', amount: null, currency: null, counterparty: null,
    sourceDocumentId: doc.id, evidence: [], confidence: 1, status: 'PROPOSED', seriesKey: 'k', possibleUpdateOf: null, doneAt: null,
  };
  await obligations.insert(base);
  await obligations.insert({ ...base, id: 'a', status: 'ACTIVE', dueDate: '2027-01-01' });
  await docs.update(doc.id, { status: 'FAILED', error: 'x' });

  await new ReprocessDocumentUseCase(docs, obligations, queue).execute(doc.id);

  assert.deepEqual([...obligations.items.keys()], ['a']);
  const d = await docs.get(doc.id);
  assert.equal(d.status, 'PENDING');
  assert.equal(d.error, null);
  assert.deepEqual(queue.jobs, [{ name: 'extract-text', documentId: doc.id }]);
});

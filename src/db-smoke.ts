import { randomUUID } from 'node:crypto';
import { createPrismaClient } from './infrastructure/persistence/prisma.js';
import { PrismaDocumentRepository } from './infrastructure/persistence/prisma-document.repository.js';
import { PrismaObligationRepository } from './infrastructure/persistence/prisma-obligation.repository.js';

/** Ida y vuelta contra la base real: fechas sin corrimiento y montos exactos. */
const prisma = createPrismaClient(process.env.DATABASE_URL!);
const docs = new PrismaDocumentRepository(prisma);
const obligations = new PrismaObligationRepository(prisma);
const doc = await docs.create({
  path: 'smoke.txt', sha256: `smoke-${randomUUID()}`, mimeType: 'text/plain', sizeBytes: 1, status: 'PENDING', error: null, text: null,
});
const id = randomUUID();
try {
  await obligations.insert({
    id, title: 'Smoke', kind: 'DEADLINE', dueDate: '2027-10-21', recurrence: 'NONE', amount: '1234.56', currency: 'NZD',
    counterparty: null, sourceDocumentId: doc.id, evidence: ['a', 'b'], confidence: 0.5, status: 'PROPOSED',
    seriesKey: '|DEADLINE|smoke', possibleUpdateOf: null, doneAt: null,
  });
  const back = await obligations.get(id);
  if (back.dueDate !== '2027-10-21') throw new Error(`dueDate corrida: ${back.dueDate}`);
  if (back.amount !== '1234.56') throw new Error(`amount distinto: ${back.amount}`);
  if (back.evidence.length !== 2) throw new Error('evidencia perdida');
  if ((await docs.findBySha(doc.sha256))?.id !== doc.id) throw new Error('findBySha');
  console.log('db-smoke OK');
} finally {
  await prisma.obligation.deleteMany({ where: { sourceDocumentId: doc.id } });
  await prisma.document.delete({ where: { id: doc.id } });
  await prisma.$disconnect();
}

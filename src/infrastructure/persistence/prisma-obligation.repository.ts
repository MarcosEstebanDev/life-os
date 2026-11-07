import { Prisma, type PrismaClient, type Obligation as Row } from '../../generated/prisma/client.js';
import type { Obligation, ObligationStatus } from '../../domain/obligation.js';
import type { ObligationRepository } from '../../domain/ports/obligation-repository.port.js';

/**
 * `@db.Date` vuelve como medianoche UTC: se corta a YYYY-MM-DD sin pasar por
 * la zona local, que en la zona local lo movería al día anterior.
 */
function toDomain(row: Row): Obligation {
  return {
    id: row.id,
    ownerId: row.ownerId,
    title: row.title,
    kind: row.kind,
    dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
    recurrence: row.recurrence,
    amount: row.amount ? row.amount.toFixed(2) : null,
    currency: row.currency,
    counterparty: row.counterparty,
    sourceDocumentId: row.sourceDocumentId,
    evidence: row.evidence,
    confidence: row.confidence,
    status: row.status,
    seriesKey: row.seriesKey,
    possibleUpdateOf: row.possibleUpdateOf,
    doneAt: row.doneAt ? row.doneAt.toISOString() : null,
  };
}

function toRow(o: Obligation) {
  return {
    ...o,
    dueDate: o.dueDate ? new Date(`${o.dueDate}T00:00:00Z`) : null,
    amount: o.amount ? new Prisma.Decimal(o.amount) : null,
    doneAt: o.doneAt ? new Date(o.doneAt) : null,
  };
}

export class PrismaObligationRepository implements ObligationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findBySeries(ownerId: string, key: string) {
    return (await this.prisma.obligation.findMany({ where: { ownerId, seriesKey: key } })).map(toDomain);
  }

  async findOwned(ownerId: string, id: string) {
    const row = await this.prisma.obligation.findFirst({ where: { id, ownerId } });
    return row ? toDomain(row) : null;
  }

  async insert(o: Obligation) {
    await this.prisma.obligation.create({ data: toRow(o) });
  }

  async update(o: Obligation) {
    const { id, ...data } = toRow(o);
    await this.prisma.obligation.update({ where: { id }, data });
  }

  async get(id: string) {
    return toDomain(await this.prisma.obligation.findUniqueOrThrow({ where: { id } }));
  }

  async list(ownerId: string, filter?: { status?: ObligationStatus }) {
    const rows = await this.prisma.obligation.findMany({
      where: { ownerId, ...(filter?.status ? { status: filter.status } : {}) },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toDomain);
  }

  async deleteProposedByDocument(documentId: string) {
    const { count } = await this.prisma.obligation.deleteMany({ where: { sourceDocumentId: documentId, status: 'PROPOSED' } });
    return count;
  }
}

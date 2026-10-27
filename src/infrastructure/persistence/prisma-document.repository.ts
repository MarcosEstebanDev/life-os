import type { PrismaClient, Document as Row } from '../../generated/prisma/client.js';
import type { DocumentRecord, DocumentRepository } from '../../domain/ports/document-repository.port.js';

function toRecord(row: Row): DocumentRecord {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export class PrismaDocumentRepository implements DocumentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findBySha(sha: string) {
    const row = await this.prisma.document.findUnique({ where: { sha256: sha } });
    return row ? toRecord(row) : null;
  }

  async create(d: Omit<DocumentRecord, 'id' | 'createdAt'>) {
    return toRecord(await this.prisma.document.create({ data: d }));
  }

  async get(id: string) {
    return toRecord(await this.prisma.document.findUniqueOrThrow({ where: { id } }));
  }

  async update(id: string, patch: Partial<Omit<DocumentRecord, 'id'>>) {
    const { createdAt, ...data } = patch;
    await this.prisma.document.update({ where: { id }, data });
  }

  async list() {
    return (await this.prisma.document.findMany({ orderBy: { createdAt: 'desc' } })).map(toRecord);
  }
}

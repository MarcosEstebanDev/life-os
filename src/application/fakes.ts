import type { Clock } from '../domain/ports/clock.port.js';
import type { DocumentRecord, DocumentRepository } from '../domain/ports/document-repository.port.js';
import type { LlmPort } from '../domain/ports/llm.port.js';
import type { ObligationRepository } from '../domain/ports/obligation-repository.port.js';
import type { Obligation, ObligationStatus } from '../domain/obligation.js';

/** Dobles en memoria para probar casos de uso sin base, sin Docker y sin LLM. */

export class NotFoundError extends Error {}

export class InMemoryDocuments implements DocumentRepository {
  readonly items = new Map<string, DocumentRecord>();
  private seq = 0;

  async findBySha(sha: string) {
    return [...this.items.values()].find((d) => d.sha256 === sha) ?? null;
  }
  async create(d: Omit<DocumentRecord, 'id' | 'createdAt'>) {
    const record = { ...d, id: `doc${++this.seq}`, createdAt: '2026-10-27T10:00:00Z' };
    this.items.set(record.id, record);
    return record;
  }
  async get(id: string) {
    const d = this.items.get(id);
    if (!d) throw new NotFoundError(id);
    return d;
  }
  async update(id: string, patch: Partial<Omit<DocumentRecord, 'id'>>) {
    this.items.set(id, { ...(await this.get(id)), ...patch });
  }
  async list() {
    return [...this.items.values()];
  }
}

export class InMemoryObligations implements ObligationRepository {
  readonly items = new Map<string, Obligation>();

  async findBySeries(key: string) {
    return [...this.items.values()].filter((o) => o.seriesKey === key);
  }
  async insert(o: Obligation) {
    this.items.set(o.id, o);
  }
  async update(o: Obligation) {
    this.items.set(o.id, o);
  }
  async get(id: string) {
    const o = this.items.get(id);
    if (!o) throw new NotFoundError(id);
    return o;
  }
  async list(filter?: { status?: ObligationStatus }) {
    return [...this.items.values()].filter((o) => !filter?.status || o.status === filter.status);
  }
  async deleteProposedByDocument(documentId: string) {
    let n = 0;
    for (const o of this.items.values()) {
      if (o.sourceDocumentId === documentId && o.status === 'PROPOSED') {
        this.items.delete(o.id);
        n++;
      }
    }
    return n;
  }
}

/** Devuelve las respuestas encoladas en orden y guarda lo que le pidieron. */
export class FakeLlm implements LlmPort {
  readonly modelName = 'fake';
  readonly calls: Array<{ system: string; user: string }> = [];
  constructor(private readonly responses: string[]) {}

  async completeJson(input: { system: string; user: string }) {
    this.calls.push(input);
    const next = this.responses.shift();
    if (next === undefined) throw new Error('FakeLlm sin respuestas');
    return next;
  }
}

export class FixedClock implements Clock {
  constructor(private readonly day = '2026-10-27') {}
  today() {
    return this.day;
  }
  now() {
    return `${this.day}T12:00:00Z`;
  }
}

export function sequentialIds(prefix = 'o'): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}

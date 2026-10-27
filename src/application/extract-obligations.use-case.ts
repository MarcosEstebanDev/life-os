import { chunkText } from '../domain/chunk-text.js';
import type { IsoDate } from '../domain/dates.js';
import { decideDuplicate } from '../domain/dedupe.js';
import { evidenceAppears } from '../domain/evidence.js';
import { extractionResultSchema, type ExtractionResult } from '../domain/extraction-schema.js';
import type { Obligation } from '../domain/obligation.js';
import type { Clock } from '../domain/ports/clock.port.js';
import type { DocumentRepository } from '../domain/ports/document-repository.port.js';
import type { LlmPort } from '../domain/ports/llm.port.js';
import type { ObligationRepository } from '../domain/ports/obligation-repository.port.js';
import { resolveDueDate } from '../domain/resolve-due-date.js';
import { seriesKey } from '../domain/series-key.js';

function systemPrompt(today: IsoDate): string {
  return `Sos un asistente que lee documentos personales (contratos, seguros, resúmenes, visas) y detecta obligaciones: pagos, renovaciones, plazos y vencimientos.
Hoy es ${today}.
Respondé SOLO un objeto JSON con esta forma:
{
  "documentDate": { "date": "YYYY-MM-DD", "evidence": "<texto copiado literal>" } | null,
  "obligations": [{
    "title": "<qué hay que hacer, corto>",
    "kind": "PAYMENT" | "RENEWAL" | "DEADLINE" | "EXPIRY" | "OTHER",
    "due": { "type": "absolute", "date": "YYYY-MM-DD" } | { "type": "relative", "months": <entero>, "days": <entero> } | { "type": "unknown" },
    "recurrence": "NONE" | "MONTHLY" | "YEARLY",
    "amount": <número con punto decimal, sin separador de miles> | null,
    "currency": "<código ISO 4217, ej. ARS, USD, NZD>" | null,
    "counterparty": "<empresa u organismo>" | null,
    "evidence": "<fragmento COPIADO LITERAL del texto que justifica la fecha o el monto>",
    "confidence": <0 a 1>
  }]
}
Reglas:
- documentDate es la fecha de emisión o firma del documento, no la de hoy.
- Si el plazo es relativo ("12 meses desde la emisión"), usá "relative"; no lo calcules vos.
- Si no hay fecha clara, usá { "type": "unknown" }. No inventes fechas ni montos.
- La evidencia tiene que estar en el texto tal cual. Si no podés citarla, no incluyas la obligación.
- Si no hay obligaciones, devolvé "obligations": [].`;
}

type ParseOutcome = { ok: true; value: ExtractionResult } | { ok: false; error: string };

function parse(raw: string): ParseOutcome {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `JSON mal formado: ${(e as Error).message}` };
  }
  const result = extractionResultSchema.safeParse(json);
  if (result.success) return { ok: true, value: result.data };
  const issues = result.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`);
  return { ok: false, error: issues.join('; ') };
}

class InvalidLlmResponse extends Error {}

/**
 * Del texto de un documento a obligaciones propuestas. Nada de lo que sale
 * de acá es ACTIVE: todo espera mi revisión.
 */
export class ExtractObligationsUseCase {
  constructor(
    private readonly documents: DocumentRepository,
    private readonly obligations: ObligationRepository,
    private readonly llm: LlmPort,
    private readonly clock: Clock,
    private readonly newId: () => string,
  ) {}

  async execute(documentId: string): Promise<{ proposed: number; attached: number; discarded: number }> {
    const counts = { proposed: 0, attached: 0, discarded: 0 };
    const doc = await this.documents.get(documentId);
    const text = doc.text ?? '';

    let results: ExtractionResult[];
    try {
      results = [];
      for (const chunk of chunkText(text)) results.push(await this.ask(chunk));
    } catch (e) {
      if (!(e instanceof InvalidLlmResponse)) throw e;
      await this.documents.update(documentId, { status: 'FAILED', error: e.message });
      return counts;
    }

    const documentDate =
      results.map((r) => r.documentDate).find((d) => d && evidenceAppears(d.evidence, text))?.date ?? null;

    for (const item of results.flatMap((r) => r.obligations)) {
      if (!evidenceAppears(item.evidence, text)) {
        counts.discarded++;
        continue;
      }
      const key = seriesKey(item);
      const dueDate = resolveDueDate(item.due, documentDate);
      const amount = item.amount === null ? null : item.amount.toFixed(2);
      const decision = decideDuplicate({ seriesKey: key, dueDate, amount }, await this.obligations.findBySeries(key));

      if (decision.action === 'attach') {
        const existing = await this.obligations.get(decision.to);
        await this.obligations.update({ ...existing, evidence: [...existing.evidence, item.evidence] });
        counts.attached++;
        continue;
      }
      const proposal: Obligation = {
        id: this.newId(),
        title: item.title,
        kind: item.kind,
        dueDate,
        recurrence: item.recurrence,
        amount,
        currency: item.currency,
        counterparty: item.counterparty,
        sourceDocumentId: documentId,
        evidence: [item.evidence],
        confidence: item.confidence,
        status: 'PROPOSED',
        seriesKey: key,
        possibleUpdateOf: decision.action === 'possibleUpdate' ? decision.of : null,
        doneAt: null,
      };
      await this.obligations.insert(proposal);
      counts.proposed++;
    }

    await this.documents.update(documentId, { status: 'PROCESSED', error: null });
    return counts;
  }

  /** Un reintento con el error a la vista; si vuelve a fallar, el documento queda FAILED. */
  private async ask(chunk: string): Promise<ExtractionResult> {
    const system = systemPrompt(this.clock.today());
    const user = `Texto del documento:\n"""\n${chunk}\n"""`;
    const first = parse(await this.llm.completeJson({ system, user }));
    if (first.ok) return first.value;
    const retryUser = `${user}\n\nTu respuesta anterior fue inválida (${first.error}). Respondé sólo el JSON corregido.`;
    const second = parse(await this.llm.completeJson({ system, user: retryUser }));
    if (second.ok) return second.value;
    throw new InvalidLlmResponse(`respuesta del LLM inválida: ${second.error}`);
  }
}

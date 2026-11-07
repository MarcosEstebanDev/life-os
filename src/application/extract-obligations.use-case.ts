import { chunkText } from '../domain/chunk-text.js';
import type { IsoDate } from '../domain/dates.js';
import { decideDuplicate } from '../domain/dedupe.js';
import { amountAppears, dateAppears, evidenceAppears } from '../domain/evidence.js';
import { extractionResultSchema, type ExtractionResult } from '../domain/extraction-schema.js';
import type { Obligation } from '../domain/obligation.js';
import type { Clock } from '../domain/ports/clock.port.js';
import type { DocumentRepository } from '../domain/ports/document-repository.port.js';
import type { LlmPort } from '../domain/ports/llm.port.js';
import type { ObligationRepository } from '../domain/ports/obligation-repository.port.js';
import { resolveDueDate } from '../domain/resolve-due-date.js';
import { seriesKey } from '../domain/series-key.js';

function systemPrompt(today: IsoDate): string {
  return `Sos un asistente que lee documentos personales (contratos, seguros, resúmenes, visas, turnos) y detecta obligaciones: pagos, renovaciones, plazos, vencimientos y turnos o citas con día y hora (médicos, trámites), que van como DEADLINE.
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
    "evidence": "<fragmento COPIADO LITERAL del texto; si hay fecha, el que la contiene>",
    "confidence": <0 a 1>
  }]
}
Reglas:
- documentDate es la fecha de emisión o firma del documento, no la de hoy.
- Si el plazo es relativo a la emisión ("12 meses desde la emisión"), usá "relative"; no lo calcules vos.
- Un débito "el día 5 de cada mes" es recurrence "MONTHLY" con due { "type": "unknown" }, no un plazo relativo.
- En un resumen de tarjeta, la obligación es pagar el total en la fecha de VENCIMIENTO (no la de cierre ni la de próximo cierre).
- Con fecha absoluta, la evidencia tiene que incluir esa fecha escrita tal cual.
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
    // Idempotente: un reintento de la cola no suma propuestas sobre las de la corrida anterior.
    await this.obligations.deleteProposedByDocument(documentId);

    // Con temperatura 0 reprocesar repite el mismo fallo: un trozo roto no tira el resto.
    const chunks = chunkText(text);
    const results: ExtractionResult[] = [];
    const failures: string[] = [];
    for (const chunk of chunks) {
      try {
        results.push(await this.ask(chunk));
      } catch (e) {
        if (!(e instanceof InvalidLlmResponse)) throw e;
        failures.push(e.message);
      }
    }
    if (results.length === 0) {
      await this.documents.update(documentId, { status: 'FAILED', error: failures[0] });
      return counts;
    }

    const documentDate =
      results
        .map((r) => r.documentDate)
        .find((d) => d && evidenceAppears(d.evidence, text) && dateAppears(d.date, text))?.date ?? null;

    for (const item of results.flatMap((r) => r.obligations)) {
      if (!evidenceAppears(item.evidence, text)) {
        counts.discarded++;
        continue;
      }
      const key = seriesKey(item);
      // Fecha o monto que no están escritos en el texto quedan vacíos: los completo al revisar.
      // La fecha, además, tiene que estar en la evidencia citada: en un resumen hay varias
      // (cierre, próximo cierre, vencimiento) y una fecha bien escrita pero de otra línea
      // es peor que ninguna, porque parece correcta.
      const absoluteUnbacked = item.due.type === 'absolute' && !dateAppears(item.due.date, item.evidence);
      const dueDate = absoluteUnbacked ? null : resolveDueDate(item.due, documentDate);
      const rawAmount = item.amount === null ? null : item.amount.toFixed(2);
      const amount = rawAmount && amountAppears(rawAmount, text) ? rawAmount : null;
      const decision = decideDuplicate({ seriesKey: key, dueDate, amount }, await this.obligations.findBySeries(doc.ownerId, key));

      if (decision.action === 'attach') {
        const existing = await this.obligations.get(decision.to);
        const evidence = [...new Set([...existing.evidence, item.evidence])];
        await this.obligations.update({ ...existing, evidence });
        counts.attached++;
        continue;
      }
      const proposal: Obligation = {
        id: this.newId(),
        ownerId: doc.ownerId,
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

    const error = failures.length > 0 ? `trozos inválidos ${failures.length}/${chunks.length}: ${failures[0]}` : null;
    await this.documents.update(documentId, { status: 'PROCESSED', error });
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

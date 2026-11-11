import { chunkText } from '../domain/chunk-text.js';
import type { IsoDate } from '../domain/dates.js';
import { decideDuplicate } from '../domain/dedupe.js';
import { amountAppears, dateAppears, evidenceAppears, relativeAppears } from '../domain/evidence.js';
import {
  extractedObligationSchema,
  extractionEnvelopeSchema,
  extractionResultSchema,
  type ExtractionResult,
} from '../domain/extraction-schema.js';
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
    "recurrence": "NONE" | "MONTHLY" | "QUARTERLY" | "YEARLY",
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
- "Trimestral" o "cada 3 meses" es "QUARTERLY". Otra frecuencia que no esté en la lista (bimestral, semestral) va como "NONE".
- En un resumen de tarjeta, la obligación es pagar el total en la fecha de VENCIMIENTO (no la de cierre ni la de próximo cierre).
- Con fecha absoluta, la evidencia tiene que incluir esa fecha escrita tal cual. Si la fecha y el monto están en líneas distintas, citá las dos líneas completas, una detrás de la otra.
- Si no hay fecha clara, usá { "type": "unknown" }. No inventes fechas ni montos.
- La evidencia tiene que estar en el texto tal cual. Si no podés citarla, no incluyas la obligación.
- Si no hay obligaciones, devolvé "obligations": [].`;
}

type Parsed = { value: ExtractionResult; invalid: string[] };
type ParseOutcome = ({ ok: true } & Parsed) | { ok: false; error: string };

function describe(issues: { path: PropertyKey[]; message: string }[], prefix: PropertyKey[] = []): string {
  return issues
    .slice(0, 3)
    .map((i) => `${[...prefix, ...i.path].map(String).join('.')}: ${i.message}`)
    .join('; ');
}

/**
 * Estricto: cualquier obligación inválida invalida la respuesta (y dispara el reintento).
 * Tolerante: alcanza con que la forma de afuera sea válida; las obligaciones inválidas
 * se apartan con su motivo.
 */
function parse(raw: string, mode: 'strict' | 'lenient'): ParseOutcome {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `JSON mal formado: ${(e as Error).message}` };
  }
  const strict = extractionResultSchema.safeParse(json);
  if (strict.success) return { ok: true, value: strict.data, invalid: [] };
  if (mode === 'strict') return { ok: false, error: describe(strict.error.issues) };

  const envelope = extractionEnvelopeSchema.safeParse(json);
  if (!envelope.success) return { ok: false, error: describe(strict.error.issues) };
  const value: ExtractionResult = { documentDate: envelope.data.documentDate, obligations: [] };
  const invalid: string[] = [];
  envelope.data.obligations.forEach((item, index) => {
    const parsed = extractedObligationSchema.safeParse(item);
    if (parsed.success) value.obligations.push(parsed.data);
    else invalid.push(describe(parsed.error.issues, ['obligations', index]));
  });
  return { ok: true, value, invalid };
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
    const invalid: string[] = [];
    for (const chunk of chunks) {
      try {
        const parsed = await this.ask(chunk);
        results.push(parsed.value);
        invalid.push(...parsed.invalid);
      } catch (e) {
        if (!(e instanceof InvalidLlmResponse)) throw e;
        failures.push(e.message);
      }
    }
    if (results.length === 0) {
      await this.documents.update(documentId, { status: 'FAILED', error: failures[0] });
      return counts;
    }
    counts.discarded += invalid.length;

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
      const unbacked =
        (item.due.type === 'absolute' && !dateAppears(item.due.date, item.evidence)) ||
        (item.due.type === 'relative' && !relativeAppears(item.due, item.evidence));
      const dueDate = unbacked ? null : resolveDueDate(item.due, documentDate);
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

    const warnings = [
      failures.length > 0 ? `trozos inválidos ${failures.length}/${chunks.length}: ${failures[0]}` : null,
      invalid.length > 0 ? `obligaciones inválidas ${invalid.length}: ${invalid[0]}` : null,
    ].filter((w) => w !== null);
    await this.documents.update(documentId, { status: 'PROCESSED', error: warnings.length > 0 ? warnings.join(' · ') : null });
    return counts;
  }

  /**
   * Un reintento con el error a la vista. Si la segunda respuesta tiene la forma correcta,
   * se usan sus obligaciones válidas y se apartan las demás; si ni la forma está bien, el
   * trozo falla (y si fallan todos, el documento queda FAILED).
   */
  private async ask(chunk: string): Promise<Parsed> {
    const system = systemPrompt(this.clock.today());
    const user = `Texto del documento:\n"""\n${chunk}\n"""`;
    const first = parse(await this.llm.completeJson({ system, user }), 'strict');
    if (first.ok) return first;
    const retryUser = `${user}\n\nTu respuesta anterior fue inválida (${first.error}). Respondé sólo el JSON corregido.`;
    const second = parse(await this.llm.completeJson({ system, user: retryUser }), 'lenient');
    if (second.ok) return second;
    throw new InvalidLlmResponse(`respuesta del LLM inválida: ${second.error}`);
  }
}

# life-os MVP (núcleo + brief) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carpeta observada → texto → obligaciones propuestas por un LLM local con evidencia → revisión humana → brief en vivo.

**Architecture:** Hexagonal como agent-platform: dominio puro (`src/domain`) sin dependencias, casos de uso (`src/application`) contra puertos, adaptadores en `src/infrastructure`. Dos procesos Node (API NestJS y worker BullMQ con el watcher) + web Next.js en `apps/web`. Postgres y Redis en Docker Compose.

**Tech Stack:** Node 24, TypeScript ESM (`"type": "module"`, NodeNext), tsx, `node --test`, NestJS 11, Prisma 7 + `@prisma/adapter-pg`, BullMQ 6 + ioredis, zod, pdf-parse, chokidar, Next.js (App Router).

**Spec:** `docs/superpowers/specs/2026-10-27-life-os-mvp-design.md`

## Global Constraints

- Copiar las convenciones de `../agent-platform`: `package.json` scripts (`db:up`, `db:migrate` = `prisma migrate dev && prisma generate`, `api`, `worker`, `typecheck`, `test` con `node --import tsx --test`), `tsconfig.json`, `prisma.config.ts`.
- Prisma 7: `url` en `prisma.config.ts` con `env()`, generador `prisma-client` con `output = "../src/generated/prisma"`, `PrismaClient` con `PrismaPg({ connectionString })`.
- NestJS bajo tsx no emite metadata: toda inyección con `@Inject(TOKEN)` y providers `useFactory`.
- BullMQ: pasar `new Redis(url, { maxRetriesPerRequest: null })` ya construida; cerrar con `quit()` a mano.
- Puertos de Docker: Postgres `5434`, Redis `6381` (no chocar con agent-platform 5433/6380).
- LLM: default `LLM_BASE_URL=http://localhost:11434/v1`, `LLM_MODEL=qwen2.5:7b-instruct`. Si el host de `LLM_BASE_URL` no es `localhost`/`127.0.0.1`/`::1` y `LLM_ALLOW_REMOTE` no es `true`, la config lanza error al arrancar.
- Fechas de obligación: sólo fecha (`YYYY-MM-DD`, columna `@db.Date`), "hoy" en `TZ=America/Sao_Paulo` vía el puerto `Clock`.
- Tolerancia de duplicados: ±3 días. Ventanas del brief: 7 y 30 días.
- Extensiones aceptadas: `.pdf`, `.txt`, `.md`. Sin OCR: PDF sin texto → `FAILED` con motivo exacto `sin texto (requiere OCR)`.
- Tests unitarios sin base, sin Docker y sin LLM (dobles en `src/application/fakes.ts`).
- Commits en español con prefijos `feat:`/`test:`/`docs:`/`chore:` y la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- PDF de OneDrive todavía sincronizándose cuando el watcher lo ve → no debe procesarse a medias (chokidar `awaitWriteFinish`, Task 9).
- Montos en formato argentino (`$ 1.234,56`) o fechas `dd/mm/aaaa` en la respuesta del LLM → el esquema exige número y ISO; lo inválido dispara el reintento, no un dato corrupto (Task 5).
- Mensual con vencimiento el 31 → la siguiente ocurrencia cae el último día del mes siguiente, no se desborda (Task 1).
- Mismo archivo copiado o renombrado → no se reprocesa ni se duplican obligaciones (Task 6).
- PDF largo partido en trozos que repiten la misma obligación → una sola propuesta (Task 5, dedupe dentro de la misma corrida).

---

### Task 1: Scaffold + entidad Obligation

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `src/domain/dates.ts`, `src/domain/obligation.ts`
- Test: `src/domain/obligation.test.ts`, `src/domain/dates.test.ts`

**Interfaces:**
- Produces:
  - `type IsoDate = string` (`YYYY-MM-DD`); `addDays(d: IsoDate, n: number): IsoDate`; `addMonths(d: IsoDate, n: number): IsoDate` (clamp a fin de mes); `daysBetween(a: IsoDate, b: IsoDate): number` (b − a).
  - `type ObligationKind = 'PAYMENT'|'RENEWAL'|'DEADLINE'|'EXPIRY'|'OTHER'`, `type Recurrence = 'NONE'|'MONTHLY'|'YEARLY'`, `type ObligationStatus = 'PROPOSED'|'ACTIVE'|'DONE'|'DISMISSED'`.
  - `interface Obligation { id: string; title: string; kind: ObligationKind; dueDate: IsoDate|null; recurrence: Recurrence; amount: string|null; currency: string|null; counterparty: string|null; sourceDocumentId: string; evidence: string[]; confidence: number; status: ObligationStatus; seriesKey: string; possibleUpdateOf: string|null; doneAt: string|null }`
  - `activate(o: Obligation): Obligation` (lanza `ObligationError` si `dueDate` es null o status ≠ PROPOSED); `dismiss(o)`; `complete(o: Obligation, now: string): { done: Obligation; next: Obligation|null }` (next con id nuevo vía parámetro `newId: string`, status ACTIVE, misma serie).

- [ ] **Step 1:** Copiar scaffold de agent-platform (scripts, tsconfig) y agregar `zod`. `npm install`.
- [ ] **Step 2: Tests que fallan** — `addMonths('2026-01-31', 1) === '2026-02-28'`, `addMonths('2028-01-31', 1) === '2028-02-29'`, `addMonths('2026-03-15', 12) === '2027-03-15'`; `activate` con `dueDate: null` lanza `ObligationError`; `activate` de un ACTIVE lanza; `complete` de MONTHLY con dueDate `2026-10-31` devuelve `next.dueDate === '2026-11-30'`, `next.status === 'ACTIVE'`; `complete` de `NONE` devuelve `next === null`; `complete` de un PROPOSED lanza.
- [ ] **Step 3:** `npm test` → FAIL (módulos inexistentes).
- [ ] **Step 4:** Implementar `dates.ts` y `obligation.ts` (funciones puras, objetos inmutables).
- [ ] **Step 5:** `npm test` y `npm run typecheck` → PASS.
- [ ] **Step 6:** Commit `feat: scaffold y entidad Obligation con recurrencia`.

### Task 2: Evidencia, seriesKey y resolución de fechas

**Files:**
- Create: `src/domain/evidence.ts`, `src/domain/series-key.ts`, `src/domain/resolve-due-date.ts`
- Test: los `.test.ts` hermanos

**Interfaces:**
- Produces:
  - `normalizeText(s: string): string` — minúsculas, quita tildes (NFD), colapsa espacios y signos de puntuación a un espacio, trim.
  - `evidenceAppears(evidence: string, text: string): boolean` — `normalizeText(text).includes(normalizeText(evidence))`; evidencia normalizada de menos de 8 caracteres → false.
  - `seriesKey(input: { counterparty: string|null; kind: ObligationKind; title: string }): string` — `${normalizeText(counterparty ?? '')}|${kind}|${normalizeText(title)}`.
  - `type DueDateSpec = { type: 'absolute'; date: IsoDate } | { type: 'relative'; months: number; days: number } | { type: 'unknown' }`
  - `resolveDueDate(spec: DueDateSpec, documentDate: IsoDate|null): IsoDate|null` — relativo usa `documentDate` (`addMonths` y luego `addDays`); relativo sin `documentDate` → null.

- [ ] **Step 1: Tests que fallan** — `evidenceAppears('Vence el 15/03/2027', 'texto...VENCE  el 15-03-2027...')` true; evidencia no presente → false; `'ok'` → false (corta). `seriesKey` igual para `'Sancor Seguros'`/`'sancor  seguros'` y títulos con/sin tilde. `resolveDueDate({type:'relative',months:12,days:0}, '2026-10-21') === '2027-10-21'`; con `documentDate: null` → null; `unknown` → null.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: evidencia normalizada, seriesKey y fechas relativas`.

### Task 3: Decisión de duplicados

**Files:**
- Create: `src/domain/dedupe.ts`
- Test: `src/domain/dedupe.test.ts`

**Interfaces:**
- Consumes: `Obligation`, `daysBetween`.
- Produces: `type DedupeDecision = { action: 'new' } | { action: 'attach'; to: string } | { action: 'possibleUpdate'; of: string }` y `decideDuplicate(candidate: { seriesKey: string; dueDate: IsoDate|null; amount: string|null }, existing: Obligation[]): DedupeDecision`.
  Reglas: sólo cuenta `existing` con misma `seriesKey` y status `ACTIVE`/`DONE`/`PROPOSED`. Misma serie, ambas fechas no nulas, `|daysBetween| <= 3` y mismo monto (o alguno null) → `attach` (a la de fecha más cercana). Misma serie con fecha a más de 3 días: si existe una `ACTIVE` → `possibleUpdate` de esa sólo cuando el monto difiere o la fecha está dentro de 45 días; si no, `new` (es otra ocurrencia, p. ej. otro mes). Candidato con fecha null y misma serie existente → `possibleUpdate` de la ACTIVE más próxima, o `new`.

- [ ] **Step 1: Tests que fallan** — resumen de noviembre que repite la recurrente auto-generada (`2026-11-30` vs `2026-12-01`) → `attach`; misma serie con monto distinto y fecha a 2 días → `possibleUpdate`; misma serie a 31 días de una DONE (mes siguiente) sin ACTIVE → `new`; serie distinta → `new`; DISMISSED ignorada → `new`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: deduplicación de obligaciones por serie`.

### Task 4: Brief en vivo

**Files:**
- Create: `src/domain/brief.ts`
- Test: `src/domain/brief.test.ts`

**Interfaces:**
- Produces: `interface Brief { today: IsoDate; overdue: Obligation[]; next7: Obligation[]; next30: Obligation[]; toReview: Obligation[] }` y `computeBrief(all: Obligation[], today: IsoDate): Brief`.
  `overdue`: ACTIVE con `dueDate < today`. `next7`: ACTIVE con `0 <= días <= 7`. `next30`: ACTIVE con `8..30`. `toReview`: PROPOSED (con o sin fecha). Cada lista ordenada por `dueDate` asc, null al final.

- [ ] **Step 1: Tests que fallan** — hoy `2026-10-27`: vence `2026-10-26` → overdue; `2026-10-27` y `2026-11-03` → next7; `2026-11-04` y `2026-11-26` → next30; `2026-11-27` → ninguna; DONE/DISMISSED nunca aparecen; PROPOSED sin fecha → toReview al final.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: cálculo del brief diario`.

### Task 5: Extracción de obligaciones (caso de uso)

**Files:**
- Create: `src/domain/ports/llm.port.ts`, `src/domain/ports/clock.port.ts`, `src/domain/ports/document-repository.port.ts`, `src/domain/ports/obligation-repository.port.ts`, `src/domain/extraction-schema.ts`, `src/domain/chunk-text.ts`, `src/application/extract-obligations.use-case.ts`, `src/application/fakes.ts`
- Test: `src/domain/extraction-schema.test.ts`, `src/domain/chunk-text.test.ts`, `src/application/extract-obligations.use-case.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `interface LlmPort { readonly modelName: string; completeJson(input: { system: string; user: string }): Promise<string> }` (respuesta cruda; el parseo es del caso de uso).
  - `interface Clock { today(): IsoDate; now(): string }`.
  - `type DocumentStatus = 'PENDING'|'TEXT_EXTRACTED'|'PROCESSED'|'FAILED'`; `interface DocumentRecord { id; path; sha256; mimeType; sizeBytes; status; error: string|null; text: string|null; createdAt }`.
  - `interface DocumentRepository { findBySha(sha: string): Promise<DocumentRecord|null>; create(d: Omit<DocumentRecord,'id'|'createdAt'>): Promise<DocumentRecord>; get(id: string): Promise<DocumentRecord>; update(id: string, patch: Partial<DocumentRecord>): Promise<void>; list(): Promise<DocumentRecord[]> }`.
  - `interface ObligationRepository { findBySeries(key: string): Promise<Obligation[]>; insert(o: Obligation): Promise<void>; update(o: Obligation): Promise<void>; get(id: string): Promise<Obligation>; list(filter?: { status?: ObligationStatus }): Promise<Obligation[]>; deleteProposedByDocument(documentId: string): Promise<number> }`.
  - `extractionResultSchema` (zod): `{ documentDate: { date: IsoDate (regex), evidence: string } | null, obligations: Array<{ title: string(min 3), kind, due: DueDateSpec, recurrence, amount: number|null, currency: string(len 3)|null, counterparty: string|null, evidence: string(min 8), confidence: number 0..1 }> }`.
  - `chunkText(text: string, maxChars = 12000, overlap = 500): string[]`.
  - `class ExtractObligationsUseCase { constructor(docs, obligations, llm, clock, newId: () => string); execute(documentId: string): Promise<{ proposed: number; attached: number; discarded: number }> }`.
  Algoritmo: por cada trozo, pedir JSON (system prompt en español con el esquema, la fecha de hoy y la instrucción de copiar la evidencia literal); `JSON.parse` + `safeParse`; si falla, un reintento con el mensaje de error de zod agregado al user; si vuelve a fallar → documento `FAILED` con `error = 'respuesta del LLM inválida: ' + resumen`. `documentDate` se descarta si su evidencia no aparece. Cada obligación: evidencia que no aparece → `discarded++`; resolver `dueDate`; `amount` se guarda como `toFixed(2)`; `decideDuplicate` contra repo **más las ya propuestas en esta corrida**; `attach` → push de evidencia a la existente; `possibleUpdate` → PROPOSED con `possibleUpdateOf`; `new` → PROPOSED. Al final documento `PROCESSED`.

- [ ] **Step 1: Tests que fallan (esquema)** — rechaza `amount: "1.234,56"`, `due: {type:'absolute', date:'15/03/2027'}`, `confidence: 1.5`; acepta un ejemplo válido. `chunkText` de 30 000 chars → 3 trozos con solape de 500.
- [ ] **Step 2: Tests que fallan (caso de uso, con `FakeLlm` que devuelve respuestas en cola)** — respuesta válida → 1 PROPOSED con evidencia y `seriesKey`; evidencia inventada → `discarded: 1`, nada insertado; primera respuesta JSON roto y segunda válida → PROPOSED (el FakeLlm recibió el error en el segundo user prompt); dos respuestas rotas → documento FAILED con error que empieza con `respuesta del LLM inválida`; relativo `12 meses` con `documentDate 2026-10-21` → `dueDate 2027-10-21`; dos trozos que devuelven la misma obligación → 1 PROPOSED con 2 evidencias; obligación existente ACTIVE misma serie ±3 días → `attached: 1`.
- [ ] **Step 3:** `npm test` → FAIL.
- [ ] **Step 4:** Implementar puertos, esquema, `chunkText`, fakes en memoria y el caso de uso.
- [ ] **Step 5:** `npm test` → PASS.
- [ ] **Step 6:** Commit `feat: extracción de obligaciones con validación y evidencia`.

### Task 6: Ingesta, texto, reproceso, revisión y completar

**Files:**
- Create: `src/domain/ports/text-extractor.port.ts`, `src/domain/ports/queue.port.ts`, `src/application/ingest-file.use-case.ts`, `src/application/extract-text.use-case.ts`, `src/application/reprocess-document.use-case.ts`, `src/application/review-obligation.use-case.ts`, `src/application/complete-obligation.use-case.ts`, `src/application/get-brief.use-case.ts`
- Test: un `.test.ts` por caso de uso

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces:
  - `interface TextExtractor { supports(ext: string): boolean; extract(path: string): Promise<string> }`.
  - `interface JobQueue { enqueueExtractText(documentId: string): Promise<void>; enqueueExtractObligations(documentId: string): Promise<void> }`.
  - `IngestFileUseCase.execute(input: { path: string; sha256: string; sizeBytes: number }): Promise<{ status: 'created'|'duplicate'|'unsupported'; documentId?: string }>` — extensión fuera de `.pdf/.txt/.md` → `unsupported`; sha existente → `duplicate`; si no, crea PENDING y encola extract-text.
  - `ExtractTextUseCase.execute(documentId)` — texto con menos de 20 caracteres no-blancos → FAILED `sin texto (requiere OCR)`; si no, guarda texto, `TEXT_EXTRACTED`, encola extract-obligations. Excepción del extractor → FAILED con su mensaje.
  - `ReprocessDocumentUseCase.execute(documentId)` — `deleteProposedByDocument`, status PENDING, encola extract-text.
  - `ReviewObligationUseCase`: `accept(id, edits?: Partial<Pick<Obligation,'title'|'kind'|'dueDate'|'recurrence'|'amount'|'currency'|'counterparty'>>)` (aplica edits, recalcula `seriesKey`, `activate`); `dismiss(id)`; `merge(id)` — sólo con `possibleUpdateOf`: copia fecha/monto/evidencia a la original y descarta la propuesta.
  - `CompleteObligationUseCase.execute(id)` — persiste `done` e inserta `next` si hay.
  - `GetBriefUseCase.execute(): Promise<Brief>` — `computeBrief(await list(), clock.today())`.

- [ ] **Step 1: Tests que fallan** — ingest del mismo sha dos veces (otro path) → `duplicate` y una sola entrada en cola; `.docx` → `unsupported`; texto vacío → FAILED con motivo exacto; reprocess borra sólo PROPOSED (una ACTIVE del mismo documento sobrevive); accept sin fecha → error, accept con edit de fecha → ACTIVE; merge actualiza la original; complete de MONTHLY inserta la siguiente.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: casos de uso de ingesta, revisión y brief`.

### Task 7: Config, adaptador LLM y extractor de PDF

**Files:**
- Create: `src/config.ts`, `src/infrastructure/llm/openai-compatible.adapter.ts`, `src/infrastructure/text/file-text-extractor.ts`, `src/infrastructure/clock/system-clock.ts`, `src/llm-smoke.ts`
- Test: `src/config.test.ts`, `src/infrastructure/text/file-text-extractor.test.ts` (+ fixture `test/fixtures/sample.pdf` con texto)

**Interfaces:**
- Produces: `loadConfig(env: NodeJS.ProcessEnv): Config` con `{ databaseUrl, redisUrl, watchDir, llm: { baseUrl, apiKey, model, allowRemote }, port }` (lanza `ConfigError` con mensaje que nombra `LLM_ALLOW_REMOTE`); `OpenAiCompatibleAdapter implements LlmPort` (POST `/chat/completions` con `response_format: { type: 'json_object' }`, `temperature: 0`, timeout 300 s por ser CPU); `FileTextExtractor implements TextExtractor` (pdf-parse para `.pdf`, `fs.readFile` utf-8 para `.txt/.md`); `SystemClock` con `Intl` en `America/Sao_Paulo`.
  Script `npm run llm:smoke` manda un texto de ejemplo e imprime el JSON.

- [ ] **Step 1: Tests que fallan** — `https://api.groq.com/openai/v1` sin `LLM_ALLOW_REMOTE` → lanza; con `LLM_ALLOW_REMOTE=true` → ok; `http://127.0.0.1:11434/v1` → ok; extractor lee el texto del PDF fixture.
- [ ] **Step 2:** FAIL. **Step 3:** implementar (adaptar el de agent-platform, sin tools). **Step 4:** PASS.
- [ ] **Step 5 (manual, si Ollama está instalado):** `ollama pull qwen2.5:7b-instruct` y `npm run llm:smoke` → JSON que valida el esquema. Si no está, anotar en el README como pendiente.
- [ ] **Step 6:** Commit `feat: config con bloqueo de LLM remoto, adaptador y extractor de texto`.

### Task 8: Persistencia

**Files:**
- Create: `docker-compose.yml`, `prisma.config.ts`, `prisma/schema.prisma`, `src/infrastructure/persistence/prisma.ts`, `src/infrastructure/persistence/prisma-document.repository.ts`, `src/infrastructure/persistence/prisma-obligation.repository.ts`, `src/db-smoke.ts`

**Interfaces:**
- Consumes: puertos de Task 5.
- Produces: tablas `documents` (sha256 unique) y `obligations` (`dueDate @db.Date`, `amount Decimal(12,2)?`, `evidence String[]`, índice en `seriesKey` y en `status`), repos que mapean Decimal/Date ↔ `string`/`IsoDate`.

- [ ] **Step 1:** Docker Desktop abierto; `npm run db:up`; `npm run db:migrate -- --name init`.
- [ ] **Step 2:** `npm run db:smoke` — crea documento + obligación, las lee, comprueba `dueDate === '2027-10-21'` sin corrimiento por zona horaria y `amount === '1234.56'`, y limpia. Expected: `db-smoke OK`.
- [ ] **Step 3:** Commit `feat: persistencia Prisma de documentos y obligaciones`.

### Task 9: Cola, worker y watcher

**Files:**
- Create: `src/infrastructure/queue/bullmq-job-queue.ts`, `src/infrastructure/watcher/folder-watcher.ts`, `src/infrastructure/hash.ts`, `src/worker/main.ts`

**Interfaces:**
- Produces: colas `extract-text` y `extract-obligations` (concurrencia 1 la segunda: CPU), `attempts: 3`, backoff exponencial 5 s. `startFolderWatcher(dir, onFile: (path) => Promise<void>)` con chokidar `{ ignoreInitial: false, awaitWriteFinish: { stabilityThreshold: 3000, pollInterval: 500 }, ignored: /(^|[\/\\])(\.|~\$)/ }`; `sha256File(path): Promise<string>` por stream.
  `worker/main.ts` arma todo, arranca watcher (`WATCH_DIR`) + workers, y cierra Redis/Prisma en SIGINT.

- [ ] **Step 1:** `npm run worker` con `WATCH_DIR` apuntando a una carpeta de prueba; copiar `test/fixtures/sample.pdf` → log `ingest created`, luego `PROCESSED` (o `FAILED` con motivo si no hay Ollama). Copiar el mismo archivo con otro nombre → `ingest duplicate`.
- [ ] **Step 2:** Commit `feat: worker con cola BullMQ y carpeta observada`.

### Task 10: API

**Files:**
- Create: `src/api/main.ts`, `src/api/app.module.ts`, `src/api/tokens.ts`, `src/api/brief.controller.ts`, `src/api/obligations.controller.ts`, `src/api/documents.controller.ts`

**Interfaces:**
- Produces (todo bajo `/api`, escuchando en `127.0.0.1:${PORT ?? 3010}`, CORS para `http://localhost:3011`):
  - `GET /api/brief` → `Brief`
  - `GET /api/obligations?status=` · `POST /api/obligations/:id/accept` (body = edits) · `POST /api/obligations/:id/dismiss` · `POST /api/obligations/:id/merge` · `POST /api/obligations/:id/complete`
  - `GET /api/documents` · `POST /api/documents/:id/reprocess` · `GET /api/documents/:id/file` (sirve el archivo original, sólo si su path está dentro de `WATCH_DIR`)
  - `ObligationError` → 409; id inexistente → 404.

- [ ] **Step 1:** `npm run api` y verificar con `curl`: `GET /api/brief` → 200 con las 4 listas; `accept` de una sin fecha → 409; `GET /api/documents/<id>/file` → el PDF.
- [ ] **Step 2:** Commit `feat: API REST de brief, obligaciones y documentos`.

### Task 11: Web

**Files:**
- Create: `apps/web/` (Next.js App Router, puerto 3011), páginas `app/brief/page.tsx` (redirige `/` → `/brief`), `app/review/page.tsx`, `app/obligations/page.tsx`, `app/documents/page.tsx`, `lib/api.ts`

**Interfaces:**
- Consumes: endpoints de Task 10 (`NEXT_PUBLIC_API_URL`, default `http://127.0.0.1:3010/api`).
- Pantallas: `/brief` con las 4 secciones y conteos; `/review` muestra cada propuesta con su evidencia resaltada, link al documento, formulario editable (fecha obligatoria para aceptar) y botón "fusionar" cuando hay `possibleUpdateOf`; `/obligations` con filtros por estado/tipo y "marcar hecha"; `/documents` con estado, error y "reprocesar".

- [ ] **Step 1:** `npm run web` y recorrer las 4 pantallas con datos del Task 9: aceptar una propuesta y verla aparecer en `/brief`; marcarla hecha y ver la siguiente si es recurrente.
- [ ] **Step 2:** `npm run web:build` → sin errores.
- [ ] **Step 3:** Commit `feat: web de brief, revisión, obligaciones y documentos`.

### Task 12: Prueba real y README

**Files:**
- Create: `README.md`

- [ ] **Step 1:** Con Ollama, Docker, worker, API y web corriendo, dejar 3–5 documentos reales del usuario (él elige cuáles) en `WATCH_DIR`; anotar cuántas propuestas fueron correctas, cuántas descartadas y el tiempo por documento.
- [ ] **Step 2:** README: qué es, por qué (uso real), cómo levantarlo (Docker Desktop → `db:up` → `db:migrate` → `worker` + `api` + `web`), privacidad (LLM local, `LLM_ALLOW_REMOTE`), resultado de la prueba real y próximos subsistemas (OCR, Gmail/Calendar, Notion).
- [ ] **Step 3:** `npm test`, `npm run typecheck`, `npm run web:build` → todo verde.
- [ ] **Step 4:** Commit `docs: README del MVP`.

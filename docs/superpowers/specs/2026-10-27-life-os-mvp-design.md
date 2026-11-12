# life-os — Diseño del MVP (núcleo + brief diario)

**Fecha:** 2026-10-27 · **Estado:** borrador para aprobación del usuario

## Intención

Una herramienta personal que lee mis papeles (contratos, seguros, resúmenes,
trámites), entiende qué me obligan a hacer y cuándo, y me lo recuerda
cada día. La entidad central es la **Obligación**: algo que tengo que hacer o
pagar, con fecha, y con el documento del que salió como evidencia.

**Por qué ahora:** hay papeles reales que vencen (permisos con plazo desde la
emisión, seguros, tarjetas). Y sirve como proyecto con **uso real**: una
herramienta que se usa todos los días.

**Éxito:** dejo ~10 documentos reales en una carpeta y, después de revisar las
propuestas, el brief diario me muestra correctamente qué vence y qué está
atrasado. Lo uso una semana seguida sin volver a la planilla/memoria.

## Metas

1. Carpeta observada → cada documento nuevo se procesa solo.
2. Extracción con IA → propone Obligaciones con evidencia (fragmento del texto).
3. Revisión humana → nada entra como "activo" sin que yo lo confirme.
4. Brief diario → atrasadas, próximos 7 días, próximos 30 días, pendientes de revisión.
5. Marcar como hecha; las recurrentes generan la siguiente ocurrencia.

## No-metas (quedan para subsistemas siguientes, ya decididos por el usuario)

- OCR de escaneos e imágenes.
- Gmail, Google Drive, Google Calendar (subsistema 2: brief enriquecido).
- Notion bidireccional (subsistema 3).
- Estructura configurable por el usuario (categorías/campos tipo Notion) y reglas
  configurables: el MVP usa un modelo fijo, diseñado para extenderse.
- Búsqueda semántica / pgvector.
- Multiusuario, autenticación, despliegue en la nube.

## Anti-metas (sería un fracaso aunque funcione)

- **Datos financieros enviados a un proveedor externo sin que yo lo decida.**
- Obligaciones inventadas por la IA que aparecen como reales sin revisión.
- Fechas o montos sin evidencia trazable al documento.
- Un sistema que tengo que "alimentar" a mano más que lo que me ahorra.

## Restricciones

- Corre local en una PC de escritorio sin GPU usable para IA en Ollama → modelos
  chicos en CPU.
- Sin API key de Anthropic. El LLM va detrás de un puerto agnóstico (`LlmPort`),
  mismo patrón que agent-platform (adaptador OpenAI-compatible).
- Stack decidido: NestJS + Postgres + BullMQ (Redis) + Next.js, Docker Compose
  para Postgres y Redis.

## Diseño

### Flujo

```
carpeta observada ──(archivo nuevo/cambiado)──▶ Document (hash sha256, dedupe)
   └▶ job extract-text ──▶ texto plano guardado
        └▶ job extract-obligations (LLM, salida JSON validada con zod)
             └▶ Obligations en estado PROPOSED, con evidencia
                  └▶ yo reviso en la web: ACTIVE / DISMISSED (puedo editar)
/brief ──▶ calculado en vivo desde las Obligations (sin cron ni persistencia)
```

### Entidades

**Document:** id, path, sha256 (único), mimeType, sizeBytes, status
(`PENDING | TEXT_EXTRACTED | PROCESSED | FAILED`), error, text, createdAt.
Si el mismo hash reaparece (copiado/renombrado) no se reprocesa. Si cambia el
contenido de un path, es un Document nuevo; las obligaciones del anterior quedan.

**Obligation:**
- title, kind (`PAYMENT | RENEWAL | DEADLINE | EXPIRY | OTHER`)
- dueDate (fecha, sin hora), recurrence (`NONE | MONTHLY | QUARTERLY | YEARLY`; trimestral sumada el 2026-11-11)
- amount (decimal, opcional) + currency (ISO 4217, opcional)
- counterparty (opcional)
- sourceDocumentId + **evidence** (fragmento literal del texto que justifica la fecha/monto)
- confidence (0–1, la reporta el modelo; sólo informativa)
- status: `PROPOSED → ACTIVE → DONE`, o `PROPOSED → DISMISSED`
- doneAt

Al marcar DONE una recurrente se crea la siguiente ocurrencia ya ACTIVE.

**Brief:** no se persiste. Es una **vista calculada en vivo** al abrir /brief
(es una PC personal: un cron a las 07:00 falla si está apagada, y una foto queda
vieja apenas marco algo como hecho).

### Extracción

- Texto: PDFs con capa de texto (`pdf-parse`), `.txt`, `.md`. **Sin OCR en el
  MVP** (el usuario: sus papeles son mayormente PDFs con texto). Imágenes y PDFs
  escaneados van a FAILED con motivo "sin texto (requiere OCR)"; el OCR queda
  detrás de un puerto `TextExtractor` para sumarlo después.
- LLM: prompt con el texto (truncado/troceado si excede contexto) y esquema JSON.
  La respuesta se valida con zod; si no valida, un reintento con el error; si
  vuelve a fallar → FAILED. La **evidencia debe aparecer literal en el texto**:
  si no aparece, la obligación se descarta (barrera contra alucinaciones).
- Fecha de referencia: el modelo extrae también la **fecha del documento**
  (emisión/firma) con su evidencia, y los plazos relativos ("12 meses desde la
  emisión") se calculan desde esa fecha, no desde hoy. Si no hay fecha de
  documento, la obligación entra con `dueDate` vacío.
- `dueDate` es **opcional en PROPOSED**: una obligación sin fecha clara no se
  descarta, se propone y la completo yo en la revisión. Para pasar a ACTIVE la
  fecha es obligatoria.
- Evidencia: la comparación con el texto es **normalizada** (minúsculas, espacios
  y signos colapsados), no byte a byte.

### Duplicados

- Cada obligación tiene una `seriesKey` = normalización de
  contraparte + tipo + título.
- Una propuesta nueva cuya `seriesKey` coincide con una obligación ACTIVE o DONE
  con `dueDate` a ±3 días **no se propone de nuevo**: se agrega como evidencia
  adicional a la existente. Esto cubre el resumen del mes siguiente que repite
  la recurrente ya generada.
- Si la `seriesKey` coincide pero la fecha o el monto difieren, se propone
  marcada como "posible actualización de X" y en /review la puedo fusionar.
- Reprocesar un documento reemplaza sus propuestas PROPOSED; nunca toca las
  ACTIVE/DONE/DISMISSED. Un documento nuevo por cambio de contenido pasa por la
  misma deduplicación.

### Proveedor de LLM y privacidad

`LlmPort` con un adaptador OpenAI-compatible configurable por `.env`
(`LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`).
**Default: Ollama local** (`qwen2.5:7b-instruct` o similar; lento en CPU pero
es un proceso batch). Usar un proveedor remoto (p. ej. Groq) exige
`LLM_ALLOW_REMOTE=true` explícito; sin eso, el sistema se niega a arrancar con
una URL que no sea localhost.

### Web (Next.js)

- `/brief` — el brief de hoy (página principal).
- `/review` — propuestas PROPOSED con su evidencia y link al documento; aceptar,
  editar, descartar.
- `/obligations` — lista filtrable (estado, tipo, vencimiento); marcar hecha.
- `/documents` — documentos con su estado y errores; reprocesar.

### API (NestJS)

REST simple sobre las entidades de arriba; sin auth (sólo escucha en localhost).

## Lo que decidió el usuario

- Proyecto unificado Second Brain + Life Dashboard, entidad Obligación (2026-09-30).
- Stack NestJS + Postgres + BullMQ + Next.js.
- Orden: núcleo → brief → Notion; una spec por subsistema.
- MVP chico primero; Notion bidireccional y "todo configurable" después (2026-10-27).
- Sin OCR en el MVP: los papeles son mayormente PDFs con texto (2026-10-27).

## Decisiones mías (revisar)

- LLM local por defecto + bloqueo de proveedores remotos salvo opt-in.
- Revisión humana obligatoria (estado PROPOSED) y evidencia literal obligatoria.
- Brief sólo en la web (sin mail/notificación todavía), calculado en vivo.
- Fecha del documento como referencia de plazos; `dueDate` opcional en PROPOSED.
- Deduplicación por `seriesKey` ± 3 días; reprocesar sólo reemplaza PROPOSED.
- Evidencia con comparación normalizada.
- Recurrencia limitada a mensual/anual.
- Sin pgvector en el MVP.

## Lo que queda a criterio de quien implemente

Estructura de módulos (seguir hexagonal como agent-platform), librería de
watcher (chokidar), esquema Prisma concreto, diseño visual de la web, tamaño de
trozos de texto, prompts.

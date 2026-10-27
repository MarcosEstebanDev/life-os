# life-os

Lee mis papeles (contratos, seguros, resúmenes de tarjeta, trámites),
detecta qué me obligan a hacer y cuándo, y me lo muestra en un brief diario.

La pieza central es la **Obligación**: algo que tengo que hacer o pagar, con
fecha, y con el fragmento literal del documento que lo justifica.

## Por qué existe

Porque lo uso. Tengo vencimientos reales (un permiso con plazo tiene 12
meses para entrar desde la emisión, seguros, tarjetas) y antes vivían en mi
memoria o en una planilla. El primer usuario soy yo, todos los días.

## Cómo funciona

```
carpeta observada ─▶ texto (pdf-parse) ─▶ LLM local propone obligaciones con evidencia
      ─▶ yo reviso y acepto ─▶ brief: atrasadas · próximos 7 días · próximos 30 días
```

- **Nada cuenta sin revisión.** Lo que propone el modelo queda `PROPOSED` hasta
  que lo acepto; para aceptarlo hace falta una fecha.
- **Sin evidencia no hay obligación.** Si el fragmento que cita el modelo no
  aparece en el documento (comparación normalizada), se descarta.
- **Plazos relativos desde la fecha del documento.** "12 meses desde la emisión"
  se cuenta desde la emisión, no desde el día en que se procesó el PDF.
- **Sin duplicados.** El resumen de cada mes de la misma tarjeta se reconoce
  como la misma serie (contraparte + tipo + título, ±3 días) y suma evidencia.
- **Recurrentes.** Marcar como hecha una mensual o anual genera la siguiente.
- **El brief se calcula en vivo**: no depende de un cron ni de que la PC esté
  prendida a una hora.

- **Montos y fechas tienen que estar escritos en el texto.** Si el modelo lee
  `1.234` donde dice `$ 1.234,56`, o da vuelta día y mes, el dato queda vacío
  y lo completo al revisar.

## Privacidad

Son datos financieros. El LLM corre **local con Ollama** por defecto. Si
`LLM_BASE_URL` apunta fuera de esta máquina, o `LLM_MODEL` es un modelo
`-cloud` de Ollama (corre en ollama.com aunque se pida al endpoint local), el
sistema **no arranca** salvo que `LLM_ALLOW_REMOTE=true` esté puesto a
propósito. La API escucha sólo en `127.0.0.1`, no tiene autenticación y
rechaza pedidos cuyo `Host` no sea `localhost`/`127.0.0.1` (DNS rebinding).

## Levantarlo

Requisitos: Node 24, Docker Desktop (abrirlo a mano: no arranca solo) y
[Ollama](https://ollama.com) con el modelo:

```bash
ollama pull qwen2.5:7b-instruct
```

```bash
cp .env.example .env          # ajustar WATCH_DIR a la carpeta de papeles
npm install && npm run web:install
npm run db:up && npm run db:migrate
npm run dev                   # worker + API + web juntos (o por separado:)
npm run worker                # terminal 1: carpeta observada + extracción
npm run api                   # terminal 2: http://127.0.0.1:3010/api
npm run web                   # terminal 3: http://localhost:3011
```

`npm run llm:smoke` prueba el modelo contra un texto de ejemplo sin base ni cola.

En CPU (esta PC no tiene GPU usable para IA) un modelo de 7B tarda minutos por
documento. Es un proceso en segundo plano: se deja el PDF en la carpeta y se
revisa después.

## Pantallas

| Ruta | Para qué |
|---|---|
| `/brief` | Lo atrasado, lo de los próximos 7 y 30 días, y cuántas propuestas esperan revisión |
| `/review` | Cada propuesta con su evidencia resaltada y el documento; corregir, aceptar, fusionar o descartar |
| `/obligations` | Todas, filtradas por estado y tipo; marcar como hecha |
| `/documents` | Qué entró, en qué estado está, por qué falló; reprocesar |

## Desarrollo

```bash
npm test          # dominio y casos de uso: sin base, sin Docker, sin LLM
npm run typecheck
npm run db:smoke  # ida y vuelta contra Postgres real
npm run web:build
```

Arquitectura hexagonal, igual que agent-platform: `src/domain` es puro,
`src/application` son los casos de uso contra puertos, `src/infrastructure`
los adaptadores. API (NestJS) y worker (BullMQ) son procesos separados; la API
no conoce el LLM.

Diseño y plan: `docs/superpowers/specs/2026-10-27-life-os-mvp-design.md` y
`docs/superpowers/plans/2026-10-27-life-os-mvp.md`.

## Estado

MVP del núcleo + brief, verificado con tests (unitarios y contra Postgres) y
recorriendo la web. **Pendiente: la prueba con documentos reales**, que
necesita Ollama instalado; anotar acá cuántas propuestas fueron correctas,
cuántas se descartaron y cuánto tardó cada documento.

## Lo que viene

1. OCR para escaneos (detrás del puerto `TextExtractor`).
2. Gmail y Google Calendar en el brief.
3. Notion bidireccional.
4. Estructura y reglas configurables.

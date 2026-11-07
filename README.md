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
  aparece en el documento (comparación normalizada), se descarta. Puede pegar
  hasta 3 fragmentos literales (la línea del vencimiento y la del total).
- **Plazos relativos desde la fecha del documento.** "12 meses desde la emisión"
  se cuenta desde la emisión, no desde el día en que se procesó el PDF.
- **Sin duplicados.** El resumen de cada mes de la misma tarjeta se reconoce
  como la misma serie (contraparte + tipo + título, ±3 días) y suma evidencia.
- **Recurrentes.** Marcar como hecha una mensual o anual genera la siguiente.
- **El brief se calcula en vivo**: no depende de un cron ni de que la PC esté
  prendida a una hora.

- **Montos y fechas tienen que estar escritos en el texto.** Si el modelo lee
  `1.234` donde dice `$ 1.234,56`, o da vuelta día y mes, el dato queda vacío
  y lo completo al revisar. La fecha, además, tiene que estar en la evidencia
  citada (en un resumen hay cierre, próximo cierre y vencimiento), y un plazo
  relativo tiene que estar escrito ("12 meses", "30 días"): "el día 5 de cada
  mes" no es "un mes y cinco días desde la emisión".

## Privacidad

Son datos financieros. El LLM corre **local con Ollama** por defecto. Si
`LLM_BASE_URL` apunta fuera de esta máquina, o `LLM_MODEL` es un modelo
`-cloud` de Ollama (corre en ollama.com aunque se pida al endpoint local), el
sistema **no arranca** salvo que `LLM_ALLOW_REMOTE=true` esté puesto a
propósito. La API escucha sólo en `127.0.0.1` y rechaza pedidos cuyo `Host`
no sea `localhost`/`127.0.0.1` (DNS rebinding).

## Cuentas y seguridad

Cada usuario ve sólo sus documentos y obligaciones: un id ajeno responde 404,
igual que uno que no existe.

- **Sesiones opacas en Postgres, no JWT** ([ADR 0001](docs/adr/0001-sesiones-opacas.md)):
  cookie HttpOnly + SameSite=Lax con un token aleatorio; la base guarda sólo su
  SHA-256. Cerrar una sesión, todas, o cambiar la contraseña tiene efecto en el acto.
  En Seguridad se ven los dispositivos con su última actividad.
- **Verificación en dos pasos (TOTP, RFC 6238)** implementada a mano y probada
  con los vectores del RFC. Secreto cifrado con AES-256-GCM, 10 códigos de
  recuperación de un solo uso (sólo su hash en la base), un código no sirve dos
  veces. La contraseña sola deja una sesión que únicamente puede completar el login.
- **Contraseñas con argon2id**, 12 a 128 caracteres, sin reglas de composición
  (NIST SP 800-63B).
- **Sin enumeración de cuentas:** email inexistente y contraseña incorrecta dan el
  mismo mensaje, y los dos verifican un hash argon2.
- **Límite de intentos en Redis, atómico:** el intento se reserva antes de verificar
  (INCR + EXPIRE NX en un MULTI), así una ráfaga en paralelo no prueba más que el
  límite. 5 por email y 20 por IP en 15 minutos → 429 con `Retry-After`.
- **El 2FA no se adivina:** 10 códigos por usuario cada 15 minutos, que no se
  reinician al volver a poner la contraseña; 5 por sesión pendiente la cierran; la
  sesión pendiente vence a los 10 minutos. El mismo código en dos pedidos
  simultáneos sirve una sola vez (UPDATE condicional en Postgres).
- **CSRF:** todo método que modifica exige un `Origin` de `WEB_ORIGINS`, y sin
  `Origin` se rechaza: en localhost SameSite=Lax no separa puertos. La web llega a
  la API por el mismo origen (rewrite de Next) y las dos escuchan sólo en
  127.0.0.1. Con curl hay que mandar `-H Origin:http://localhost:3011`.
- **Redirecciones:** `?next=` se resuelve como URL y sólo se sigue si es del mismo
  origen (`/%09/evil.com` no sale del sitio).
- **Registro de actividad** visible para el usuario: entradas, fallos, 2FA,
  sesiones cerradas, cambios de contraseña.

Variables: `AUTH_ENCRYPTION_KEY` (32 bytes en base64), `WATCH_OWNER_EMAIL` (a
quién pertenece lo que entra por la carpeta; el worker lo fija al arrancar, así
que se crea la cuenta primero), `ALLOW_SIGNUP` (`first` por defecto: sólo la
primera cuenta; `true` abierto, `false` cerrado), `WEB_ORIGINS`.

Siguiente: login con Google (OIDC + PKCE), que también abre la puerta a Gmail y
Calendar. Diseño en `docs/superpowers/specs/2026-10-27-auth-design.md`.

## Levantarlo

Requisitos: Node 24, Docker Desktop (abrirlo a mano: no arranca solo) y
[Ollama](https://ollama.com) con el modelo:

```bash
ollama pull qwen2.5:7b-instruct
```

```bash
cp .env.example .env          # WATCH_DIR, AUTH_ENCRYPTION_KEY, WATCH_OWNER_EMAIL
npm install && npm run web:install
npm run db:up && npm run db:deploy
npm run dev                   # worker + API + web juntos (o por separado:)
npm run worker                # terminal 1: carpeta observada + extracción
npm run api                   # terminal 2: http://127.0.0.1:3010/api
npm run web                   # terminal 3: http://localhost:3011
```

Entrá a http://localhost:3011, creá tu cuenta (la primera; después el registro se
cierra solo), activá la verificación en dos pasos desde Seguridad, poné ese email
en `WATCH_OWNER_EMAIL` y reiniciá `npm run dev`: el worker recién ahí empieza a
mirar la carpeta.

`npm run llm:smoke` prueba el modelo contra un texto de ejemplo sin base ni cola.

En CPU un modelo de 7B tarda entre 20 s y 2 min por documento de una página, y
**cargarlo en frío desde un disco lento tarda unos 6 minutos**. Por eso el timeout por
pedido es de 30 minutos (`LLM_TIMEOUT_MS`): si se corta antes, Ollama aborta la
carga y cada reintento empieza de cero. Es un proceso en segundo plano: se deja
el PDF en la carpeta y se revisa después.

Si Ollama elige una GPU por Vulkan y la carga se cuelga ("timed out
waiting for llama-server to start"). La salida es una variante que corre en CPU,
que comparte el archivo del modelo (no ocupa disco extra):

```bash
printf 'FROM qwen2.5:7b-instruct\nPARAMETER num_gpu 0\n' > Modelfile.cpu
ollama create qwen2.5:7b-instruct-cpu -f Modelfile.cpu
# y en .env: LLM_MODEL=qwen2.5:7b-instruct-cpu
```

`WATCH_DIR` puede estar en una carpeta de prueba dentro del repo (`.local/inbox`,
ignorada por git).

## Pantallas

| Ruta | Para qué |
|---|---|
| `/brief` | Lo atrasado, lo de los próximos 7 y 30 días, y cuántas propuestas esperan revisión |
| `/review` | Cada propuesta con su evidencia resaltada y el documento; corregir, aceptar, fusionar o descartar |
| `/obligations` | Todas, filtradas por estado y tipo; marcar como hecha |
| `/documents` | Qué entró, en qué estado está, por qué falló; reprocesar |
| `/settings/security` | Verificación en dos pasos, dispositivos con sesión abierta, contraseña, actividad |
| `/login`, `/register` | Acceso; con 2FA, `/login/mfa` pide el código o uno de recuperación |

## Desarrollo

```bash
npm test          # dominio y casos de uso: sin base, sin Docker, sin LLM
npm run typecheck
npm run db:smoke  # ida y vuelta contra Postgres real, incluido el aislamiento entre usuarios
npm run web:build
```

Arquitectura hexagonal, igual que agent-platform: `src/domain` es puro,
`src/application` son los casos de uso contra puertos, `src/infrastructure`
los adaptadores. API (NestJS) y worker (BullMQ) son procesos separados; la API
no conoce el LLM.

Diseño y planes en `docs/superpowers/specs` y `docs/superpowers/plans`;
decisiones de arquitectura en `docs/adr`.

## Estado

MVP del núcleo + brief y cuentas con 2FA, verificado con tests (unitarios y
contra Postgres), con curl contra la API y recorriendo la web.

**Prueba de punta a punta con Ollama (2026-11-07)**, 5 PDFs sintéticos con texto
(factura de luz, resumen de VISA con una cuota, turno médico, póliza de auto y un
recibo de alquiler ya pagado), `qwen2.5:7b-instruct` en CPU:

| Documento | Propuesto | Resultado |
|---|---|---|
| Factura de luz | Pagar 18/11 · $ 48.731,20 · y el 2.º vencimiento con recargo | correcto; el 2.º se descarta al revisar |
| Resumen VISA | Pagar 10/11, sin monto | fecha bien; el monto lo calculó (total − mínimo) y quedó vacío: se completa al revisar |
| Turno médico | Asistir 19/11 | correcto (sin contraparte) |
| Póliza | Renovar 01/12/2026 · premio mensual $ 38.900 sin fecha | correcto; la fecha del débito se completa al revisar |
| Recibo pagado | nada | correcto |

La primera pasada encontró cuatro problemas (carpeta bajo `.local` ignorada,
timeout que abortaba la carga del modelo, fecha de otra línea tomada como
vencimiento, "día 5 de cada mes" leído como plazo relativo) y un turno que no
salía; todo tiene test y quedó arreglado. Falta probar con papeles
reales.

## Lo que viene

1. OCR para escaneos (detrás del puerto `TextExtractor`).
2. Gmail y Google Calendar en el brief.
3. Notion bidireccional.
4. Estructura y reglas configurables.

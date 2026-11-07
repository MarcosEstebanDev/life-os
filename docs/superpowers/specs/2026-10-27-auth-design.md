# life-os — Autenticación (diseño)

**Fecha:** 2026-10-27 · **Estado:** decidido por Claude a pedido de el usuario ("armalo a criterio propio")

## Intención

Que life-os tenga cuentas de usuario de verdad, como pieza de portfolio, sin
repetir lo que ya muestra el helpdesk (JWT de acceso + refresh con rotación y
detección de reuso, argon2id, throttling). Acá el foco está en lo que cambia
cuando los datos son financieros personales: **revocación inmediata**,
**segundo factor** y **aislamiento estricto entre usuarios**.

## Metas

1. Registro, login, logout, "cerrar todas las sesiones", cambio de contraseña.
2. **Sesiones opacas del lado del servidor** (ADR 0001 de life-os): token aleatorio
   en cookie httpOnly; en la base sólo su SHA-256. Lista de sesiones activas
   (dispositivo, IP, última actividad) y revocación de cada una.
3. **TOTP (RFC 6238)** opcional por usuario, con 10 códigos de recuperación de un
   solo uso, protección contra reuso del mismo código y secreto cifrado en reposo
   (AES-256-GCM, clave en `AUTH_ENCRYPTION_KEY`).
4. **Propiedad de los datos**: cada Document y Obligation tiene `ownerId`; toda
   lectura y escritura filtra por el usuario de la sesión. Otro usuario recibe 404,
   nunca 403 (no se confirma que el recurso existe).
5. **Registro de eventos de seguridad** visible para el usuario: login correcto y
   fallido, 2FA activado/desactivado, sesión revocada, contraseña cambiada.

## No-metas (por ahora)

- Login con Google / OIDC: diseñado abajo, se implementa cuando haya credenciales
  de Google Cloud (también lo necesita el subsistema de Gmail/Calendar).
- Recuperación de contraseña por email (no hay envío de mails todavía).
- Roles, organizaciones, compartir datos entre usuarios.
- WebAuthn / passkeys.

## Anti-metas

- Tokens o secretos legibles en la base o en logs.
- Poder distinguir "ese email no existe" de "contraseña incorrecta" (por mensaje o por tiempo).
- Que un usuario pueda ver, aunque sea por id, un documento de otro.

## Decisiones

**Sesiones (por qué no JWT).** Una herramienta local con un solo backend no
necesita verificación sin estado; necesita poder cortar una sesión robada *ya*.
Con sesiones en Postgres, logout es borrar una fila, "cerrar todas" es un UPDATE,
y la pantalla de dispositivos sale gratis. El costo es una consulta por request,
irrelevante a esta escala. Token: 32 bytes aleatorios en base64url. Expiración
deslizante de 7 días de inactividad, con tope absoluto de 30 días; `lastSeenAt`
se actualiza como mucho cada 5 minutos.

**Cookie.** `lifeos_session`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure`
cuando el origen es https. La web llama a la API **por el mismo origen**: Next
reescribe `/api/*` hacia la API, así no hay cookies entre puertos ni CORS con
credenciales.

**CSRF.** `SameSite=Lax` ya impide que un POST de otro sitio lleve la cookie.
Además, todo método que no sea GET/HEAD exige que `Origin` esté en
`WEB_ORIGINS` (defensa en profundidad).

**Contraseñas.** argon2id (parámetros por defecto de la librería `argon2`).
Mínimo 12 caracteres, máximo 128 (argon2 sobre entradas enormes es DoS), sin
reglas de composición (NIST SP 800-63B). Email normalizado (trim + minúsculas).

**Enumeración.** Login con email inexistente verifica igual contra un hash
ficticio, y responde el mismo `401 email o contraseña incorrectos`. Registro con
email existente responde `409`: en una app personal es aceptable y se documenta.

**Límite de intentos.** En Redis: 5 fallos por email y 20 por IP en 15 minutos
→ `429` con `Retry-After`. Un login correcto limpia el contador del email.

**TOTP.** Implementación propia (HMAC-SHA1, paso de 30 s, 6 dígitos, ventana ±1),
probada con los vectores del RFC 6238. Se guarda el último paso usado: el mismo
código no sirve dos veces. Flujo: `setup` devuelve el URI `otpauth://` (la web lo
muestra como QR) → `enable` con un código válido lo activa y devuelve los códigos
de recuperación **una sola vez** (en la base, sólo su hash). Login con 2FA: la
contraseña crea una sesión `mfaPending`, que sólo puede llamar a
`POST /auth/mfa`; con el código (o un código de recuperación) pasa a completa.
Desactivar exige contraseña + código.

**Cambio de contraseña.** Exige la actual; revoca todas las otras sesiones.

**Propiedad.** La carpeta observada pertenece a un usuario: `WATCH_OWNER_EMAIL`.
El worker resuelve su id al arrancar; si el usuario no existe, no ingiere y lo
dice en el log. Las obligaciones heredan el dueño del documento.

**Registro abierto o cerrado.** `ALLOW_SIGNUP=true` por defecto en local; en un
despliegue se pone en `false` después de crear la cuenta.

## Login con Google (siguiente paso, no en este alcance)

Authorization Code + PKCE contra Google como proveedor OIDC, `state` y `nonce`
en una cookie temporal firmada; identidad por `sub` (no por email), vinculable a
una cuenta existente sólo si el email está verificado y el usuario confirma con
su contraseña. Mismos scopes ampliables después para Gmail/Calendar (consentimiento
incremental).

## Lo que queda a criterio de quien implemente

Nombres de tablas y módulos, diseño visual de las pantallas, librería de QR.

# ADR 0001 — Sesiones opacas en Postgres, no JWT

**Estado:** aceptada · **Fecha:** 2026-10-27

## Contexto

life-os guarda datos financieros personales y necesita cuentas. El helpdesk
(otro proyecto) usa JWT de acceso de vida corta + refresh token rotativo con
detección de reuso: es el diseño correcto para una API multi-tenant que tiene
que escalar horizontalmente sin consultar la base en cada request.

Acá las fuerzas son otras:

- **Un solo backend, un solo usuario la mayor parte del tiempo.** No hay
  servicios que tengan que verificar tokens sin hablar con la base.
- **Revocación inmediata.** Si sospecho que me robaron la sesión, cerrarla
  tiene que tener efecto *ya*, no cuando venza el access token.
- **Ver dónde está abierta la cuenta.** Una lista de dispositivos con su
  última actividad, y cerrar uno puntual.
- **Segundo factor.** Hace falta un estado intermedio "pasó la contraseña,
  falta el código" que sólo sirva para completar el login.

## Decisión

Sesiones del lado del servidor:

- La cookie `lifeos_session` (HttpOnly, SameSite=Lax, Secure con https) lleva
  un token de 32 bytes aleatorios.
- La base guarda **sólo su SHA-256**. Un hash rápido alcanza porque el token no
  es adivinable; un volcado de la base no da sesiones usables.
- Expiración deslizante de 7 días de inactividad con tope absoluto de 30.
  `lastSeenAt` se escribe como mucho cada 5 minutos.
- La sesión tiene `mfaPending`. Un guard global exige sesión completa en todo
  endpoint salvo los marcados `@Public()` (registro, login) o `@AllowPending()`
  (completar el 2FA, salir). Al completar el 2FA se emite un token nuevo y se
  revoca el pendiente.

## Consecuencias

- **+** Logout, "cerrar todas" y "cerrar ésta" son un UPDATE con efecto inmediato.
- **+** Cambiar la contraseña revoca las demás sesiones en el acto.
- **+** La pantalla de sesiones sale de la misma tabla, sin infraestructura extra.
- **+** Nada que firmar ni rotar: no hay clave de JWT que se pueda filtrar.
- **−** Una consulta a Postgres por request (índice único sobre `token_hash`).
  Irrelevante a esta escala; si dejara de serlo, la sesión se cachea en Redis
  con TTL corto, que ya está en el stack.
- **−** Una API separada en otro dominio necesitaría otro mecanismo (o un
  endpoint de introspección). No es el caso: la web llega por el mismo origen.

## Alternativas descartadas

- **JWT + refresh (como el helpdesk).** Resuelve un problema que acá no existe
  y complica justo lo que importa: revocar ya y listar dispositivos.
- **JWT en localStorage.** Cualquier XSS se lleva el token; con cookie HttpOnly no.

/**
 * Escuchar en 127.0.0.1 no alcanza: una página que resuelve su dominio a
 * 127.0.0.1 (DNS rebinding) pasa a ser same-origin y CORS no la frena. El
 * header Host la delata.
 */
export function isAllowedHost(host: string | undefined, port: number): boolean {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF: todo pedido que cambia algo tiene que traer el Origin de la web.
 * SameSite=Lax no alcanza en localhost (todos los puertos son el mismo *site*),
 * y sin Origin no hay forma de saber de dónde viene: se rechaza. Los navegadores
 * lo mandan siempre en POST/DELETE; curl lo necesita a mano (-H Origin:).
 */
export function isAllowedOrigin(method: string, origin: string | undefined, allowed: string[]): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;
  return origin !== undefined && allowed.includes(origin);
}

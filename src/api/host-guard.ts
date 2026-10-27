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
 * CSRF, segunda capa (la primera es SameSite=Lax): un pedido que cambia algo
 * y viene de un navegador trae Origin, y tiene que ser el de la web. Sin
 * Origin no es un navegador, y sin navegador no hay cookie ajena que robar.
 */
export function isAllowedOrigin(method: string, origin: string | undefined, allowed: string[]): boolean {
  if (SAFE_METHODS.has(method.toUpperCase()) || origin === undefined) return true;
  return allowed.includes(origin);
}

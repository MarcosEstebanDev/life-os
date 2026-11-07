/**
 * Escuchar en 127.0.0.1 no alcanza: una página que resuelve su dominio a
 * 127.0.0.1 (DNS rebinding) pasa a ser same-origin y CORS no la frena. El
 * header Host la delata.
 */
export function isAllowedHost(host: string | undefined, port: number): boolean {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

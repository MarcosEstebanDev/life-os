const BASE = 'http://life-os.invalid';

/**
 * Sólo rutas internas. Comparar prefijos no alcanza: el parser de URL ignora
 * tabs y saltos de línea, y `/\t/evil.com` termina en evil.com. Se resuelve
 * la URL de verdad y se exige el mismo origen.
 */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/')) return '/brief';
  const url = new URL(next, BASE);
  return url.origin === BASE ? url.pathname + url.search + url.hash : '/brief';
}

/** Sólo rutas internas: un ?next=https://otro-sitio o //otro-sitio no redirige afuera. */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/brief';
}

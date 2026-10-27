import { createHash, randomBytes } from 'node:crypto';

/**
 * El token viaja en la cookie; en la base sólo queda su SHA-256. Si se filtra
 * la base, no se filtran sesiones. No hace falta un hash lento: 256 bits
 * aleatorios no se pueden adivinar por fuerza bruta.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newSessionToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

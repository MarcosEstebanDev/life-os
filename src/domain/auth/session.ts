export const IDLE_TIMEOUT_MS = 7 * 86_400_000;
export const ABSOLUTE_TIMEOUT_MS = 30 * 86_400_000;
export const TOUCH_INTERVAL_MS = 5 * 60_000;
/** Pasó la contraseña y falta el código: diez minutos alcanzan para sacar el celular. */
export const MFA_PENDING_TIMEOUT_MS = 10 * 60_000;

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  /** Pasó la contraseña pero le falta el segundo factor: sólo puede completar el login. */
  mfaPending: boolean;
  userAgent: string | null;
  ip: string | null;
}

export type SessionState = 'active' | 'expired' | 'revoked';

/** Deslizante por inactividad, con tope absoluto: una sesión robada no vive para siempre. */
export function nextExpiry(createdAt: Date, now: Date): Date {
  return new Date(Math.min(now.getTime() + IDLE_TIMEOUT_MS, createdAt.getTime() + ABSOLUTE_TIMEOUT_MS));
}

export function sessionState(s: SessionRecord, now: Date): SessionState {
  if (s.revokedAt) return 'revoked';
  return now.getTime() >= s.expiresAt.getTime() ? 'expired' : 'active';
}

/** No se escribe en la base en cada request: alcanza con saber la última actividad cada 5 minutos. */
export function shouldTouch(s: SessionRecord, now: Date): boolean {
  return now.getTime() - s.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS;
}

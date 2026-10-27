import { nextExpiry, type SessionRecord } from '../../domain/auth/session.js';
import { newSessionToken } from '../../domain/auth/session-token.js';
import type {
  AuthEventLog,
  AuthEventType,
  PasswordHasher,
  RateLimiter,
  RecoveryCodeRepository,
  RequestContext,
  SessionRepository,
  UserRepository,
} from '../../domain/ports/auth.ports.js';
import type { SecretBox } from '../../domain/ports/secret-box.port.js';

/** Todo lo que necesitan los casos de uso de autenticación. Uno solo, para cablearlos igual. */
export interface AuthDeps {
  users: UserRepository;
  sessions: SessionRepository;
  recovery: RecoveryCodeRepository;
  hasher: PasswordHasher;
  limiter: RateLimiter;
  events: AuthEventLog;
  clock: { now(): string };
  box: SecretBox;
  allowSignup: boolean;
}

export type AuthErrorKind =
  | 'validation'
  | 'conflict'
  | 'signup_closed'
  | 'invalid_credentials'
  | 'rate_limited'
  | 'unauthenticated'
  | 'mfa_required'
  | 'invalid_code'
  | 'not_found';

export class AuthError extends Error {
  constructor(
    readonly kind: AuthErrorKind,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

/** Mismo mensaje exista o no el email: no se confirma qué cuentas hay. */
export const INVALID_CREDENTIALS = 'email o contraseña incorrectos';

export const now = (deps: AuthDeps) => new Date(deps.clock.now());

export async function openSession(
  deps: AuthDeps,
  userId: string,
  ctx: RequestContext,
  mfaPending: boolean,
): Promise<{ token: string; session: SessionRecord }> {
  const at = now(deps);
  const { token, hash } = newSessionToken();
  const session = await deps.sessions.create({
    userId,
    tokenHash: hash,
    createdAt: at,
    lastSeenAt: at,
    expiresAt: nextExpiry(at, at),
    revokedAt: null,
    mfaPending,
    userAgent: ctx.userAgent?.slice(0, 300) ?? null,
    ip: ctx.ip,
  });
  return { token, session };
}

export function recordEvent(deps: AuthDeps, type: AuthEventType, userId: string | null, ctx: RequestContext) {
  return deps.events.record({ type, userId, ip: ctx.ip, userAgent: ctx.userAgent, at: now(deps) });
}

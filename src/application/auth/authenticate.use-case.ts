import { nextExpiry, sessionState, shouldTouch, type SessionRecord } from '../../domain/auth/session.js';
import { hashToken } from '../../domain/auth/session-token.js';
import type { UserRecord } from '../../domain/ports/auth.ports.js';
import { AuthError, now, type AuthDeps } from './auth-deps.js';

/** Cookie → usuario. Corre en cada request, así que escribe en la base como mucho cada 5 minutos. */
export class AuthenticateUseCase {
  constructor(private readonly deps: AuthDeps) {}

  async execute(token: string, opts: { allowPending?: boolean } = {}): Promise<{ user: UserRecord; session: SessionRecord }> {
    const session = await this.deps.sessions.findByTokenHash(hashToken(token));
    const at = now(this.deps);
    if (!session || sessionState(session, at) !== 'active') throw new AuthError('unauthenticated', 'la sesión no es válida');
    if (session.mfaPending && !opts.allowPending) throw new AuthError('mfa_required', 'falta el segundo factor');

    let current = session;
    if (shouldTouch(session, at)) {
      current = { ...session, lastSeenAt: at, expiresAt: nextExpiry(session.createdAt, at) };
      await this.deps.sessions.update(session.id, { lastSeenAt: current.lastSeenAt, expiresAt: current.expiresAt });
    }
    return { user: await this.deps.users.get(session.userId), session: current };
  }
}

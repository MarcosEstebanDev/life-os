import type { SessionRecord } from '../../domain/auth/session.js';
import type { RequestContext } from '../../domain/ports/auth.ports.js';
import { AuthError, now, recordEvent, type AuthDeps } from './auth-deps.js';

export interface SessionView {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  userAgent: string | null;
  ip: string | null;
  current: boolean;
}

/** Lo que las sesiones en la base permiten y un JWT no: ver los dispositivos y cortarlos ya. */
export class SessionsUseCase {
  constructor(private readonly deps: AuthDeps) {}

  async logout(session: SessionRecord, ctx: RequestContext): Promise<void> {
    await this.deps.sessions.update(session.id, { revokedAt: now(this.deps) });
    await recordEvent(this.deps, 'logout', session.userId, ctx);
  }

  async logoutAll(session: SessionRecord, ctx: RequestContext): Promise<void> {
    await this.deps.sessions.revokeAll(session.userId, now(this.deps));
    await recordEvent(this.deps, 'logout_all', session.userId, ctx);
  }

  async list(session: SessionRecord): Promise<SessionView[]> {
    const active = await this.deps.sessions.listActive(session.userId, now(this.deps));
    return active
      .filter((s) => !s.mfaPending)
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
      .map((s) => ({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        lastSeenAt: s.lastSeenAt.toISOString(),
        userAgent: s.userAgent,
        ip: s.ip,
        current: s.id === session.id,
      }));
  }

  /** Una sesión de otro usuario "no existe": 404, no 403. */
  async revoke(session: SessionRecord, targetId: string, ctx: RequestContext): Promise<void> {
    const target = await this.deps.sessions.get(targetId);
    if (!target || target.userId !== session.userId) throw new AuthError('not_found', 'la sesión no existe');
    await this.deps.sessions.update(targetId, { revokedAt: now(this.deps) });
    await recordEvent(this.deps, 'session_revoked', session.userId, ctx);
  }
}

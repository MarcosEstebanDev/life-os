import { validatePassword } from '../../domain/auth/password-policy.js';
import type { SessionRecord } from '../../domain/auth/session.js';
import type { RequestContext } from '../../domain/ports/auth.ports.js';
import { AuthError, INVALID_CREDENTIALS, now, recordEvent, type AuthDeps } from './auth-deps.js';

export class ChangePasswordUseCase {
  constructor(private readonly deps: AuthDeps) {}

  /** Si cambio la contraseña porque sospecho algo, cualquier otra sesión abierta tiene que morir. */
  async execute(session: SessionRecord, input: { current: string; next: string }, ctx: RequestContext): Promise<void> {
    const user = await this.deps.users.get(session.userId);
    if (!(await this.deps.hasher.verify(user.passwordHash, input.current))) {
      throw new AuthError('invalid_credentials', INVALID_CREDENTIALS);
    }
    const invalid = validatePassword(input.next);
    if (invalid) throw new AuthError('validation', invalid);

    await this.deps.users.update(user.id, { passwordHash: await this.deps.hasher.hash(input.next) });
    await this.deps.sessions.revokeAll(user.id, now(this.deps), session.id);
    await recordEvent(this.deps, 'password_changed', user.id, ctx);
  }
}

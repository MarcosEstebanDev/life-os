import { normalizeEmail, validateEmail } from '../../domain/auth/email.js';
import { validatePassword } from '../../domain/auth/password-policy.js';
import type { RequestContext, UserRecord } from '../../domain/ports/auth.ports.js';
import { AuthError, openSession, recordEvent, type AuthDeps } from './auth-deps.js';

export class RegisterUseCase {
  constructor(private readonly deps: AuthDeps) {}

  /** Registrarse deja la sesión abierta: no hay verificación de email todavía. */
  async execute(input: { email: string; password: string }, ctx: RequestContext): Promise<{ token: string; user: UserRecord }> {
    if (!this.deps.allowSignup) throw new AuthError('signup_closed', 'el registro está cerrado');
    const email = normalizeEmail(input.email);
    const invalid = validateEmail(email) ?? validatePassword(input.password);
    if (invalid) throw new AuthError('validation', invalid);
    // En una app personal confirmar que el email ya existe es aceptable (ver la spec).
    if (await this.deps.users.findByEmail(email)) throw new AuthError('conflict', 'ya hay una cuenta con ese email');

    const user = await this.deps.users.create({ email, passwordHash: await this.deps.hasher.hash(input.password) });
    const { token } = await openSession(this.deps, user.id, ctx, false);
    await recordEvent(this.deps, 'registered', user.id, ctx);
    return { token, user };
  }
}

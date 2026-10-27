import { randomBytes } from 'node:crypto';
import { normalizeEmail } from '../../domain/auth/email.js';
import { normalizeRecoveryCode } from '../../domain/auth/recovery-codes.js';
import type { SessionRecord } from '../../domain/auth/session.js';
import { hashToken } from '../../domain/auth/session-token.js';
import { verifyTotp } from '../../domain/auth/totp.js';
import type { RequestContext } from '../../domain/ports/auth.ports.js';
import { AuthError, INVALID_CREDENTIALS, now, openSession, recordEvent, type AuthDeps } from './auth-deps.js';

const WINDOW_LIMITS = { email: 5, ip: 20 };
/** Por sesión pendiente: a los 5 códigos malos se cierra. */
const MFA_ATTEMPTS_PER_SESSION = 5;
/**
 * Por usuario, y no se reinicia al loguearse con contraseña: abrir sesiones
 * pendientes nuevas no regala intentos. 10 cada 15 minutos contra 10^6 códigos.
 */
const MFA_ATTEMPTS_PER_USER = 10;
export const mfaUserKey = (userId: string) => `mfa:user:${userId}`;

export class LoginUseCase {
  /** Hash de una contraseña que nadie tiene: un email inexistente cuesta lo mismo que uno real. */
  private dummyHash: Promise<string> | null = null;

  constructor(private readonly deps: AuthDeps) {}

  async execute(
    input: { email: string; password: string },
    ctx: RequestContext,
  ): Promise<{ token: string; mfaRequired: boolean; session: SessionRecord }> {
    const email = normalizeEmail(input.email);
    const emailKey = `login:email:${email}`;
    const ipKey = `login:ip:${ctx.ip ?? 'desconocida'}`;
    const retryAfter = await this.deps.limiter.consume([
      { key: emailKey, limit: WINDOW_LIMITS.email },
      { key: ipKey, limit: WINDOW_LIMITS.ip },
    ]);
    if (retryAfter !== null) throw new AuthError('rate_limited', 'demasiados intentos, probá más tarde', retryAfter);

    const user = await this.deps.users.findByEmail(email);
    this.dummyHash ??= this.deps.hasher.hash(randomBytes(32).toString('hex'));
    const matches = await this.deps.hasher.verify(user?.passwordHash ?? (await this.dummyHash), input.password);
    if (!user || !matches) {
      await recordEvent(this.deps, 'login_failed', user?.id ?? null, ctx);
      throw new AuthError('invalid_credentials', INVALID_CREDENTIALS);
    }

    await this.deps.limiter.reset(emailKey);
    const mfaRequired = user.totpEnabledAt !== null;
    if (mfaRequired) {
      const mfaBlocked = await this.deps.limiter.blockedFor([{ key: mfaUserKey(user.id), limit: MFA_ATTEMPTS_PER_USER }]);
      if (mfaBlocked !== null) throw new AuthError('rate_limited', 'demasiados códigos incorrectos, probá más tarde', mfaBlocked);
    }
    const { token, session } = await openSession(this.deps, user.id, ctx, mfaRequired);
    if (!mfaRequired) await recordEvent(this.deps, 'login_succeeded', user.id, ctx);
    return { token, mfaRequired, session };
  }
}

/**
 * Segundo paso del login. Al completarlo se emite un token NUEVO y el
 * pendiente se revoca: el privilegio cambió, la sesión también (fijación de sesión).
 */
export class CompleteMfaUseCase {
  constructor(private readonly deps: AuthDeps) {}

  async execute(pending: SessionRecord, code: string, ctx: RequestContext): Promise<{ token: string }> {
    const user = await this.deps.users.get(pending.userId);
    if (!pending.mfaPending || !user.totpSecretSealed || !user.totpEnabledAt) {
      throw new AuthError('unauthenticated', 'no hay un login pendiente de segundo factor');
    }

    const at = now(this.deps);
    const sessionKey = `mfa:session:${pending.id}`;
    const blocked = await this.deps.limiter.consume([
      { key: mfaUserKey(user.id), limit: MFA_ATTEMPTS_PER_USER },
      { key: sessionKey, limit: MFA_ATTEMPTS_PER_SESSION },
    ]);
    if (blocked !== null) {
      await this.deps.sessions.update(pending.id, { revokedAt: at });
      throw new AuthError('rate_limited', 'demasiados códigos incorrectos, probá más tarde', blocked);
    }

    const trimmed = code.trim();
    let ok = false;
    if (/^\d{6}$/.test(trimmed)) {
      const result = verifyTotp(this.deps.box.open(user.totpSecretSealed), trimmed, at, user.totpLastStep);
      ok = result.ok && (await this.deps.users.claimTotpStep(user.id, result.step));
    } else if (await this.deps.recovery.consume(user.id, hashToken(normalizeRecoveryCode(trimmed)), at)) {
      await recordEvent(this.deps, 'recovery_code_used', user.id, ctx);
      ok = true;
    }

    if (!ok) {
      await recordEvent(this.deps, 'mfa_failed', user.id, ctx);
      if ((await this.deps.limiter.blockedFor([{ key: sessionKey, limit: MFA_ATTEMPTS_PER_SESSION }])) !== null) {
        await this.deps.sessions.update(pending.id, { revokedAt: at });
      }
      throw new AuthError('invalid_code', 'el código no es válido');
    }

    await this.deps.limiter.reset(sessionKey);
    await this.deps.limiter.reset(mfaUserKey(user.id));
    await this.deps.sessions.update(pending.id, { revokedAt: at });
    const { token } = await openSession(this.deps, user.id, ctx, false);
    await recordEvent(this.deps, 'login_succeeded', user.id, ctx);
    return { token };
  }
}

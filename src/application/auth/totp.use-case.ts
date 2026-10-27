import { generateRecoveryCodes, normalizeRecoveryCode } from '../../domain/auth/recovery-codes.js';
import { hashToken } from '../../domain/auth/session-token.js';
import { generateSecret, otpauthUri, verifyTotp } from '../../domain/auth/totp.js';
import type { RequestContext } from '../../domain/ports/auth.ports.js';
import { AuthError, INVALID_CREDENTIALS, now, recordEvent, type AuthDeps } from './auth-deps.js';

export class TotpUseCase {
  constructor(private readonly deps: AuthDeps) {}

  /** Genera el secreto pero no lo activa: recién cuenta cuando se prueba con un código. */
  async setup(userId: string): Promise<{ secret: string; uri: string }> {
    const user = await this.deps.users.get(userId);
    if (user.totpEnabledAt) throw new AuthError('conflict', 'la verificación en dos pasos ya está activa');
    const secret = generateSecret();
    await this.deps.users.update(userId, { totpSecretSealed: this.deps.box.seal(secret), totpLastStep: null });
    return { secret, uri: otpauthUri(secret, user.email) };
  }

  /** Los códigos de recuperación se muestran esta única vez; en la base queda sólo su hash. */
  async enable(userId: string, code: string, ctx: RequestContext): Promise<{ recoveryCodes: string[] }> {
    const user = await this.deps.users.get(userId);
    if (user.totpEnabledAt) throw new AuthError('conflict', 'la verificación en dos pasos ya está activa');
    if (!user.totpSecretSealed) throw new AuthError('validation', 'primero hay que generar el código QR');
    const result = verifyTotp(this.deps.box.open(user.totpSecretSealed), code.trim(), now(this.deps), null);
    if (!result.ok) throw new AuthError('invalid_code', 'el código no es válido');

    const recoveryCodes = generateRecoveryCodes();
    await this.deps.recovery.replaceAll(userId, recoveryCodes.map((c) => hashToken(normalizeRecoveryCode(c))));
    await this.deps.users.update(userId, { totpEnabledAt: now(this.deps), totpLastStep: result.step });
    await recordEvent(this.deps, 'totp_enabled', userId, ctx);
    return { recoveryCodes };
  }

  /** Apagar la protección pide las dos cosas que protege: contraseña y segundo factor. */
  async disable(userId: string, input: { password: string; code: string }, ctx: RequestContext): Promise<void> {
    const user = await this.deps.users.get(userId);
    if (!user.totpEnabledAt || !user.totpSecretSealed) throw new AuthError('validation', 'la verificación en dos pasos no está activa');
    if (!(await this.deps.hasher.verify(user.passwordHash, input.password))) {
      throw new AuthError('invalid_credentials', INVALID_CREDENTIALS);
    }
    const at = now(this.deps);
    const code = input.code.trim();
    const ok = /^\d{6}$/.test(code)
      ? verifyTotp(this.deps.box.open(user.totpSecretSealed), code, at, user.totpLastStep).ok
      : await this.deps.recovery.consume(userId, hashToken(normalizeRecoveryCode(code)), at);
    if (!ok) throw new AuthError('invalid_code', 'el código no es válido');

    await this.deps.users.update(userId, { totpSecretSealed: null, totpEnabledAt: null, totpLastStep: null });
    await this.deps.recovery.deleteAll(userId);
    await recordEvent(this.deps, 'totp_disabled', userId, ctx);
  }
}

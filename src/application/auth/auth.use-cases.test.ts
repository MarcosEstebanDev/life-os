import { test } from 'node:test';
import assert from 'node:assert/strict';
import { totpAt } from '../../domain/auth/totp.js';
import { AuthError, type AuthDeps } from './auth-deps.js';
import { AuthenticateUseCase } from './authenticate.use-case.js';
import { ChangePasswordUseCase } from './change-password.use-case.js';
import { CompleteMfaUseCase, LoginUseCase } from './login.use-case.js';
import { RegisterUseCase } from './register.use-case.js';
import { SessionsUseCase } from './sessions.use-case.js';
import { TotpUseCase } from './totp.use-case.js';
import {
  FakeHasher,
  FakeSecretBox,
  InMemoryAuthEvents,
  InMemoryRateLimiter,
  InMemoryRecoveryCodes,
  InMemorySessions,
  InMemoryUsers,
  MutableClock,
} from './fakes.js';

const CTX = { ip: '127.0.0.1', userAgent: 'test' };
const PASSWORD = 'una frase larga de prueba';
const MIN = 60_000;
const DAY = 86_400_000;

function setup(overrides: Pick<Partial<AuthDeps>, 'signup'> = {}) {
  const deps = {
    users: new InMemoryUsers(),
    sessions: new InMemorySessions(),
    recovery: new InMemoryRecoveryCodes(),
    hasher: new FakeHasher(),
    limiter: new InMemoryRateLimiter(),
    events: new InMemoryAuthEvents(),
    clock: new MutableClock(),
    box: new FakeSecretBox(),
    signup: 'open' as AuthDeps['signup'],
    ...overrides,
  };
  return {
    ...deps,
    register: new RegisterUseCase(deps),
    login: new LoginUseCase(deps),
    mfa: new CompleteMfaUseCase(deps),
    authenticate: new AuthenticateUseCase(deps),
    sessionsUc: new SessionsUseCase(deps),
    changePassword: new ChangePasswordUseCase(deps),
    totp: new TotpUseCase(deps),
  };
}

async function rejectsWith(p: Promise<unknown>, kind: AuthError['kind']) {
  await assert.rejects(p, (e: unknown) => e instanceof AuthError && e.kind === kind);
}

/** Usuario con 2FA activado; devuelve el secreto para generar códigos. */
async function userWithTotp(app: ReturnType<typeof setup>) {
  const { user } = await app.register.execute({ email: 'm@example.com', password: PASSWORD }, CTX);
  const { secret } = await app.totp.setup(user.id);
  const step = Math.floor(app.clock.current.getTime() / 30_000);
  const { recoveryCodes } = await app.totp.enable(user.id, totpAt(secret, step), CTX);
  app.clock.advance(31_000);
  return { user, secret, recoveryCodes };
}
const currentCode = (app: ReturnType<typeof setup>, secret: string) => totpAt(secret, Math.floor(app.clock.current.getTime() / 30_000));

// ---------- Registro ----------

test('registrarse crea el usuario con la contraseña hasheada y deja la sesión abierta', async () => {
  const app = setup();
  const { token, user } = await app.register.execute({ email: ' M@Example.com ', password: PASSWORD }, CTX);
  assert.equal(user.email, 'm@example.com');
  assert.notEqual(user.passwordHash, PASSWORD);
  assert.equal((await app.authenticate.execute(token)).user.id, user.id);
  assert.ok(![...app.sessions.items.values()].some((s) => s.tokenHash === token), 'el token no se guarda en claro');
});

test('no se puede registrar dos veces el mismo email', async () => {
  const app = setup();
  await app.register.execute({ email: 'm@example.com', password: PASSWORD }, CTX);
  await rejectsWith(app.register.execute({ email: 'M@EXAMPLE.COM', password: PASSWORD }, CTX), 'conflict');
});

test('una contraseña corta o un email inválido no pasan', async () => {
  const app = setup();
  await rejectsWith(app.register.execute({ email: 'm@example.com', password: 'corta' }, CTX), 'validation');
  await rejectsWith(app.register.execute({ email: 'no-es-email', password: PASSWORD }, CTX), 'validation');
});

test('con el registro cerrado no se pueden crear cuentas', async () => {
  const app = setup({ signup: 'closed' });
  await rejectsWith(app.register.execute({ email: 'm@example.com', password: PASSWORD }, CTX), 'signup_closed');
});

// ---------- Login ----------

test('login correcto devuelve una sesión que autentica', async () => {
  const app = setup();
  await app.register.execute({ email: 'm@example.com', password: PASSWORD }, CTX);
  const { token, mfaRequired } = await app.login.execute({ email: 'm@example.com', password: PASSWORD }, CTX);
  assert.equal(mfaRequired, false);
  assert.equal((await app.authenticate.execute(token)).user.email, 'm@example.com');
});

test('email inexistente y contraseña incorrecta dan el mismo error, y los dos verifican un hash', async () => {
  const app = setup();
  await app.register.execute({ email: 'm@example.com', password: PASSWORD }, CTX);
  const before = app.hasher.verifications;
  await rejectsWith(app.login.execute({ email: 'otro@example.com', password: PASSWORD }, CTX), 'invalid_credentials');
  await rejectsWith(app.login.execute({ email: 'm@example.com', password: 'otra frase larga mala' }, CTX), 'invalid_credentials');
  assert.equal(app.hasher.verifications - before, 2);
  assert.equal(app.events.items.filter((e) => e.type === 'login_failed').length, 2);
});

test('después de 5 fallos el email queda bloqueado aunque la contraseña sea correcta', async () => {
  const app = setup();
  await app.register.execute({ email: 'm@example.com', password: PASSWORD }, CTX);
  for (let i = 0; i < 5; i++) {
    await rejectsWith(app.login.execute({ email: 'm@example.com', password: 'otra frase larga mala' }, CTX), 'invalid_credentials');
  }
  await assert.rejects(
    app.login.execute({ email: 'm@example.com', password: PASSWORD }, CTX),
    (e: unknown) => e instanceof AuthError && e.kind === 'rate_limited' && (e.retryAfter ?? 0) > 0,
  );
});

test('un login correcto limpia los fallos del email', async () => {
  const app = setup();
  await app.register.execute({ email: 'm@example.com', password: PASSWORD }, CTX);
  for (let i = 0; i < 4; i++) {
    await rejectsWith(app.login.execute({ email: 'm@example.com', password: 'otra frase larga mala' }, CTX), 'invalid_credentials');
  }
  await app.login.execute({ email: 'm@example.com', password: PASSWORD }, CTX);
  await rejectsWith(app.login.execute({ email: 'm@example.com', password: 'otra frase larga mala' }, CTX), 'invalid_credentials');
});

// ---------- Sesión ----------

test('una sesión vence tras 7 días sin uso', async () => {
  const app = setup();
  const { token } = await app.register.execute({ email: 'm@example.com', password: PASSWORD }, CTX);
  app.clock.advance(7 * DAY);
  await rejectsWith(app.authenticate.execute(token), 'unauthenticated');
});

test('usar la sesión la extiende, como mucho cada 5 minutos', async () => {
  const app = setup();
  const { token } = await app.register.execute({ email: 'm@example.com', password: PASSWORD }, CTX);
  app.clock.advance(6 * DAY);
  await app.authenticate.execute(token);
  app.clock.advance(2 * DAY);
  assert.ok(await app.authenticate.execute(token));
});

test('un token inventado no autentica', async () => {
  await rejectsWith(setup().authenticate.execute('cualquier-cosa'), 'unauthenticated');
});

test('cerrar sesión la invalida al instante', async () => {
  const app = setup();
  const { token } = await app.register.execute({ email: 'm@example.com', password: PASSWORD }, CTX);
  const { session } = await app.authenticate.execute(token);
  await app.sessionsUc.logout(session, CTX);
  await rejectsWith(app.authenticate.execute(token), 'unauthenticated');
});

test('cerrar todas las sesiones invalida también las de otros dispositivos', async () => {
  const app = setup();
  const { token: a } = await app.register.execute({ email: 'm@example.com', password: PASSWORD }, CTX);
  const { token: b } = await app.login.execute({ email: 'm@example.com', password: PASSWORD }, { ip: '10.0.0.2', userAgent: 'celular' });
  await app.sessionsUc.logoutAll((await app.authenticate.execute(a)).session, CTX);
  await rejectsWith(app.authenticate.execute(a), 'unauthenticated');
  await rejectsWith(app.authenticate.execute(b), 'unauthenticated');
});

test('la lista de sesiones marca la actual y se puede revocar otra', async () => {
  const app = setup();
  const { token: a } = await app.register.execute({ email: 'm@example.com', password: PASSWORD }, CTX);
  const { token: b } = await app.login.execute({ email: 'm@example.com', password: PASSWORD }, { ip: '10.0.0.2', userAgent: 'celular' });
  const current = (await app.authenticate.execute(a)).session;
  const list = await app.sessionsUc.list(current);
  assert.equal(list.length, 2);
  const other = list.find((s) => !s.current)!;
  assert.equal(other.userAgent, 'celular');
  await app.sessionsUc.revoke(current, other.id, CTX);
  await rejectsWith(app.authenticate.execute(b), 'unauthenticated');
  assert.ok(await app.authenticate.execute(a));
});

test('no se puede revocar la sesión de otro usuario', async () => {
  const app = setup();
  const { token: a } = await app.register.execute({ email: 'a@example.com', password: PASSWORD }, CTX);
  const { token: b } = await app.register.execute({ email: 'b@example.com', password: PASSWORD }, CTX);
  const sessionB = (await app.authenticate.execute(b)).session;
  await rejectsWith(app.sessionsUc.revoke((await app.authenticate.execute(a)).session, sessionB.id, CTX), 'not_found');
  assert.ok(await app.authenticate.execute(b));
});

// ---------- Contraseña ----------

test('cambiar la contraseña cierra las otras sesiones y deja la actual', async () => {
  const app = setup();
  const { token: a } = await app.register.execute({ email: 'm@example.com', password: PASSWORD }, CTX);
  const { token: b } = await app.login.execute({ email: 'm@example.com', password: PASSWORD }, CTX);
  const current = (await app.authenticate.execute(a)).session;
  await app.changePassword.execute(current, { current: PASSWORD, next: 'otra frase larga nueva' }, CTX);
  assert.ok(await app.authenticate.execute(a));
  await rejectsWith(app.authenticate.execute(b), 'unauthenticated');
  await app.login.execute({ email: 'm@example.com', password: 'otra frase larga nueva' }, CTX);
});

test('cambiar la contraseña exige la actual', async () => {
  const app = setup();
  const { token } = await app.register.execute({ email: 'm@example.com', password: PASSWORD }, CTX);
  const session = (await app.authenticate.execute(token)).session;
  await rejectsWith(app.changePassword.execute(session, { current: 'no es la actual nop', next: 'otra frase larga nueva' }, CTX), 'invalid_credentials');
});

// ---------- 2FA ----------

test('activar 2FA exige un código válido y devuelve 10 códigos de recuperación', async () => {
  const app = setup();
  const { user } = await app.register.execute({ email: 'm@example.com', password: PASSWORD }, CTX);
  const { secret, uri } = await app.totp.setup(user.id);
  assert.match(uri, /^otpauth:\/\/totp\/life-os:m%40example\.com\?secret=/);
  await rejectsWith(app.totp.enable(user.id, '000000', CTX), 'invalid_code');
  const { recoveryCodes } = await app.totp.enable(user.id, currentCode(app, secret), CTX);
  assert.equal(recoveryCodes.length, 10);
  assert.equal(await app.recovery.countUnused(user.id), 10);
  assert.ok(!app.recovery.items.some((c) => recoveryCodes.includes(c.hash)), 'los códigos no se guardan en claro');
  assert.match((await app.users.get(user.id)).totpSecretSealed ?? '', /^sealed:/);
});

test('con 2FA, la contraseña sola deja una sesión que no sirve para nada más', async () => {
  const app = setup();
  await userWithTotp(app);
  const { token, mfaRequired } = await app.login.execute({ email: 'm@example.com', password: PASSWORD }, CTX);
  assert.equal(mfaRequired, true);
  await rejectsWith(app.authenticate.execute(token), 'mfa_required');
  assert.ok(await app.authenticate.execute(token, { allowPending: true }));
});

test('el código completa el login con un token nuevo y el pendiente deja de servir', async () => {
  const app = setup();
  const { secret } = await userWithTotp(app);
  const { token: pending } = await app.login.execute({ email: 'm@example.com', password: PASSWORD }, CTX);
  const pendingSession = (await app.authenticate.execute(pending, { allowPending: true })).session;
  const { token } = await app.mfa.execute(pendingSession, currentCode(app, secret), CTX);
  assert.notEqual(token, pending);
  assert.ok(await app.authenticate.execute(token));
  await rejectsWith(app.authenticate.execute(pending, { allowPending: true }), 'unauthenticated');
});

test('un código TOTP ya usado no sirve otra vez', async () => {
  const app = setup();
  const { secret } = await userWithTotp(app);
  const code = currentCode(app, secret);
  const first = await app.login.execute({ email: 'm@example.com', password: PASSWORD }, CTX);
  await app.mfa.execute((await app.authenticate.execute(first.token, { allowPending: true })).session, code, CTX);
  const second = await app.login.execute({ email: 'm@example.com', password: PASSWORD }, CTX);
  const pending = (await app.authenticate.execute(second.token, { allowPending: true })).session;
  await rejectsWith(app.mfa.execute(pending, code, CTX), 'invalid_code');
});

test('un código de recuperación sirve una sola vez', async () => {
  const app = setup();
  const { recoveryCodes } = await userWithTotp(app);
  const login = async () => (await app.authenticate.execute((await app.login.execute({ email: 'm@example.com', password: PASSWORD }, CTX)).token, { allowPending: true })).session;
  await app.mfa.execute(await login(), recoveryCodes[0].toUpperCase(), CTX);
  await rejectsWith(app.mfa.execute(await login(), recoveryCodes[0], CTX), 'invalid_code');
  assert.ok(app.events.items.some((e) => e.type === 'recovery_code_used'));
});

test('cinco códigos incorrectos cierran la sesión pendiente', async () => {
  const app = setup();
  await userWithTotp(app);
  const { token } = await app.login.execute({ email: 'm@example.com', password: PASSWORD }, CTX);
  const pending = (await app.authenticate.execute(token, { allowPending: true })).session;
  for (let i = 0; i < 5; i++) await rejectsWith(app.mfa.execute(pending, '000000', CTX), 'invalid_code');
  await rejectsWith(app.authenticate.execute(token, { allowPending: true }), 'unauthenticated');
});

test('el 2FA no se puede adivinar abriendo sesiones pendientes nuevas', async () => {
  const app = setup();
  const { secret } = await userWithTotp(app);
  for (let round = 0; round < 2; round++) {
    const { token } = await app.login.execute({ email: 'm@example.com', password: PASSWORD }, CTX);
    const pending = (await app.authenticate.execute(token, { allowPending: true })).session;
    for (let i = 0; i < 5; i++) await rejectsWith(app.mfa.execute(pending, '000000', CTX), 'invalid_code');
  }
  await rejectsWith(app.login.execute({ email: 'm@example.com', password: PASSWORD }, CTX), 'rate_limited');
  const pending = [...app.sessions.items.values()].find((s) => s.mfaPending && !s.revokedAt);
  if (pending) await rejectsWith(app.mfa.execute(pending, currentCode(app, secret), CTX), 'rate_limited');
});

test('el mismo código en dos sesiones pendientes en paralelo sirve una sola vez', async () => {
  const app = setup();
  const { secret } = await userWithTotp(app);
  const pendingSession = async () =>
    (await app.authenticate.execute((await app.login.execute({ email: 'm@example.com', password: PASSWORD }, CTX)).token, { allowPending: true })).session;
  const [a, b] = [await pendingSession(), await pendingSession()];
  const code = currentCode(app, secret);
  const results = await Promise.allSettled([app.mfa.execute(a, code, CTX), app.mfa.execute(b, code, CTX)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
});

test('una sesión pendiente de 2FA vence a los 10 minutos y usarla no la estira', async () => {
  const app = setup();
  await userWithTotp(app);
  const { token } = await app.login.execute({ email: 'm@example.com', password: PASSWORD }, CTX);
  app.clock.advance(6 * MIN);
  await app.authenticate.execute(token, { allowPending: true });
  app.clock.advance(4 * MIN);
  await rejectsWith(app.authenticate.execute(token, { allowPending: true }), 'unauthenticated');
});

test('con el registro en modo "primera cuenta", sólo se crea una', async () => {
  const app = setup({ signup: 'first' });
  await app.register.execute({ email: 'm@example.com', password: PASSWORD }, CTX);
  await rejectsWith(app.register.execute({ email: 'otro@example.com', password: PASSWORD }, CTX), 'signup_closed');
});

test('desactivar 2FA exige contraseña y código', async () => {
  const app = setup();
  const { user, secret } = await userWithTotp(app);
  await rejectsWith(app.totp.disable(user.id, { password: 'no es la contraseña', code: currentCode(app, secret) }, CTX), 'invalid_credentials');
  await app.totp.disable(user.id, { password: PASSWORD, code: currentCode(app, secret) }, CTX);
  const u = await app.users.get(user.id);
  assert.equal(u.totpEnabledAt, null);
  assert.equal(u.totpSecretSealed, null);
  assert.equal(await app.recovery.countUnused(user.id), 0);
  assert.equal((await app.login.execute({ email: 'm@example.com', password: PASSWORD }, CTX)).mfaRequired, false);
});

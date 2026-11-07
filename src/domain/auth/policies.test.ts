import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmail, validateEmail } from './email.js';
import { validatePassword } from './password-policy.js';
import { hashToken, newSessionToken } from './session-token.js';
import { nextExpiry, sessionState, shouldTouch, type SessionRecord } from './session.js';

test('el email se normaliza para comparar', () => {
  assert.equal(normalizeEmail('  User@Example.COM '), 'user@example.com');
});

test('un email sin arroba o con espacios no es válido', () => {
  assert.equal(validateEmail('user@example.com'), null);
  assert.notEqual(validateEmail('user'), null);
  assert.notEqual(validateEmail('mar cos@example.com'), null);
});

test('contraseña: mínimo 12, máximo 128, sin reglas de composición', () => {
  assert.notEqual(validatePassword('corta123'), null);
  assert.equal(validatePassword('una frase larga y simple'), null);
  assert.notEqual(validatePassword('x'.repeat(129)), null);
});

test('el token de sesión es aleatorio y sólo su hash se guarda', () => {
  const a = newSessionToken();
  const b = newSessionToken();
  assert.notEqual(a.token, b.token);
  assert.match(a.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(a.hash, hashToken(a.token));
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.notEqual(a.hash, a.token);
});

const DAY = 86_400_000;
const T0 = new Date('2026-10-27T12:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 's1', userId: 'u1', tokenHash: 'h', createdAt: T0, lastSeenAt: T0, expiresAt: nextExpiry(T0, T0),
    revokedAt: null, mfaPending: false, userAgent: null, ip: null, ...overrides,
  };
}

test('la sesión vence a los 7 días de inactividad', () => {
  assert.equal(nextExpiry(T0, T0).getTime(), at(7 * DAY).getTime());
  assert.equal(sessionState(session(), at(7 * DAY - 1)), 'active');
  assert.equal(sessionState(session(), at(7 * DAY)), 'expired');
});

test('la renovación deslizante nunca pasa los 30 días desde que se creó', () => {
  assert.equal(nextExpiry(T0, at(28 * DAY)).getTime(), at(30 * DAY).getTime());
});

test('una sesión revocada no sirve aunque no haya vencido', () => {
  assert.equal(sessionState(session({ revokedAt: at(DAY) }), at(2 * DAY)), 'revoked');
});

test('lastSeenAt se toca como mucho cada 5 minutos', () => {
  assert.equal(shouldTouch(session(), at(4 * 60_000)), false);
  assert.equal(shouldTouch(session(), at(5 * 60_000)), true);
});

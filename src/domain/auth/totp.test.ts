import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base32Decode, base32Encode, generateSecret, otpauthUri, totpAt, verifyTotp } from './totp.js';
import { generateRecoveryCodes, normalizeRecoveryCode } from './recovery-codes.js';

// RFC 6238, apéndice B: SHA-1 con el secreto ASCII "12345678901234567890".
// Los vectores son de 8 dígitos; los de 6 son sus últimos 6.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));
const step = (unixSeconds: number) => Math.floor(unixSeconds / 30);

test('coincide con los vectores del RFC 6238', () => {
  assert.equal(totpAt(RFC_SECRET, step(59)), '287082');
  assert.equal(totpAt(RFC_SECRET, step(1111111109)), '081804');
  assert.equal(totpAt(RFC_SECRET, step(1111111111)), '050471');
  assert.equal(totpAt(RFC_SECRET, step(1234567890)), '005924');
  assert.equal(totpAt(RFC_SECRET, step(2000000000)), '279037');
});

test('base32 ida y vuelta', () => {
  const bytes = Buffer.from([0, 1, 2, 250, 255, 128, 7]);
  assert.deepEqual(base32Decode(base32Encode(bytes)), bytes);
  assert.equal(base32Encode(Buffer.from('foobar')), 'MZXW6YTBOI');
});

test('el secreto nuevo tiene 160 bits', () => {
  assert.equal(base32Decode(generateSecret()).length, 20);
});

const NOW = new Date(1111111109 * 1000);

test('acepta el código actual y el de un paso antes o después', () => {
  const s = step(1111111109);
  assert.deepEqual(verifyTotp(RFC_SECRET, '081804', NOW, null), { ok: true, step: s });
  assert.deepEqual(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, s - 1), NOW, null), { ok: true, step: s - 1 });
  assert.deepEqual(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, s + 1), NOW, null), { ok: true, step: s + 1 });
  assert.deepEqual(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, s - 2), NOW, null), { ok: false });
});

test('el mismo código no sirve dos veces', () => {
  const first = verifyTotp(RFC_SECRET, '081804', NOW, null);
  assert.ok(first.ok);
  assert.deepEqual(verifyTotp(RFC_SECRET, '081804', NOW, first.step), { ok: false });
});

test('rechaza códigos con formato inválido', () => {
  assert.deepEqual(verifyTotp(RFC_SECRET, '08180', NOW, null), { ok: false });
  assert.deepEqual(verifyTotp(RFC_SECRET, 'abcdef', NOW, null), { ok: false });
});

test('el URI otpauth lleva emisor, cuenta y secreto', () => {
  const uri = otpauthUri('JBSWY3DPEHPK3PXP', 'user@example.com');
  assert.equal(uri, 'otpauth://totp/life-os:user%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=life-os&algorithm=SHA1&digits=6&period=30');
});

test('10 códigos de recuperación distintos de 16 caracteres en grupos de 4', () => {
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const c of codes) assert.match(c, /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
});

test('un código de recuperación se compara sin guiones ni mayúsculas', () => {
  assert.equal(normalizeRecoveryCode(' ABCD-efgh-2345-6789 '), 'abcdefgh23456789');
});

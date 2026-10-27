import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { AesGcmSecretBox } from './aes-gcm-secret-box.js';

const key = randomBytes(32).toString('base64');

test('cifra y descifra', () => {
  const box = new AesGcmSecretBox(key);
  const sealed = box.seal('JBSWY3DPEHPK3PXP');
  assert.doesNotMatch(sealed, /JBSWY3DPEHPK3PXP/);
  assert.equal(box.open(sealed), 'JBSWY3DPEHPK3PXP');
});

test('dos cifrados del mismo texto son distintos (IV aleatorio)', () => {
  const box = new AesGcmSecretBox(key);
  assert.notEqual(box.seal('x'), box.seal('x'));
});

test('un texto cifrado alterado no se descifra', () => {
  const box = new AesGcmSecretBox(key);
  const sealed = box.seal('secreto');
  const [v, iv, tag, ct] = sealed.split('.');
  const tampered = [v, iv, tag, Buffer.from('otro texto').toString('base64url')].join('.');
  assert.ok(ct);
  assert.throws(() => box.open(tampered));
});

test('con otra clave no se descifra', () => {
  const sealed = new AesGcmSecretBox(key).seal('secreto');
  assert.throws(() => new AesGcmSecretBox(randomBytes(32).toString('base64')).open(sealed));
});

test('exige una clave de 32 bytes', () => {
  assert.throws(() => new AesGcmSecretBox(randomBytes(16).toString('base64')), /32 bytes/);
});

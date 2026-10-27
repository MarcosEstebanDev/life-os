import { randomInt } from 'node:crypto';

/**
 * Para cuando se pierde el celular. 16 caracteres de un alfabeto sin
 * ambigüedades (sin 0/o ni 1/l): ~80 bits, así que alcanza con guardar su
 * SHA-256, como los tokens de sesión.
 */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const COUNT = 10;
const LENGTH = 16;

export function generateRecoveryCodes(): string[] {
  const codes = new Set<string>();
  while (codes.size < COUNT) {
    let raw = '';
    for (let i = 0; i < LENGTH; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
    codes.add(raw.match(/.{4}/g)!.join('-'));
  }
  return [...codes];
}

export function normalizeRecoveryCode(code: string): string {
  return code.trim().toLowerCase().replace(/[\s-]/g, '');
}

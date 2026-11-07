import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { SecretBox } from '../../domain/ports/secret-box.port.js';

/**
 * AES-256-GCM: cifra y autentica. Un secreto TOTP alterado en la base no se
 * descifra a otra cosa, falla. Formato: v1.<iv>.<tag>.<texto cifrado>, base64url.
 */
export class AesGcmSecretBox implements SecretBox {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    this.key = Buffer.from(base64Key, 'base64');
    if (this.key.length !== 32) throw new Error('AUTH_ENCRYPTION_KEY tiene que ser de 32 bytes en base64');
  }

  seal(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return ['v1', iv, cipher.getAuthTag(), ciphertext].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
  }

  open(sealed: string): string {
    const [version, iv, tag, ciphertext] = sealed.split('.');
    if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('secreto cifrado con formato desconocido');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  }
}

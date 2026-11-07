import argon2 from 'argon2';
import type { PasswordHasher } from '../../domain/ports/auth.ports.js';

/** argon2id con los parámetros por defecto de la librería (64 MiB, 3 pasadas). */
export class Argon2PasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}

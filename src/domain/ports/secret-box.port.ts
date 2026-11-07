/** Cifrado simétrico autenticado para secretos en reposo (el secreto TOTP). */
export interface SecretBox {
  seal(plaintext: string): string;
  open(sealed: string): string;
}

export const PASSWORD_MIN = 12;
/** argon2 sobre entradas enormes es un vector de DoS. */
export const PASSWORD_MAX = 128;

/**
 * NIST SP 800-63B: largo mínimo y nada de reglas de composición, que empujan
 * a "Password1!" en vez de a una frase larga.
 */
export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `la contraseña necesita al menos ${PASSWORD_MIN} caracteres`;
  if (password.length > PASSWORD_MAX) return `la contraseña no puede pasar de ${PASSWORD_MAX} caracteres`;
  return null;
}

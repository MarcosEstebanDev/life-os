/** El email es la identidad de login: se compara siempre normalizado. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Validación mínima a propósito: la única prueba real de un email es mandarle algo. */
export function validateEmail(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : 'el email no es válido';
}

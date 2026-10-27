import type { Request, Response } from 'express';
import { ABSOLUTE_TIMEOUT_MS } from '../../domain/auth/session.js';

export const SESSION_COOKIE = 'lifeos_session';

/** Sin cookie-parser: es una sola cookie y el formato es simple. */
export function readSessionCookie(header: string | undefined): string | null {
  for (const part of header?.split(';') ?? []) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(value.join('='));
  }
  return null;
}

/**
 * HttpOnly: el JavaScript de la página no la puede leer (un XSS no se la lleva).
 * SameSite=Lax: otro sitio no la manda en un POST (CSRF). Secure cuando hay https.
 * La vida la decide la sesión en la base; la cookie dura el tope absoluto.
 */
export function setSessionCookie(req: Request, res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    path: '/',
    maxAge: ABSOLUTE_TIMEOUT_MS,
  });
}

export function clearSessionCookie(req: Request, res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/' });
}

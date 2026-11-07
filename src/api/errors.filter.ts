import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { AuthError, type AuthErrorKind } from '../application/auth/auth-deps.js';
import { NotFoundError } from '../domain/errors.js';
import { ObligationError } from '../domain/obligation.js';

const AUTH_STATUS: Record<AuthErrorKind, number> = {
  validation: 400,
  invalid_code: 400,
  invalid_credentials: 401,
  unauthenticated: 401,
  mfa_required: 401,
  signup_closed: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
};

/**
 * Errores del dominio a HTTP. `code` va en el cuerpo para que la web
 * distinga "falta el segundo factor" de "no hay sesión" sin parsear mensajes.
 */
@Catch()
export class DomainErrorsFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const send = (status: number, message: string, code?: string) => res.status(status).json({ statusCode: status, message, code });

    if (error instanceof HttpException) {
      res.status(error.getStatus()).json(error.getResponse());
      return;
    }
    if (error instanceof AuthError) {
      if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
      send(AUTH_STATUS[error.kind], error.message, error.kind);
      return;
    }
    if (error instanceof ObligationError) return void send(409, error.message);
    // P2025: no existe. Los ids mal formados ya se cortan en UuidOr404Pipe.
    const prismaCode = (error as { code?: string }).code;
    if (error instanceof NotFoundError || prismaCode === 'P2025') return void send(404, 'no existe');
    console.error(error);
    send(500, 'error interno');
  }
}

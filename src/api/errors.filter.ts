import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { ObligationError } from '../domain/obligation.js';

/** Errores del dominio a HTTP: una regla violada es 409, algo que no existe es 404. */
@Catch()
export class DomainErrorsFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      res.status(error.getStatus()).json(error.getResponse());
      return;
    }
    if (error instanceof ObligationError) {
      res.status(409).json({ statusCode: 409, message: error.message });
      return;
    }
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ statusCode: 404, message: 'no existe' });
      return;
    }
    console.error(error);
    res.status(500).json({ statusCode: 500, message: 'error interno' });
  }
}

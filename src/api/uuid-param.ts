import { Param, type PipeTransform } from '@nestjs/common';
import { NotFoundError } from '../domain/errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Los ids son UUID. Con el adaptador pg, Prisma reporta un UUID inválido como
 * P2007 (validación genérica), que no conviene mapear a 404 en general; se
 * corta acá, en el borde: un id mal formado es un recurso que no existe.
 */
export class UuidOr404Pipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!UUID.test(value)) throw new NotFoundError('no existe');
    return value;
  }
}

export const IdParam = () => Param('id', new UuidOr404Pipe());

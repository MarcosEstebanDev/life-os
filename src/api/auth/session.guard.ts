import {
  createParamDecorator,
  Inject,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticateUseCase } from '../../application/auth/authenticate.use-case.js';
import type { SessionRecord } from '../../domain/auth/session.js';
import type { RequestContext, UserRecord } from '../../domain/ports/auth.ports.js';
import { AuthError } from '../../application/auth/auth-deps.js';
import { AUTHENTICATE } from '../tokens.js';
import { readSessionCookie } from './cookies.js';

const PUBLIC = 'lifeos:public';
const ALLOW_PENDING = 'lifeos:allowPending';

/** Sin sesión: registro y login. */
export const Public = () => SetMetadata(PUBLIC, true);
/** Acepta la sesión a medio camino del 2FA: completar el login y salir. */
export const AllowPending = () => SetMetadata(ALLOW_PENDING, true);

export interface AuthContext {
  user: UserRecord;
  session: SessionRecord;
}

type AuthedRequest = Request & { auth?: AuthContext };

export const CurrentAuth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const auth = ctx.switchToHttp().getRequest<AuthedRequest>().auth;
  if (!auth) throw new AuthError('unauthenticated', 'no hay sesión');
  return auth;
});

export const ClientContext = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): RequestContext => requestContext(ctx.switchToHttp().getRequest<Request>()),
);

export function requestContext(req: Request): RequestContext {
  return { ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
}

/**
 * Global: todo endpoint exige sesión salvo que diga @Public(). Olvidarse de
 * proteger uno nuevo no lo deja abierto; olvidarse de abrirlo da 401.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(AUTHENTICATE) private readonly authenticate: AuthenticateUseCase,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = readSessionCookie(req.headers.cookie);
    if (!token) throw new AuthError('unauthenticated', 'no hay sesión');
    const allowPending = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING, targets) ?? false;
    req.auth = await this.authenticate.execute(token, { allowPending });
    return true;
  }
}

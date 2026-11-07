import { Body, Controller, Delete, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthError, type AuthDeps } from '../application/auth/auth-deps.js';
import type { ChangePasswordUseCase } from '../application/auth/change-password.use-case.js';
import type { CompleteMfaUseCase, LoginUseCase } from '../application/auth/login.use-case.js';
import type { RegisterUseCase } from '../application/auth/register.use-case.js';
import type { SessionsUseCase } from '../application/auth/sessions.use-case.js';
import type { TotpUseCase } from '../application/auth/totp.use-case.js';
import type { RequestContext, UserRecord } from '../domain/ports/auth.ports.js';
import { clearSessionCookie, setSessionCookie } from './auth/cookies.js';
import { AllowPending, ClientContext, CurrentAuth, Public, type AuthContext } from './auth/session.guard.js';
import { AUTH_DEPS, CHANGE_PASSWORD, COMPLETE_MFA, LOGIN, REGISTER, SESSIONS, TOTP } from './tokens.js';
import { IdParam } from './uuid-param.js';

const credentials = z.object({ email: z.string().max(320), password: z.string().max(1024) });
const codeBody = z.object({ code: z.string().max(64) });
const passwordChange = z.object({ current: z.string().max(1024), next: z.string().max(1024) });
const totpDisable = z.object({ password: z.string().max(1024), code: z.string().max(64) });

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new AuthError('validation', 'faltan datos o tienen un formato inválido');
  return result.data;
}

const publicUser = (u: UserRecord) => ({ id: u.id, email: u.email, totpEnabled: u.totpEnabledAt !== null });

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(REGISTER) private readonly register: RegisterUseCase,
    @Inject(LOGIN) private readonly login: LoginUseCase,
    @Inject(COMPLETE_MFA) private readonly completeMfa: CompleteMfaUseCase,
    @Inject(SESSIONS) private readonly sessions: SessionsUseCase,
    @Inject(CHANGE_PASSWORD) private readonly changePassword: ChangePasswordUseCase,
    @Inject(TOTP) private readonly totp: TotpUseCase,
    @Inject(AUTH_DEPS) private readonly deps: AuthDeps,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(201)
  async signUp(@Body() body: unknown, @ClientContext() ctx: RequestContext, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.register.execute(parse(credentials, body), ctx);
    setSessionCookie(req, res, token);
    return publicUser(user);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async signIn(@Body() body: unknown, @ClientContext() ctx: RequestContext, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { token, mfaRequired } = await this.login.execute(parse(credentials, body), ctx);
    setSessionCookie(req, res, token);
    return { mfaRequired };
  }

  @AllowPending()
  @Post('mfa')
  @HttpCode(200)
  async mfa(
    @Body() body: unknown,
    @CurrentAuth() auth: AuthContext,
    @ClientContext() ctx: RequestContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token } = await this.completeMfa.execute(auth.session, parse(codeBody, body).code, ctx);
    setSessionCookie(req, res, token);
    return { ok: true };
  }

  @AllowPending()
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentAuth() auth: AuthContext, @ClientContext() ctx: RequestContext, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.sessions.logout(auth.session, ctx);
    clearSessionCookie(req, res);
  }

  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(@CurrentAuth() auth: AuthContext, @ClientContext() ctx: RequestContext, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.sessions.logoutAll(auth.session, ctx);
    clearSessionCookie(req, res);
  }

  @Get('me')
  async me(@CurrentAuth() auth: AuthContext) {
    return { ...publicUser(auth.user), recoveryCodesLeft: await this.deps.recovery.countUnused(auth.user.id) };
  }

  @Get('sessions')
  listSessions(@CurrentAuth() auth: AuthContext) {
    return this.sessions.list(auth.session);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revokeSession(@CurrentAuth() auth: AuthContext, @IdParam() id: string, @ClientContext() ctx: RequestContext) {
    await this.sessions.revoke(auth.session, id, ctx);
  }

  @Get('events')
  async events(@CurrentAuth() auth: AuthContext) {
    return (await this.deps.events.listForUser(auth.user.id, 20)).map((e) => ({ type: e.type, ip: e.ip, userAgent: e.userAgent, at: e.at }));
  }

  @Post('password')
  @HttpCode(204)
  async password(@CurrentAuth() auth: AuthContext, @Body() body: unknown, @ClientContext() ctx: RequestContext) {
    await this.changePassword.execute(auth.session, parse(passwordChange, body), ctx);
  }

  @Post('totp/setup')
  @HttpCode(200)
  totpSetup(@CurrentAuth() auth: AuthContext) {
    return this.totp.setup(auth.user.id);
  }

  @Post('totp/enable')
  @HttpCode(200)
  totpEnable(@CurrentAuth() auth: AuthContext, @Body() body: unknown, @ClientContext() ctx: RequestContext) {
    return this.totp.enable(auth.user.id, parse(codeBody, body).code, ctx);
  }

  @Post('totp/disable')
  @HttpCode(204)
  async totpDisable(@CurrentAuth() auth: AuthContext, @Body() body: unknown, @ClientContext() ctx: RequestContext) {
    await this.totp.disable(auth.user.id, parse(totpDisable, body), ctx);
  }
}

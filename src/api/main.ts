import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { loadConfig } from '../config.js';
import { AppModule } from './app.module.js';
import { DomainErrorsFilter } from './errors.filter.js';
import { isAllowedHost, isAllowedOrigin } from './host-guard.js';

const config = loadConfig(process.env);
const port = config.port;
const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['log', 'error', 'warn'] });

// La web llega por el rewrite de Next (proxy en loopback): la IP real viene en X-Forwarded-For.
app.set('trust proxy', 'loopback');
app.use((req: Request, res: Response, next: NextFunction) => {
  if (!isAllowedHost(req.headers.host, port)) return void res.status(403).json({ statusCode: 403, message: 'host no permitido' });
  if (!isAllowedOrigin(req.method, req.headers.origin, config.auth.webOrigins)) {
    return void res.status(403).json({ statusCode: 403, message: 'origen no permitido' });
  }
  next();
});
app.setGlobalPrefix('api');
app.useGlobalFilters(new DomainErrorsFilter());
app.enableShutdownHooks();
// Sólo localhost, y cada endpoint exige sesión salvo registro y login.
await app.listen(port, '127.0.0.1');
console.log(`API en http://127.0.0.1:${port}/api · auth, brief, obligations, documents`);

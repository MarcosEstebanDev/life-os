import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { DomainErrorsFilter } from './errors.filter.js';

const port = Number(process.env.PORT ?? 3010);
const app = await NestFactory.create(AppModule, { logger: ['log', 'error', 'warn'] });
app.setGlobalPrefix('api');
app.enableCors({ origin: ['http://localhost:3011', 'http://127.0.0.1:3011'] });
app.useGlobalFilters(new DomainErrorsFilter());
app.enableShutdownHooks();
// Sólo localhost: no hay autenticación y son mis datos financieros.
await app.listen(port, '127.0.0.1');
console.log(`API en http://127.0.0.1:${port}/api · brief, obligations, documents`);

import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/** Desde Prisma 7 la URL va acá, no en el schema. */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});

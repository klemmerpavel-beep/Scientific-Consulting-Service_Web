import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Адрес базы живёт в окружении, а не в схеме: у разработки, проверки
// и продакшена он разный, а схема одна.
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: { path: path.join('prisma', 'migrations') },
  datasource: { url: process.env.DATABASE_URL! },
});

import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Настройки инструмента Prisma — миграции и генерация клиента.
 * Само приложение подключается к базе через `src/lib/db.ts`, сюда не заглядывая.
 *
 * Адрес базы живёт в окружении, а не в схеме: у разработки, проверки
 * и продакшена он разный, а схема одна.
 *
 * `DIRECT_URL` нужен площадкам с пулером подключений (Supabase, Neon).
 * Приложение там ходит через пулер — иначе бессерверные вызовы исчерпают
 * лимит подключений, — а миграции требуют прямого соединения: пулер не
 * пропускает служебные команды, которыми Prisma меняет схему.
 *
 * Генерация клиента адреса не требует, поэтому пустая строка допустима:
 * иначе `npm ci` падал бы на машине, где базы нет вовсе.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: { path: path.join('prisma', 'migrations') },
  datasource: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '' },
});

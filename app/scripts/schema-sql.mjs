/**
 * Печатает готовый к вставке SQL: схему заявок плюс отметку о применённой
 * миграции.
 *
 * Нужен там, где нет доступа к командной строке базы, но есть окно SQL —
 * например, редактор запросов Supabase. Обычный путь остаётся прежним:
 * `npx prisma migrate deploy`.
 *
 * Отметка обязательна. Без неё `prisma migrate status` считает базу пустой
 * и при следующем развёртывании пытается создать таблицы заново.
 *
 *   node scripts/schema-sql.mjs > schema.sql
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const dir = path.join('prisma', 'migrations');
const names = readdirSync(dir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

if (names.length === 0) {
  console.error('В prisma/migrations нет ни одной миграции.');
  process.exit(1);
}

const parts = [];

for (const name of names) {
  const sql = readFileSync(path.join(dir, name, 'migration.sql'), 'utf8');
  const checksum = createHash('sha256').update(sql).digest('hex');
  parts.push(`-- ——— миграция ${name} ———\n${sql.trimEnd()}`);
  parts.push(
    `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)\n` +
      `VALUES (gen_random_uuid()::text, '${checksum}', now(), '${name}', now(), 1)\n` +
      `ON CONFLICT DO NOTHING;`,
  );
}

const journal = `-- Журнал миграций Prisma: по нему инструмент понимает, что схема
-- уже накатана, и не пытается создать таблицы заново.
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    id                      VARCHAR(36) PRIMARY KEY NOT NULL,
    checksum                VARCHAR(64) NOT NULL,
    finished_at             TIMESTAMPTZ,
    migration_name          VARCHAR(255) NOT NULL,
    logs                    TEXT,
    rolled_back_at          TIMESTAMPTZ,
    started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_steps_count     INTEGER NOT NULL DEFAULT 0
);`;

console.log([journal, ...parts].join('\n\n'));

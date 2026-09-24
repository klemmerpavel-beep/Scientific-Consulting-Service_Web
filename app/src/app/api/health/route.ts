import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/db';
import { LATEST_MIGRATION } from '../../../lib/schema-version';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Проверка живости для контейнера и мониторинга.
 *
 * Проверяет не только то, что процесс отвечает, но и то, что база доступна
 * и её схема не отстала от кода: приложение без базы не может принять ни
 * одной заявки, а на отставшей схеме падает всё, что ходит в новые таблицы.
 * Прежде проверка ограничивалась `select 1` и отвечала «здоров» на базе без
 * таблиц кабинета (решение Р-218). Выкат ждёт этого ответа и при отказе
 * откатывается, поэтому отставшая схема больше не проходит молча.
 *
 * Имя миграции наружу не отдаётся: снаружи достаточно признака.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`select 1`;
  } catch {
    return NextResponse.json({ ok: false, db: false }, { status: 503 });
  }
  try {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`
      select count(*) as n from "_prisma_migrations"
      where migration_name = ${LATEST_MIGRATION}
        and finished_at is not null
        and rolled_back_at is null`;
    if (Number(rows[0]?.n ?? 0) === 0) {
      return NextResponse.json({ ok: false, db: true, schema: false }, { status: 503 });
    }
  } catch {
    return NextResponse.json({ ok: false, db: true, schema: false }, { status: 503 });
  }
  return NextResponse.json({ ok: true, db: true, schema: true });
}

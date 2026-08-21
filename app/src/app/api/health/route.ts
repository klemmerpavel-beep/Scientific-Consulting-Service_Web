import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Проверка живости для контейнера и мониторинга.
 *
 * Проверяет не только то, что процесс отвечает, но и то, что база доступна:
 * приложение без базы не может принять ни одной заявки, и считать его
 * работающим в этом состоянии нельзя.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`select 1`;
    return NextResponse.json({ ok: true, db: true });
  } catch {
    return NextResponse.json({ ok: false, db: false }, { status: 503 });
  }
}

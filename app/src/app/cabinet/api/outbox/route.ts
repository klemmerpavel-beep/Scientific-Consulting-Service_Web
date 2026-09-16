import { NextResponse, type NextRequest } from 'next/server';

import { dispatch, enqueueDeadlineReminders } from '../../../../lib/cabinet/outbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Рассылка накопившихся уведомлений. Вызывается по расписанию с сервера —
 * так же, как ночная копия базы и еженедельная очистка заявок.
 *
 * Отдельного процесса-демона не заводится: при семи типах событий и
 * нескольких десятках проектов это компонент «на вырост». Маршрут закрыт
 * общим секретом, а не сессией: у расписания учётной записи нет.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CABINET_CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'CABINET_CRON_SECRET не задан — рассылка выключена' },
      { status: 503 },
    );
  }
  if (request.headers.get('x-cabinet-cron') !== secret) {
    return new NextResponse('Не найдено', { status: 404 });
  }

  const reminders = await enqueueDeadlineReminders();
  const report = await dispatch();
  return NextResponse.json({ ok: true, reminders, ...report });
}

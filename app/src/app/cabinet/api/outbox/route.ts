import { NextResponse, type NextRequest } from 'next/server';

import { dispatch, enqueueDeadlineReminders } from '../../../../lib/cabinet/outbox';
import { sameSecret } from '../../../../lib/cabinet/token';

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
  // Маршрут виден снаружи через nginx. Отказ — одинаковый 404 и при
  // незаданном секрете, и при неверном: прежде ответ 503 с именем
  // переменной рассказывал, как устроен сервер, а сравнение строк —
  // сколько знаков совпало (решение Р-246). Незаданный секрет пишется в
  // журнал сервера: расписание увидит 404 и поднимет тревогу само.
  const secret = process.env.CABINET_CRON_SECRET;
  if (!secret) console.error('[outbox] CABINET_CRON_SECRET не задан — рассылка выключена');
  if (!secret || !sameSecret(request.headers.get('x-cabinet-cron'), secret)) {
    return new NextResponse('Не найдено', { status: 404 });
  }

  const reminders = await enqueueDeadlineReminders();
  const report = await dispatch();
  return NextResponse.json({ ok: true, reminders, ...report });
}

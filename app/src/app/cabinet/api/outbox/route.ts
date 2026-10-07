import { NextResponse, type NextRequest } from 'next/server';
import { DAILY_MAIL_HOUR, moscowHour } from '../../../../lib/cabinet/clock';

import {
  autoAcceptExpired,
  enqueueApprovalReminders,
  startMissingDeadlines,
} from '../../../../lib/cabinet/approval';
import { dispatch, enqueueCuratorDigest, enqueueDeadlineReminders } from '../../../../lib/cabinet/outbox';
import { enqueueHeadDigest, enqueueHeadMonthly, enqueueTrancheOverdue } from '../../../../lib/cabinet/head-digest';
import { enqueueAssignmentReminders } from '../../../../lib/cabinet/assignments';
import { sameSecret } from '../../../../lib/cabinet/token';
import { cronStep } from '../../../../lib/cabinet/cron-step';

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

  // Сбой одного шага не останавливает ни следующие, ни отправку (Р-438).
  const stepsFailed: string[] = [];
  // Сроки согласования: поставить недостающие, закрыть истёкшие (если
  // автозакрытие включено), напомнить о подходящих — до рассылки, чтобы
  // письма этого прогона ушли сразу (требование Т-15, решение Р-290).
  const deadlinesStarted = await cronStep('startMissingDeadlines', startMissingDeadlines, stepsFailed);
  // Плановые письма дня — с 09:00 по Москве, а не в первую минуту суток:
  // напоминания, автозакрытие, сводка и сигналы (улучшение УК-14, решение
  // Р-393). Ключи у всех по дню: поздний прогон дублей не ставит.
  const morning = moscowHour() >= DAILY_MAIL_HOUR;
  const autoAccepted = morning ? await cronStep('autoAcceptExpired', autoAcceptExpired, stepsFailed) : 0;
  const approvalReminders = morning ? await cronStep('enqueueApprovalReminders', enqueueApprovalReminders, stepsFailed) : 0;
  const reminders = morning ? await cronStep('enqueueDeadlineReminders', enqueueDeadlineReminders, stepsFailed) : 0;
  // Утренняя сводка и сигнал о просроченном платеже руководителю
  // (требование РК-13, решение Р-347).
  const headDigest = morning ? await cronStep('enqueueHeadDigest', enqueueHeadDigest, stepsFailed) : 0;
  const overdueSignals = morning ? await cronStep('enqueueTrancheOverdue', enqueueTrancheOverdue, stepsFailed) : 0;
  // Письмо 1-го числа — рекомендации на месяц (РК-17, Р-350).
  const monthly = morning ? await cronStep('enqueueHeadMonthly', enqueueHeadMonthly, stepsFailed) : 0;
  // Напоминание сотруднику за день до срока поручения (РК-19, Р-352).
  const assignmentReminders = morning ? await cronStep('enqueueAssignmentReminders', enqueueAssignmentReminders, stepsFailed) : 0;
  // Сводка куратору — отложенные письма о его работах одним письмом
  // (улучшение УЭ-01, решение Р-398).
  const curatorDigest = morning ? await cronStep('enqueueCuratorDigest', enqueueCuratorDigest, stepsFailed) : 0;
  const report = await dispatch();
  return NextResponse.json({
    ok: true,
    reminders,
    headDigest,
    overdueSignals,
    monthly,
    assignmentReminders,
    curatorDigest,
    approvalReminders,
    deadlinesStarted,
    autoAccepted,
    stepsFailed,
    ...report,
  });
}

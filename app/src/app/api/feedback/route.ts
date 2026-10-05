import { createFeedback } from '../../../lib/cabinet/feedback';
import { feedbackEnabled } from '../../../lib/feedback';
import { feedbackLimiter, receiveFeedback } from '../../../lib/feedback-intake';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Приём замечания с виджета (решение Р-403).
 *
 * Разбор запроса — в `lib/feedback-intake.ts`, правила — в
 * `lib/feedback.ts`, запись — в `lib/cabinet/feedback.ts`. Маршрут не
 * читает ни cookies, ни сессии: замечание не связывается с человеком, и
 * знать, кто пишет, приёму незачем. Наружу — ни в Telegram, ни на почту —
 * ничего не уходит: замечания разбираются раз в неделю по таблице.
 */
export async function POST(request: Request): Promise<Response> {
  return receiveFeedback(request, {
    enabled: feedbackEnabled(),
    limiter: feedbackLimiter,
    save: createFeedback,
  });
}

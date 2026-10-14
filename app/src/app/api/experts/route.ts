import { after } from 'next/server';

import { createExpertApplication } from '../../../lib/cabinet/expert-applications';
import { expertLimiter, receiveExpertApplication } from '../../../lib/expert-intake';
import { sendExpertSignal } from '../../../lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Приём анкеты эксперта со страницы «Экспертам» (решение Р-580).
 *
 * Разбор запроса — в `lib/expert-intake.ts`, правила — в
 * `lib/expert-application.ts`, запись — в `lib/cabinet/expert-applications.ts`.
 * Маршрут не читает ни cookies, ни сессии. Руководителю после ответа уходит
 * сигнал в Telegram без имени и контакта кандидата.
 */
export async function POST(request: Request): Promise<Response> {
  return receiveExpertApplication(request, {
    limiter: expertLimiter,
    save: createExpertApplication,
    after: (id) =>
      after(async () => {
        const result = await sendExpertSignal(id);
        if (!result.ok && result.error !== 'канал не настроен') console.error('[experts] сигнал не ушёл', result.error);
      }),
  });
}

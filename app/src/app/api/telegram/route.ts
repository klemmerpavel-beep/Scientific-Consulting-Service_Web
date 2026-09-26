import { NextResponse, type NextRequest } from 'next/server';

import { bindTelegram } from '../../../lib/cabinet/auth';
import { telegramSay } from '../../../lib/cabinet/outbox';
import { sameSecret } from '../../../lib/cabinet/token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Приём обновлений Telegram. Нужен ровно для одного сценария: пользователь
 * переходит по ссылке привязки из кабинета, бот получает `/start` с меткой,
 * и кабинет запоминает, куда слать уведомления.
 *
 * Подлинность запроса подтверждается заголовком с общим секретом — тем же
 * механизмом, которым Telegram защищает вебхук.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  // Сравнение за постоянное время (решение Р-246).
  if (!secret || !sameSecret(request.headers.get('x-telegram-bot-api-secret-token'), secret)) {
    return new NextResponse('Не найдено', { status: 404 });
  }

  const update = (await request.json().catch(() => null)) as {
    message?: { text?: string; chat?: { id?: number } };
  } | null;

  const text = update?.message?.text ?? '';
  const chatId = update?.message?.chat?.id;
  if (typeof chatId !== 'number' || !text.startsWith('/start')) {
    // Всё прочее бот молча игнорирует: разговаривать с пользователем он не
    // умеет и не должен — переписка ведётся внутри кабинета.
    return NextResponse.json({ ok: true });
  }

  // Бот отвечает на /start исходом привязки. Прежде он молчал и при
  // успехе, и при устаревшей ссылке: человек не понимал, подключены ли
  // уведомления (решение Р-246). Больше бот не говорит ничего.
  const payload = text.slice('/start'.length).trim();
  if (payload.length === 0) {
    await telegramSay(
      String(chatId),
      'Чтобы получать уведомления, откройте в личном кабинете ProDisser раздел «Уведомления» и нажмите «Привязать Telegram».',
    );
    return NextResponse.json({ ok: true });
  }

  const bound = await bindTelegram(payload, String(chatId));
  await telegramSay(
    String(chatId),
    bound
      ? 'Готово: уведомления личного кабинета ProDisser будут приходить сюда. Отключить их можно в кабинете, в разделе «Уведомления».'
      : 'Ссылка устарела или уже использована. Получите новую в личном кабинете, в разделе «Уведомления».',
  );
  return NextResponse.json({ ok: true });
}

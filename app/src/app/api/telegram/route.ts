import { NextResponse, type NextRequest } from 'next/server';

import { bindTelegram } from '../../../lib/cabinet/auth';

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
  if (!secret || request.headers.get('x-telegram-bot-api-secret-token') !== secret) {
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

  const payload = text.slice('/start'.length).trim();
  if (payload.length === 0) return NextResponse.json({ ok: true });

  await bindTelegram(payload, String(chatId));
  return NextResponse.json({ ok: true });
}

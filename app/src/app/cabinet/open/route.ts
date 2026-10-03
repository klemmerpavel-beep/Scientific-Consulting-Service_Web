import { NextResponse, type NextRequest } from 'next/server';

import { OPEN_COOKIE, OPEN_COOKIE_SECONDS, packOpen, safeNext } from '../../../lib/cabinet/next-path';
import { currentActor } from '../../../lib/cabinet/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * «Открыть кабинет» из письма и ссылка сигнала Telegram (требование Т-06,
 * решение Р-309).
 *
 * С сессией — сразу на экран события. Без неё намерение (экран и адрес
 * почты из письма) кладётся в короткую cookie, а человек уходит на чистый
 * `/cabinet`: адрес почты исчезает из адресной строки и не уходит дальше
 * заголовком Referer (О-12). Открытие ничего не отправляет и ничего не
 * гасит — почтовый проверщик ссылок, открывший её первым, ссылку не
 * тратит (Р-232).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const to = safeNext(request.nextUrl.searchParams.get('to')) ?? '/cabinet';
  const actor = await currentActor();
  const response = NextResponse.redirect(new URL(actor === null ? '/cabinet' : to, request.url), { status: 303 });
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('Cache-Control', 'no-store');
  if (actor === null) {
    response.cookies.set(OPEN_COOKIE, packOpen(to, request.nextUrl.searchParams.get('email')), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/cabinet',
      maxAge: OPEN_COOKIE_SECONDS,
    });
  }
  return response;
}

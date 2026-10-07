import { NextResponse, type NextRequest } from 'next/server';

import { revokeSession } from '../../../lib/cabinet/auth';
import { clearSessionCookie } from '../../../lib/cabinet/session';
import { SESSION_COOKIE } from '../../../lib/cabinet/token';
import { crossSiteRequest } from '../../../lib/cabinet/same-site';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Выход. Сессия отзывается на сервере, а не только забывается браузером:
 * иначе украденное значение cookie продолжало бы работать.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Чужая страница не выводит человека из кабинета формой, отправленной
  // от его имени: такой запрос ничего не меняет (решение Р-429).
  if (crossSiteRequest(request.headers)) {
    return NextResponse.redirect(new URL('/cabinet', request.url), { status: 303 });
  }
  await revokeSession(request.cookies.get(SESSION_COOKIE)?.value);
  await clearSessionCookie();
  return NextResponse.redirect(new URL('/cabinet', request.url), { status: 303 });
}

import { NextResponse, type NextRequest } from 'next/server';

import { revokeSession } from '../../../lib/cabinet/auth';
import { clearSessionCookie } from '../../../lib/cabinet/session';
import { SESSION_COOKIE } from '../../../lib/cabinet/token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Выход. Сессия отзывается на сервере, а не только забывается браузером:
 * иначе украденное значение cookie продолжало бы работать.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  await revokeSession(request.cookies.get(SESSION_COOKIE)?.value);
  await clearSessionCookie();
  return NextResponse.redirect(new URL('/cabinet', request.url), { status: 303 });
}

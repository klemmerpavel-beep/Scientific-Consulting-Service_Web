import { NextResponse, type NextRequest } from 'next/server';

import { consumeLoginToken } from '../../../../lib/cabinet/auth';
import { requestIp, setSessionCookie, userAgent } from '../../../../lib/cabinet/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Погашение ссылки входа. Причина отказа наружу не сообщается: просрочена
 * ссылка, использована или подделана — ответ один, иначе перебор
 * подсказывал бы, какие селекторы существуют.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await context.params;
  const session = await consumeLoginToken(token, await requestIp(), await userAgent());
  if (session === null) {
    return NextResponse.redirect(new URL('/cabinet?error=link', request.url));
  }
  await setSessionCookie(session);
  return NextResponse.redirect(new URL('/cabinet/projects', request.url));
}

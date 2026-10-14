import { NextResponse } from 'next/server';

import { attachmentDisposition } from '../../../../../lib/cabinet/disposition';
import { AccessDenied } from '../../../../../lib/cabinet/access';
import { expertsWorkbook } from '../../../../../lib/cabinet/expert-applications';
import { currentActor, requestIp } from '../../../../../lib/cabinet/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Таблица анкет экспертов (решение Р-580) — та же, что уходит в зеркало на
 * Диске, собранная тем же кодом. Файл на сервере не остаётся; выгрузка
 * записывается в журнал числом строк.
 */
export async function GET(): Promise<NextResponse> {
  const actor = await currentActor();
  if (actor === null) return new NextResponse('Требуется вход', { status: 401 });
  try {
    const book = await expertsWorkbook(actor, await requestIp());
    const day = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(book.xlsx), {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': attachmentDisposition(`Анкеты кандидатов ${day}.xlsx`, `kandidaty-${day}.xlsx`),
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    // Отказ и отсутствие неразличимы, как у прочих выгрузок кабинета.
    if (error instanceof AccessDenied) return new NextResponse('Не найдено', { status: 404 });
    throw error;
  }
}

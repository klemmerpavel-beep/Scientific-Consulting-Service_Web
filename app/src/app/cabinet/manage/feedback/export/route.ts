import { NextResponse } from 'next/server';

import { AccessDenied } from '../../../../../lib/cabinet/access';
import { feedbackWorkbook } from '../../../../../lib/cabinet/feedback';
import { currentActor, requestIp } from '../../../../../lib/cabinet/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Книга замечаний для руководителя (решение Р-277) — та же таблица, что
 * уходит в зеркало на Диске, собранная тем же кодом: две выгрузки одной
 * таблицы разошлись бы при первой правке. Выгружается всё, а не отбор с
 * экрана: на разборе нужна полная картина, а фильтр есть в самой книге.
 * Файл на сервере не остаётся; выгрузка записывается в журнал числом строк.
 */
export async function GET(): Promise<NextResponse> {
  const actor = await currentActor();
  if (actor === null) return new NextResponse('Требуется вход', { status: 401 });

  try {
    const book = await feedbackWorkbook(actor, await requestIp());
    const stamp = book.file.replace(/\.xlsx$/u, '');
    const day = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(book.xlsx), {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="zamechaniya-${day}.xlsx"; filename*=UTF-8''${encodeURIComponent(`${stamp} ${day}.xlsx`)}`,
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    // Отказ и отсутствие неразличимы, как у прочих выгрузок кабинета.
    if (error instanceof AccessDenied) return new NextResponse('Не найдено', { status: 404 });
    throw error;
  }
}

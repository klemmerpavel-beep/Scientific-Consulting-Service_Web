import { NextResponse } from 'next/server';

import { attachmentDisposition } from '../../../../lib/cabinet/disposition';
import { download } from '../../../../lib/cabinet/downloads';
import { currentActor, signInFirst } from '../../../../lib/cabinet/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Скачивание материалов кабинета: шаблоны документов, чек-листы, памятки
 * (решения Р-558, Р-559) и шаблоны практики из хранилища (решение Р-562).
 * Свои файлы собираются при выдаче и на сервере не остаются; персональных
 * данных ни в тех, ни в других нет.
 */
export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }): Promise<NextResponse> {
  const actor = await currentActor();
  if (actor === null) return signInFirst(request, '/cabinet');
  const item = await download(actor, (await params).file);
  if (item === null) return new NextResponse('Не найдено', { status: 404 });
  return new NextResponse(new Uint8Array(item.bytes), {
    headers: {
      'content-type': item.type,
      'content-disposition': attachmentDisposition(item.file, item.ascii),
      'cache-control': 'private, no-store',
    },
  });
}

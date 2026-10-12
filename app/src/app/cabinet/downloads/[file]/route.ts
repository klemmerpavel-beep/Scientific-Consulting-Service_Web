import { NextResponse } from 'next/server';

import { attachmentDisposition } from '../../../../lib/cabinet/disposition';
import { download } from '../../../../lib/cabinet/downloads';
import { currentActor } from '../../../../lib/cabinet/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Скачивание материалов кабинета: шаблоны документов, чек-листы, памятки
 * (решения Р-554, Р-555). Файл собирается при выдаче и на сервере не
 * остаётся; персональных данных в нём нет.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }): Promise<NextResponse> {
  const actor = await currentActor();
  if (actor === null) return new NextResponse('Требуется вход', { status: 401 });
  const item = download(actor, (await params).file);
  if (item === null) return new NextResponse('Не найдено', { status: 404 });
  return new NextResponse(new Uint8Array(item.bytes), {
    headers: {
      'content-type': item.type,
      'content-disposition': attachmentDisposition(item.file, item.ascii),
      'cache-control': 'private, no-store',
    },
  });
}

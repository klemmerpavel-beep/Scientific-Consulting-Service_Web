import { NextResponse, type NextRequest } from 'next/server';

import { attachmentDisposition, safeContentType } from '../../../../lib/cabinet/disposition';
import { AccessDenied } from '../../../../lib/cabinet/access';
import { OBJECT_MISSING_TEXT, ObjectMissing } from '../../../../lib/cabinet/storage';
import { readLeadAttachment } from '../../../../lib/cabinet/queries';
import { currentActor, requestIp, signInFirst } from '../../../../lib/cabinet/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


export async function GET(
  request: NextRequest,
  context: { params: Promise<{ attachmentId: string }> },
): Promise<NextResponse> {
  const actor = await currentActor();
  if (actor === null) return signInFirst(request, '/cabinet/manage/leads');

  const { attachmentId } = await context.params;
  try {
    const file = await readLeadAttachment(actor, attachmentId, await requestIp());
    if (file === null) return new NextResponse('Не найдено', { status: 404 });
    // Байты идут потоком с диска: прежде файл до 50 МБ читался в память
    // целиком на каждое скачивание (решения Р-246, Р-247).
    return new NextResponse(file.stream, {
      headers: {
        'content-length': String(file.sizeBytes),
        'content-type': safeContentType(file.contentType),
        'content-disposition': attachmentDisposition(file.originalName),
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof AccessDenied) return new NextResponse('Не найдено', { status: 404 });
    // Право есть, объекта нет: понятный ответ вместо ошибки 500 (Р-907).
    if (error instanceof ObjectMissing) {
      console.error(`[storage] объект не найден: ${error.key}`);
      return new NextResponse(OBJECT_MISSING_TEXT, {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'private, no-store' },
      });
    }
    throw error;
  }
}

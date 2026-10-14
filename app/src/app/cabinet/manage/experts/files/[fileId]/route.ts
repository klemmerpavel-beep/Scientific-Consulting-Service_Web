import { NextResponse, type NextRequest } from 'next/server';

import { attachmentDisposition } from '../../../../../../lib/cabinet/disposition';
import { AccessDenied } from '../../../../../../lib/cabinet/access';
import { openExpertFile } from '../../../../../../lib/cabinet/expert-applications';
import { currentActor, requestIp } from '../../../../../../lib/cabinet/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Файл анкеты эксперта (решение Р-580) — тем же порядком, что выдача
 * материалов: сначала право, затем поток байтов, вложением и без кэша.
 * Тип — определённый при приёме по расширению и началу файла.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ fileId: string }> },
): Promise<NextResponse> {
  const actor = await currentActor();
  if (actor === null) return new NextResponse('Требуется вход', { status: 401 });
  const { fileId } = await context.params;
  try {
    const file = await openExpertFile(actor, fileId, await requestIp());
    if (file === null) return new NextResponse('Не найдено', { status: 404 });
    const ext = file.fileName.includes('.') ? file.fileName.slice(file.fileName.lastIndexOf('.')) : '';
    return new NextResponse(file.stream, {
      headers: {
        'content-length': String(file.sizeBytes),
        'content-type': file.contentType,
        'content-disposition': attachmentDisposition(file.fileName, `anketa-file${ext}`),
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof AccessDenied) return new NextResponse('Не найдено', { status: 404 });
    throw error;
  }
}

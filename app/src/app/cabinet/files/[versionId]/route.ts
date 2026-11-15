import { NextResponse, type NextRequest } from 'next/server';

import { attachmentDisposition, safeContentType } from '../../../../lib/cabinet/disposition';
import { AccessDenied } from '../../../../lib/cabinet/access';
import { readVersion } from '../../../../lib/cabinet/materials';
import { currentActor, requestIp, signInFirst } from '../../../../lib/cabinet/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Единственный путь к содержимому материала. Байты не отдаются из хранилища
 * напрямую: сначала спрашивается разрешение, затем пишется строка в журнал
 * доступа, и только потом читается объект. Отказ и отсутствие неразличимы —
 * иначе перебор показывал бы, какие версии существуют.
 */

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ versionId: string }> },
): Promise<NextResponse> {
  const actor = await currentActor();
  if (actor === null) return signInFirst(request, '/cabinet');

  const { versionId } = await context.params;
  try {
    const file = await readVersion(actor, versionId, await requestIp());
    if (file === null) return new NextResponse('Не найдено', { status: 404 });
    // Байты идут потоком с диска: прежде файл до 50 МБ читался в память
    // целиком на каждое скачивание (решения Р-246, Р-247).
    return new NextResponse(file.stream, {
      headers: {
        'content-length': String(file.sizeBytes),
        'content-type': safeContentType(file.contentType),
        // Имя файла возвращается пользователю, но в адрес не попадает:
        // адрес виден в журналах прокси, а имя может содержать фамилию.
        'content-disposition': attachmentDisposition(file.originalName),
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof AccessDenied) return new NextResponse('Не найдено', { status: 404 });
    throw error;
  }
}

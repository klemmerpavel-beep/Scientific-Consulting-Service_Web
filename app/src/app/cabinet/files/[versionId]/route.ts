import { NextResponse, type NextRequest } from 'next/server';

import { AccessDenied } from '../../../../lib/cabinet/access';
import { readVersion } from '../../../../lib/cabinet/materials';
import { currentActor, requestIp } from '../../../../lib/cabinet/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Единственный путь к содержимому материала. Байты не отдаются из хранилища
 * напрямую: сначала спрашивается разрешение, затем пишется строка в журнал
 * доступа, и только потом читается объект. Отказ и отсутствие неразличимы —
 * иначе перебор показывал бы, какие версии существуют.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ versionId: string }> },
): Promise<NextResponse> {
  const actor = await currentActor();
  if (actor === null) return new NextResponse('Требуется вход', { status: 401 });

  const { versionId } = await context.params;
  try {
    const file = await readVersion(actor, versionId, await requestIp());
    if (file === null) return new NextResponse('Не найдено', { status: 404 });
    return new NextResponse(new Uint8Array(file.body), {
      headers: {
        'content-type': file.contentType,
        // Имя файла возвращается пользователю, но в адрес не попадает:
        // адрес виден в журналах прокси, а имя может содержать фамилию.
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof AccessDenied) return new NextResponse('Не найдено', { status: 404 });
    throw error;
  }
}

import { NextResponse, type NextRequest } from 'next/server';

import { AccessDenied } from '../../../../../../lib/cabinet/access';
import { openFeedbackScreenshot } from '../../../../../../lib/cabinet/feedback';
import { currentActor } from '../../../../../../lib/cabinet/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Снимок экрана к замечанию — тем же порядком, что выдача материалов
 * (`cabinet/files/[versionId]`): сначала право, затем поток байтов,
 * вложением и без кэша. Тип — определённый по сигнатуре при приёме
 * (PNG, JPEG или WEBP), а не присланный браузером; имя файла — по
 * замечанию, исходное не хранится (решение Р-277).
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await currentActor();
  if (actor === null) return new NextResponse('Требуется вход', { status: 401 });

  const { id } = await context.params;
  try {
    const file = await openFeedbackScreenshot(actor, id);
    if (file === null) return new NextResponse('Не найдено', { status: 404 });
    return new NextResponse(file.stream, {
      headers: {
        'content-length': String(file.sizeBytes),
        'content-type': file.contentType,
        'content-disposition': `attachment; filename="${file.fileName}"`,
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof AccessDenied) return new NextResponse('Не найдено', { status: 404 });
    throw error;
  }
}

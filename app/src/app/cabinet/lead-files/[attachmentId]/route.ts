import { NextResponse, type NextRequest } from 'next/server';

import { AccessDenied } from '../../../../lib/cabinet/access';
import { readLeadAttachment } from '../../../../lib/cabinet/queries';
import { currentActor, requestIp } from '../../../../lib/cabinet/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Выдача файла, приложенного к заявке.
 *
 * Отдельный маршрут от выдачи материалов: у вложения нет работы, а значит
 * нет и обычной выборки прав по проекту — открыт он только тому, кто
 * разбирает заявки. Порядок тот же: разрешение, запись в журнал, байты;
 * отказ и отсутствие неразличимы (решение Р-191).
 */
const RISKY =
  /^(text\/html|image\/svg|application\/xhtml|text\/xml|application\/xml|text\/css|application\/javascript|text\/javascript)/iu;

function safeType(contentType: string): string {
  return RISKY.test(contentType) ? 'application/octet-stream' : contentType;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ attachmentId: string }> },
): Promise<NextResponse> {
  const actor = await currentActor();
  if (actor === null) return new NextResponse('Требуется вход', { status: 401 });

  const { attachmentId } = await context.params;
  try {
    const file = await readLeadAttachment(actor, attachmentId, await requestIp());
    if (file === null) return new NextResponse('Не найдено', { status: 404 });
    // Байты идут потоком с диска: прежде файл до 50 МБ читался в память
    // целиком на каждое скачивание (решения Р-246, Р-247).
    return new NextResponse(file.stream, {
      headers: {
        'content-length': String(file.sizeBytes),
        'content-type': safeType(file.contentType),
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof AccessDenied) return new NextResponse('Не найдено', { status: 404 });
    throw error;
  }
}

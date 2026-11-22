import { NextResponse, type NextRequest } from 'next/server';

import { checkStorage } from '../../../../lib/cabinet/storage-check';
import { sameSecret } from '../../../../lib/cabinet/token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Сверка файлов с хранилищем для отчёта цепочки выката
 * (`deploy/chain-check.sh`): версии материалов (план доработки
 * 19.11.2026, К-5; решение Р-986), вложения заявок и файлы анкет
 * экспертов (Р-1007). Только чтение: ничего не удаляется и не исправляется.
 *
 * Закрыт тем же секретом, что рассылка (`CABINET_CRON_SECRET`), и тем же
 * порядком: незаданный и неверный секрет — одинаковый 404 (Р-246). Ответ —
 * только числа расхождений по видам: ни ключей объектов, ни названий
 * материалов, ни номеров заявок, ни числа версий и анкет — журнал выката
 * открыт всем. Перечень с подписями видит руководитель на «Сводке».
 * Прежние четыре поля — версии материалов; три новых — вложения заявок
 * (`leadOrphans`, `leadKept` — изъятые или перенесённые с файлом после
 * срока чистки) и файлы анкет (`expertOrphans`).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CABINET_CRON_SECRET;
  if (!secret || !sameSecret(request.headers.get('x-cabinet-cron'), secret)) {
    return new NextResponse('Не найдено', { status: 404 });
  }
  try {
    const { counts } = await checkStorage();
    return NextResponse.json({
      ok: true,
      missing: counts.MATERIALS.MISSING,
      size: counts.MATERIALS.SIZE,
      purgedKept: counts.MATERIALS.PURGED_KEPT,
      orphans: counts.MATERIALS.ORPHAN,
      leadOrphans: counts.LEADS.ORPHAN,
      leadKept: counts.LEADS.PURGED_KEPT,
      expertOrphans: counts.EXPERTS.ORPHAN,
    });
  } catch (error) {
    // Причина — в журнал сервера; наружу — только отказ: отчёт выката
    // пишет «сверка не выполнена», выкат от этого не падает.
    console.error('[storage-check] сверка файлов с хранилищем не выполнена', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

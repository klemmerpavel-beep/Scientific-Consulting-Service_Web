import { NextResponse, type NextRequest } from 'next/server';

import { checkStorage } from '../../../../lib/cabinet/storage-check';
import { sameSecret } from '../../../../lib/cabinet/token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Сверка версий материалов с хранилищем для отчёта цепочки выката
 * (`deploy/chain-check.sh`; план доработки 19.11.2026, К-5; решение
 * Р-986). Только чтение: ничего не удаляется и не исправляется.
 *
 * Закрыт тем же секретом, что рассылка (`CABINET_CRON_SECRET`), и тем же
 * порядком: незаданный и неверный секрет — одинаковый 404 (Р-246). Ответ —
 * только числа расхождений по видам: ни ключей объектов, ни названий
 * материалов, ни числа версий — журнал выката открыт всем. Перечень с
 * подписями видит руководитель на «Сводке».
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
      missing: counts.MISSING,
      size: counts.SIZE,
      purgedKept: counts.PURGED_KEPT,
      orphans: counts.ORPHAN,
    });
  } catch (error) {
    // Причина — в журнал сервера; наружу — только отказ: отчёт выката
    // пишет «сверка не выполнена», выкат от этого не падает.
    console.error('[storage-check] сверка версий с хранилищем не выполнена', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

import { NextResponse, type NextRequest } from 'next/server';

import { AccessDenied } from '../../../../../lib/cabinet/access';
import { record } from '../../../../../lib/cabinet/audit';
import { moscowToday } from '../../../../../lib/cabinet/clock';
import { attachmentDisposition } from '../../../../../lib/cabinet/disposition';
import { financeSummary } from '../../../../../lib/cabinet/finance';
import { currentActor, requestIp, signInFirst } from '../../../../../lib/cabinet/session';
import { FINANCE_COLUMNS, XLSX_TYPE, columnSet, pick, workbook } from '../../../../../lib/cabinet/table-views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * «Деньги по работам» книгой Excel — тем же отбором («С остатком» или
 * «Все работы с договором») и тем же набором столбцов, что на экране
 * (К-3, решение Р-593). Деньги — только руководителю: выборка сама
 * спрашивает право `MARGIN_VIEW`, отказ неотличим от отсутствия.
 * Файл на сервере не остаётся; выгрузка пишется в журнал числом строк.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const actor = await currentActor();
  if (actor === null) return signInFirst(request, '/cabinet/manage/finance');

  let summary;
  try {
    summary = await financeSummary(actor);
  } catch (error) {
    if (error instanceof AccessDenied) return new NextResponse('Не найдено', { status: 404 });
    throw error;
  }

  const params = request.nextUrl.searchParams;
  const all = params.get('set') === 'all';
  const set = columnSet(params.get('cols') ?? undefined);
  const columns = pick(FINANCE_COLUMNS, set);
  // Отбор — тот же, что на экране: «с остатком» — работы, по которым ещё
  // ждут денег (Р-257).
  const rows = all ? summary.rows : summary.rows.filter((row) => row.awaiting > 0n);

  await record(actor, {
    action: 'FINANCE_EXPORTED',
    objectType: 'Project',
    payload: { rows: rows.length, set: all ? 'all' : 'owing', columns: set },
    ip: await requestIp(),
  });

  const stamp = moscowToday().toISOString().slice(0, 10);
  return new NextResponse(workbook('Деньги по работам', columns, rows), {
    headers: {
      'content-type': XLSX_TYPE,
      'content-disposition': attachmentDisposition(`Деньги по работам ${stamp}.xlsx`, `dengi-${stamp}.xlsx`),
      'cache-control': 'private, no-store',
    },
  });
}

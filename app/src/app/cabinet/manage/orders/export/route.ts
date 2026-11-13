import { NextResponse, type NextRequest } from 'next/server';

import { AccessDenied } from '../../../../../lib/cabinet/access';
import { record } from '../../../../../lib/cabinet/audit';
import { moscowToday } from '../../../../../lib/cabinet/clock';
import { attachmentDisposition } from '../../../../../lib/cabinet/disposition';
import { orderFilters, ordersTable } from '../../../../../lib/cabinet/orders';
import { currentActor, requestIp, signInFirst } from '../../../../../lib/cabinet/session';
import { ORDER_COLUMNS, XLSX_TYPE, orderFoot, workbook } from '../../../../../lib/cabinet/table-views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * «Заказы» книгой Excel — того же вида, что книга заказов владельца:
 * столбцы книги, остаток и итоговая строка «Сумма» (решение Р-874). Тем
 * же отбором, что на экране; руководителю — все работы, менеджеру — свои.
 * Отказ в праве неотличим от отсутствия. Файл на сервере не остаётся;
 * выгрузка пишется в журнал числом строк и отбором.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const actor = await currentActor();
  if (actor === null) return signInFirst(request, '/cabinet/manage/orders');
  const params = request.nextUrl.searchParams;
  const filter = orderFilters(params.get('status') ?? undefined, params.get('debt') ?? undefined);

  let table;
  try {
    table = await ordersTable(actor, filter);
  } catch (error) {
    if (error instanceof AccessDenied) return new NextResponse('Не найдено', { status: 404 });
    throw error;
  }

  await record(actor, {
    action: 'ORDERS_EXPORTED',
    objectType: 'Project',
    payload: { rows: table.rows.length, status: filter.status, debt: filter.debt },
    ip: await requestIp(),
  });

  const stamp = moscowToday().toISOString().slice(0, 10);
  return new NextResponse(workbook('Заказы', ORDER_COLUMNS, table.rows, orderFoot(table.rows)), {
    headers: {
      'content-type': XLSX_TYPE,
      'content-disposition': attachmentDisposition(`Заказы ${stamp}.xlsx`, `zakazy-${stamp}.xlsx`),
      'cache-control': 'private, no-store',
    },
  });
}

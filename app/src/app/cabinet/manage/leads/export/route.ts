import { NextResponse, type NextRequest } from 'next/server';

import { attachmentDisposition } from '../../../../../lib/cabinet/disposition';
import { AccessDenied, ensure } from '../../../../../lib/cabinet/access';
import { record } from '../../../../../lib/cabinet/audit';
import { leadList } from '../../../../../lib/cabinet/queries';
import { XLSX_TYPE, columnSet, leadColumns, workbook, type LeadRowView } from '../../../../../lib/cabinet/table-views';
import { currentActor, requestIp, signInFirst } from '../../../../../lib/cabinet/session';
import { moscowToday } from '../../../../../lib/cabinet/clock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


/**
 * Выгрузка отобранных заявок в книгу Excel — тем же отбором и тем же
 * набором столбцов, что показаны на экране: что видно, то и выгружается
 * (К-3, решение Р-593). Прежде выгрузка шла в CSV; книга открывается без
 * мастера импорта и держит даты и деньги своими типами.
 *
 * Выгрузка идёт в браузер и не оставляет файла на сервере: копия
 * персональных данных не должна заводиться там, где её никто не удалит.
 * Каждая выгрузка пишется в журнал действий с числом строк и условиями
 * отбора — это вынос персональных данных за пределы экрана, и он должен
 * быть виден проверяющему (решение Р-159). Текст поиска в журнал не идёт —
 * только признак, что он был (решение Р-252).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const actor = await currentActor();
  if (actor === null) return signInFirst(request, '/cabinet/manage/leads');

  try {
    ensure(actor, 'REQUEST_MODERATE');
  } catch (error) {
    if (error instanceof AccessDenied) return new NextResponse('Не найдено', { status: 404 });
    throw error;
  }

  const params = request.nextUrl.searchParams;
  const filter = {
    source: params.get('source') ?? undefined,
    status: params.get('status') ?? undefined,
    query: params.get('query') ?? undefined,
    // Граница — момент начала выгрузки: заявка, пришедшая во время
    // перебора страниц, не сдвигает их и не повторяет строку (Р-252).
    until: new Date(),
  };

  // Выгружается весь отбор, а не одна страница: человек нажимает «выгрузить»,
  // чтобы получить всё найденное, а не первые полсотни строк. Страницы
  // перебираются по одной, чтобы не держать в памяти разом весь перечень.
  // Защита от формул — в записи книги: строка всегда пишется текстом
  // (`lib/disk/xlsx.ts`, Р-246, Р-425).
  const set = columnSet(params.get('cols') ?? undefined);
  const columns = leadColumns(set);
  const rows: LeadRowView[] = [];

  let page = 1;
  let total = 0;
  for (;;) {
    const chunk = await leadList(actor, { ...filter, page });
    total = chunk.total;
    rows.push(...chunk.rows);
    if (page >= chunk.pages) break;
    page += 1;
  }

  // В журнал идёт признак поиска, а не его текст: ищут по имени, почте и
  // телефону, и строка поиска — те же персональные данные, только в
  // журнале, который обезличивание не находит (решение Р-252).
  await record(actor, {
    action: 'LEAD_EXPORT',
    objectType: 'Lead',
    payload: {
      rows: rows.length,
      total,
      columns: set,
      source: filter.source,
      status: filter.status,
      query: (filter.query ?? '').trim().length > 0,
    },
    ip: await requestIp(),
  });

  const stamp = moscowToday().toISOString().slice(0, 10);

  return new NextResponse(workbook('Заявки', columns, rows), {
    headers: {
      'content-type': XLSX_TYPE,
      'content-disposition': attachmentDisposition(`Заявки ${stamp}.xlsx`, `zayavki-${stamp}.xlsx`),
      'cache-control': 'private, no-store',
    },
  });
}

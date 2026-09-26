import { NextResponse, type NextRequest } from 'next/server';

import { AccessDenied, ensure } from '../../../../../lib/cabinet/access';
import { record } from '../../../../../lib/cabinet/audit';
import { leadSourceLabel, leadStatusLabel } from '../../../../../lib/cabinet/lead-labels';
import { toCsv } from '../../../../../lib/cabinet/csv';
import { leadList } from '../../../../../lib/cabinet/queries';
import { currentActor, requestIp } from '../../../../../lib/cabinet/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


/**
 * Выгрузка отобранных заявок в таблицу — тем же отбором, что показан на
 * экране: что видно, то и выгружается.
 *
 * Выгрузка идёт в браузер и не оставляет файла на сервере: копия
 * персональных данных не должна заводиться там, где её никто не удалит.
 * Каждая выгрузка пишется в журнал действий с числом строк и условиями
 * отбора — это вынос персональных данных за пределы экрана, и он должен
 * быть виден проверяющему (решение Р-159).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const actor = await currentActor();
  if (actor === null) return new NextResponse('Требуется вход', { status: 401 });

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
  };

  // Выгружается весь отбор, а не одна страница: человек нажимает «выгрузить»,
  // чтобы получить всё найденное, а не первые полсотни строк. Страницы
  // перебираются по одной, чтобы не держать в памяти разом весь перечень.
  const head = [
    'Дата (МСК)',
    'Страница',
    'Форма',
    'Имя',
    'Контакт',
    'Вид контакта',
    'Организация',
    'Тема',
    'Что нужно',
    'Срок',
    'Сообщение',
    'Согласие',
    'Рассылка',
    'Состояние',
    'Работа заведена',
  ];
  // Строки собираются в общую выгрузку `toCsv`: она ставит апостроф перед
  // значением, которое табличный редактор исполнил бы как формулу, и
  // делит поля точкой с запятой, как ждёт русский Excel. Прежде здесь
  // была своя выгрузка без того и другого, а имя и сообщение приходят
  // с открытой формы сайта (решение Р-235).
  const lines: string[][] = [head];

  let page = 1;
  let total = 0;
  for (;;) {
    const chunk = await leadList(actor, { ...filter, page });
    total = chunk.total;
    for (const lead of chunk.rows) {
      lines.push(
        [
          // Время — московское, как на экранах: прежде стояло UTC без
          // пометки, и заявка от 26.09 в 01:30 выглядела вчерашней (Р-245).
          new Date(lead.createdAt.getTime() + 3 * 3_600_000).toISOString().slice(0, 16).replace('T', ' '),
          leadSourceLabel(lead.source),
          lead.form,
          lead.name ?? '',
          lead.contact,
          lead.contactKind === 'phone' ? 'Телефон' : 'Почта',
          lead.organization ?? '',
          lead.topic ?? '',
          lead.need ?? '',
          lead.deadline ?? '',
          lead.message ?? '',
          lead.consentGiven ? 'да' : 'нет',
          lead.marketingOptIn ? 'да' : 'нет',
          leadStatusLabel(lead.status),
          lead.projectId === null ? 'нет' : 'да',
        ],
      );
    }
    if (page >= chunk.pages) break;
    page += 1;
  }

  await record(actor, {
    action: 'LEAD_EXPORT',
    objectType: 'Lead',
    payload: { rows: lines.length - 1, total, ...filter },
    ip: await requestIp(),
  });

  const csv = toCsv(lines);
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`zayavki-${stamp}.csv`)}`,
      'cache-control': 'private, no-store',
    },
  });
}

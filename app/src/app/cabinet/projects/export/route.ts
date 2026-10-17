import { NextResponse, type NextRequest } from 'next/server';

import { AccessDenied, ensure } from '../../../../lib/cabinet/access';
import { record } from '../../../../lib/cabinet/audit';
import { moscowToday } from '../../../../lib/cabinet/clock';
import { attachmentDisposition } from '../../../../lib/cabinet/disposition';
import { listProjects, type ProjectFilter } from '../../../../lib/cabinet/queries';
import { currentActor, requestIp, signInFirst } from '../../../../lib/cabinet/session';
import { PROJECT_COLUMNS, XLSX_TYPE, workbook, type ProjectRowView } from '../../../../lib/cabinet/table-views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FILTERS: readonly ProjectFilter[] = ['active', 'waiting', 'done', 'all'];

/**
 * «Работы» книгой Excel — тем же набором вкладки, поиском и отбором по
 * сотруднику и сроку, что на экране (К-3, решение Р-593). Выгрузка —
 * практике: руководитель получает все работы, менеджер — свои, как в
 * перечне (`scopeProjects`). Денег в книге нет: их нет и на плашках.
 * Файл на сервере не остаётся; выгрузка пишется в журнал числом строк,
 * поиск — признаком, без текста (Р-252).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const actor = await currentActor();
  if (actor === null) return signInFirst(request, '/cabinet/projects');
  try {
    ensure(actor, 'REQUEST_MODERATE');
  } catch (error) {
    if (error instanceof AccessDenied) return new NextResponse('Не найдено', { status: 404 });
    throw error;
  }

  const params = request.nextUrl.searchParams;
  const state = params.get('state');
  const options = {
    filter: FILTERS.includes(state as ProjectFilter) ? (state as ProjectFilter) : undefined,
    query: params.get('q') ?? '',
    manager: params.get('manager') ?? undefined,
    curator: params.get('curator') ?? undefined,
    due: params.get('due') ?? undefined,
  };

  // Весь отбор, а не одна страница: страницы перебираются по одной.
  const rows: ProjectRowView[] = [];
  let page = 1;
  let applied: ProjectFilter = 'all';
  for (;;) {
    const chunk = await listProjects(actor, { ...options, page });
    applied = chunk.filter;
    rows.push(...chunk.rows);
    if (page >= chunk.pages) break;
    page += 1;
  }

  await record(actor, {
    action: 'PROJECTS_EXPORTED',
    objectType: 'Project',
    // Отбор по сотруднику и сроку — признаками, как поиск: по журналу видно,
    // что выгружен не весь перечень.
    payload: {
      rows: rows.length,
      state: applied,
      query: options.query.trim().length > 0,
      manager: (options.manager ?? '') !== '',
      curator: (options.curator ?? '') !== '',
      due: (options.due ?? '') !== '',
    },
    ip: await requestIp(),
  });

  const stamp = moscowToday().toISOString().slice(0, 10);
  return new NextResponse(workbook('Работы', PROJECT_COLUMNS, rows), {
    headers: {
      'content-type': XLSX_TYPE,
      'content-disposition': attachmentDisposition(`Работы ${stamp}.xlsx`, `raboty-${stamp}.xlsx`),
      'cache-control': 'private, no-store',
    },
  });
}

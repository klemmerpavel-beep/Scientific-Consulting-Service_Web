import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import {
  Card,
  Mono,
  ScreenHead,
  Tile,
  Tiles,
  FilterBar,
  Tabs,
  Text,
  TABLE_CELL,
  TABLE_HEAD,
  TABLE_NUM,
  TABLE_NUM_HEAD,
  TableCard,
  plural,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { financeSummary } from '../../../../lib/cabinet/finance';
import { formatAmount } from '../../../../lib/cabinet/money';
import { currentActor } from '../../../../lib/cabinet/session';

export const dynamic = 'force-dynamic';

/** Сколько строк расчётов показывается на одной странице. */
const PAGE_SIZE = 20;

export default async function FinanceScreen({
  searchParams,
}: {
  searchParams: Promise<{ set?: string; page?: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  // Финансовый контур ведёт руководитель: менеджер не видит ни начислений,
  // ни маржи (PD-LK-FUNC-002, п. 3.2).
  if (!can(actor, 'MARGIN_VIEW')) redirect('/cabinet/projects');

  const sp = await searchParams;
  const { rows, totals } = await financeSummary(actor);

  // По умолчанию показываются работы с незакрытым остатком: за этим на
  // экран и приходят. Полный перечень — вкладкой рядом (решение Р-172).
  // Итоги считаются по всем работам и от отбора не зависят.
  const owing = rows.filter((row) => row.awaiting > 0n);
  const all = sp.set === 'all';
  const chosen = all ? rows : owing;
  const pages = Math.max(1, Math.ceil(chosen.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(sp.page) || 1), pages);
  const shown = chosen.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const href = (set: 'owing' | 'all', next = 1) => {
    const params = new URLSearchParams();
    if (set === 'all') params.set('set', 'all');
    if (next > 1) params.set('page', String(next));
    const tail = params.toString();
    return tail === '' ? '/cabinet/manage/finance' : `/cabinet/manage/finance?${tail}`;
  };

  const tiles = [
    { label: 'Законтрактовано', value: totals.contracted },
    { label: 'Получено', value: totals.received },
    { label: 'К получению', value: totals.awaiting },
    // «Списано», а не «Потери»: здесь считаются транши со статусом
    // списания, а вкладка аналитики «Потери» считает недополученное по
    // остановленным работам. Две разные величины под одним словом на
    // соседних экранах читались как одна (решение Р-182).
    { label: 'Списано', value: totals.lost },
    { label: 'Маржа', value: totals.margin },
  ];

  return (
    <Shell actor={actor} current="/cabinet/manage/finance">
      <ScreenHead
        title="Договоры и расчёты"
        note="Маржа — сумма договора за вычетом начислений эксперту; у исторических работ, где исполнитель не указан, она равна сумме договора."
      />
      <Text style={{ marginBottom: 24 }}>
        <a href="/cabinet/manage/finance/years">Итоги по годам</a> — выручка и прибыль по годам:
        введённые вами рядом с посчитанными кабинетом.
      </Text>

      <Tiles>
        {tiles.map((tile) => (
          <Tile key={tile.label} label={tile.label} value={formatAmount(tile.value)} />
        ))}
      </Tiles>

      <FilterBar>
        <Tabs
          flush
          label="Отбор расчётов"
          items={[
            {
              href: href('owing'),
              label: `С остатком · ${owing.length}`,
              active: !all,
            },
            { href: href('all'), label: `Все работы · ${rows.length}`, active: all },
          ]}
        />
      </FilterBar>

      <TableCard label="Деньги по работам">
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={TABLE_HEAD} scope="col">Проект</th>
              <th style={TABLE_HEAD} scope="col">Клиент</th>
              <th scope="col" style={TABLE_NUM_HEAD}>Договор</th>
              <th scope="col" style={TABLE_NUM_HEAD}>Получено</th>
              <th scope="col" style={TABLE_NUM_HEAD}>К получению</th>
              <th scope="col" style={TABLE_NUM_HEAD}>Начислено</th>
              <th scope="col" style={TABLE_NUM_HEAD}>Маржа</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td style={TABLE_CELL} colSpan={7}>
                  {rows.length === 0
                    ? 'Договоров пока нет.'
                    : 'Незакрытых остатков нет — все работы оплачены.'}
                </td>
              </tr>
            ) : (
              shown.map((row) => (
                <tr key={row.projectId}>
                  <td style={TABLE_CELL}>
                    <a href={`/cabinet/projects/${row.code}/payments`}>{row.code}</a>
                    <br />
                    {row.title}
                  </td>
                  <td style={TABLE_CELL}>{row.client}</td>
                  <td style={TABLE_NUM}>{formatAmount(row.contracted)}</td>
                  <td style={TABLE_NUM}>{formatAmount(row.received)}</td>
                  <td style={TABLE_NUM}>{formatAmount(row.awaiting)}</td>
                  <td style={TABLE_NUM}>{formatAmount(row.accrued)}</td>
                  <td style={TABLE_NUM}>{formatAmount(row.margin)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableCard>

      {pages <= 1 ? null : (
        <nav
          aria-label="Страницы расчётов"
          style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', marginTop: 20 }}
        >
          {page > 1 ? (
            <a className="cab-mark" href={href(all ? 'all' : 'owing', page - 1)}>
              Предыдущие
            </a>
          ) : null}
          <Text muted size={14}>
            Страница {page} из {pages} · всего {chosen.length}{' '}
            {plural(chosen.length, 'работа', 'работы', 'работ')}
          </Text>
          {page < pages ? (
            <a className="cab-mark" href={href(all ? 'all' : 'owing', page + 1)}>
              Следующие
            </a>
          ) : null}
        </nav>
      )}
    </Shell>
  );
}

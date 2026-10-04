import { redirect } from 'next/navigation';

import Shell from '../../../../../components/cabinet/Shell';
import {
  Disclosure,
  ScreenHead,
  TABLE_CELL,
  TABLE_HEAD,
  TABLE_NUM,
  TABLE_NUM_HEAD,
  TableCard,
  Text,
  formatDate,
  plural,
} from '../../../../../components/cabinet/ui';
import { can } from '../../../../../lib/cabinet/access';
import { receiptsPlan, type ReceiptLine } from '../../../../../lib/cabinet/finance';
import { formatAmount } from '../../../../../lib/cabinet/money';
import { homeFor } from '../../../../../lib/cabinet/nav';
import { requireActor } from '../../../../../lib/cabinet/session';

export const dynamic = 'force-dynamic';

const tranches = (count: number) => `${count} ${plural(count, 'транш', 'транша', 'траншей')}`;

/**
 * «Деньги → Поступления» (требование РК-20, решение Р-348).
 *
 * Сколько и когда клиенты должны заплатить по уже заключённым договорам:
 * незакрытые транши по месяцам на полгода вперёд и «Далее»; отдельно —
 * просроченные, без даты и остаток, не разнесённый по траншам. Итог равен
 * «К получению».
 */
export default async function ReceiptsScreen() {
  const actor = await requireActor('/cabinet/manage/finance/receipts');
  if (!can(actor, 'MARGIN_VIEW')) redirect(homeFor(actor));
  const plan = await receiptsPlan(actor);
  const byBucket = (pick: (line: ReceiptLine) => boolean) => plan.lines.filter(pick);
  const groups = [
    { key: 'overdue', title: 'Просрочено', lines: byBucket((line) => line.bucket === 'overdue') },
    ...plan.months.map((month) => ({
      key: month.key,
      title: month.label,
      lines: byBucket((line) => line.month === month.key),
    })),
    { key: 'later', title: 'Далее', lines: byBucket((line) => line.bucket === 'later') },
    { key: 'undated', title: 'Без даты', lines: byBucket((line) => line.bucket === 'undated') },
  ].filter((group) => group.lines.length > 0);

  return (
    <Shell actor={actor} current="/cabinet/manage/finance">
      <ScreenHead
        backHref="/cabinet/manage/finance"
        backLabel="Деньги"
        title="Поступления"
        note={`По обязательствам клиентов; это не прогноз спроса. Итого ${formatAmount(plan.total)} — столько же, сколько «К получению».`}
      />

      <TableCard label="Поступления по месяцам" style={{ marginBottom: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
          <thead>
            <tr>
              <th style={TABLE_HEAD} scope="col">
                По плановым датам
              </th>
              {plan.months.map((month) => (
                <th key={month.key} style={TABLE_NUM_HEAD} scope="col">
                  {month.label}
                </th>
              ))}
              <th style={TABLE_NUM_HEAD} scope="col">
                Далее
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th style={TABLE_CELL} scope="row">
                Сумма
              </th>
              {plan.months.map((month) => (
                <td key={month.key} style={TABLE_NUM}>
                  {formatAmount(month.amount)}
                </td>
              ))}
              <td style={TABLE_NUM}>{formatAmount(plan.later.amount)}</td>
            </tr>
            <tr>
              <th style={TABLE_CELL} scope="row">
                Траншей
              </th>
              {plan.months.map((month) => (
                <td key={month.key} style={TABLE_NUM}>
                  {month.count}
                </td>
              ))}
              <td style={TABLE_NUM}>{plan.later.count}</td>
            </tr>
          </tbody>
        </table>
      </TableCard>

      <TableCard label="Вне помесячного ряда" style={{ marginBottom: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <tbody>
            <tr>
              <th style={TABLE_CELL} scope="row">
                <a className="cab-mark" href="/cabinet/manage/finance/debtors">
                  Просрочено
                </a>
              </th>
              <td style={TABLE_CELL}>{tranches(plan.overdue.count)}</td>
              <td style={TABLE_NUM}>{formatAmount(plan.overdue.amount)}</td>
            </tr>
            <tr>
              <th style={TABLE_CELL} scope="row">
                Без даты
              </th>
              <td style={TABLE_CELL}>{tranches(plan.undated.count)}</td>
              <td style={TABLE_NUM}>{formatAmount(plan.undated.amount)}</td>
            </tr>
            <tr>
              <th style={TABLE_CELL} scope="row">
                Не разнесено по траншам
              </th>
              <td style={TABLE_CELL}>
                {plan.unallocated.count} {plural(plan.unallocated.count, 'работа', 'работы', 'работ')}
              </td>
              <td style={TABLE_NUM}>{formatAmount(plan.unallocated.amount)}</td>
            </tr>
            <tr>
              <th style={{ ...TABLE_CELL, fontWeight: 600 }} scope="row">
                Итого — «К получению»
              </th>
              <td style={TABLE_CELL} />
              <td style={{ ...TABLE_NUM, fontWeight: 600 }}>{formatAmount(plan.total)}</td>
            </tr>
          </tbody>
        </table>
      </TableCard>

      <Text muted size={13} style={{ marginBottom: 16 }}>
        Транш учитывается в пределах остатка договора работы; отменённые работы денег не ждут.
        Не разнесено — остаток договора, на который транши ещё не заведены.
        {plan.excess.count === 0
          ? ''
          : ` Сверх остатка договора заведено ${tranches(plan.excess.count)} на ${formatAmount(plan.excess.amount)}: в итог они не входят — проверьте суммы на экранах оплат.`}
      </Text>

      {groups.length === 0 ? null : (
        <Disclosure title="Транши по месяцам">
          {groups.map((group) => (
            <div key={group.key} style={{ marginBottom: 16 }}>
              <Text size={14} style={{ fontWeight: 600, marginBottom: 6 }}>
                {group.title}
              </Text>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
                {group.lines.map((line) => (
                  <li key={line.trancheId}>
                    <a className="cab-mark" href={`/cabinet/projects/${line.code}/payments`}>
                      {line.work}
                    </a>
                    <Text muted size={13}>
                      {`${line.title} · ${line.plannedDate === null ? 'без даты' : formatDate(line.plannedDate)} · ${formatAmount(line.amount)}`}
                    </Text>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Disclosure>
      )}
    </Shell>
  );
}

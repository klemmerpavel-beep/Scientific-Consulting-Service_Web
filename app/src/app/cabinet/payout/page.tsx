import { redirect } from 'next/navigation';

import Shell from '../../../components/cabinet/Shell';
import { MONO } from '../../../components/cabinet/tokens';
import {
  Empty,
  ScreenHead,
  TABLE_CELL,
  TABLE_HEAD,
  TABLE_NUM,
  TABLE_NUM_HEAD,
  TableCard,
  Tile,
  Tiles,
  formatDate,
} from '../../../components/cabinet/ui';
import { can } from '../../../lib/cabinet/access';
import { ownPayouts } from '../../../lib/cabinet/finance';
import { formatAmount } from '../../../lib/cabinet/money';
import { currentActor } from '../../../lib/cabinet/session';

export const dynamic = 'force-dynamic';

/**
 * Собственное вознаграждение эксперта. Ни суммы договора, ни маржи здесь нет
 * и быть не может: выборка ограничена начислениями самого эксперта, а
 * экономика проекта в объект не попадает.
 */
export default async function PayoutScreen() {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  if (!can(actor, 'PAYOUT_VIEW_OWN')) redirect('/cabinet/projects');

  const { rows, accrued, paid } = await ownPayouts(actor);

  return (
    <Shell actor={actor} current="/cabinet/payout">
      <ScreenHead
        title="Начислено и выплачено"
        note="Начисления ставит практика по этапу или работе целиком."
      />

      {/* Плитка была переписана здесь вручную, и числа разошлись с общей
          частью: 180 против 190 в минимальной ширине, 24 против 28 в
          отступе (решение Р-172). */}
      <Tiles>
        <Tile label="Начислено" value={formatAmount(accrued)} />
        <Tile label="Выплачено" value={formatAmount(paid)} />
        <Tile label="К выплате" value={formatAmount(accrued - paid)} />
      </Tiles>

      {rows.length === 0 ? (
        <Empty title="Начислений пока нет">Появятся, когда практика начислит их по этапу или работе.</Empty>
      ) : (
        // Суммы шли строкой во flex и друг под другом по разряду не
        // вставали: сравнить их глазом было нельзя. Таблица ставит их в
        // столбец, как на прочих денежных экранах.
        <TableCard label="Начисления по работам">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr>
                <th style={TABLE_HEAD} scope="col">Работа</th>
                <th style={TABLE_HEAD} scope="col">За что</th>
                <th style={TABLE_HEAD} scope="col">Состояние</th>
                <th style={TABLE_NUM_HEAD} scope="col">Сумма, ₽</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td style={TABLE_CELL}>
                    <a href={`/cabinet/projects/${row.project.code}`}>{row.project.title}</a>
                    <div style={{ fontFamily: MONO, fontSize: 13, color: 'var(--pd-ink-muted)' }}>
                      {row.project.code}
                    </div>
                  </td>
                  <td style={TABLE_CELL}>
                    {row.stage?.title ?? 'по работе в целом'}
                    {row.comment === null ? null : (
                      <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>{row.comment}</div>
                    )}
                  </td>
                  <td style={TABLE_CELL}>
                    {row.status === 'PAID' ? `выплачено ${formatDate(row.paidOn)}` : 'начислено'}
                  </td>
                  <td style={TABLE_NUM}>{formatAmount(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </Shell>
  );
}

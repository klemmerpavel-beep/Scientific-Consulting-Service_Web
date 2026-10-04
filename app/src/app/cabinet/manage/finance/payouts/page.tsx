import { redirect } from 'next/navigation';

import Shell from '../../../../../components/cabinet/Shell';
import {
  Empty,
  ScreenHead,
  TABLE_CELL,
  TABLE_HEAD,
  TABLE_NUM,
  TABLE_NUM_HEAD,
  TableCard,
  Text,
  formatDate,
} from '../../../../../components/cabinet/ui';
import { can } from '../../../../../lib/cabinet/access';
import { curatorPayoutLines, payoutsByCurator } from '../../../../../lib/cabinet/finance';
import { formatAmount } from '../../../../../lib/cabinet/money';
import { homeFor } from '../../../../../lib/cabinet/nav';
import { requireActor } from '../../../../../lib/cabinet/session';

export const dynamic = 'force-dynamic';

/**
 * «Деньги → Вознаграждение кураторов» (требование РК-11, решение Р-339):
 * обязательства перед командой целиком — по куратору начислено,
 * выплачено, к выплате; строка раскрывается до начислений по работам
 * (`?curator=`), без кода в браузере.
 */
export default async function CuratorPayoutsScreen({
  searchParams,
}: {
  searchParams: Promise<{ curator?: string }>;
}) {
  const actor = await requireActor('/cabinet/manage/finance/payouts');
  if (!can(actor, 'PAYOUT_MANAGE')) redirect(homeFor(actor));
  const { curator } = await searchParams;
  const rows = await payoutsByCurator(actor);
  const chosen = rows.find((row) => row.expertId === curator) ?? null;
  const lines = chosen === null ? [] : await curatorPayoutLines(actor, chosen.expertId);
  const total = rows.reduce((acc, row) => acc + row.toPay, 0n);

  return (
    <Shell actor={actor} current="/cabinet/manage/finance">
      <ScreenHead
        backHref="/cabinet/manage/finance"
        backLabel="Деньги"
        title="Вознаграждение кураторов"
        note={`К выплате всего: ${formatAmount(total)}. «К выплате» — начисленное без выплаченного.`}
      />
      {rows.length === 0 ? (
        <Empty title="Начислений пока нет">Начисления ставятся на экране «Оплаты и документы» работы.</Empty>
      ) : (
        <TableCard label="Вознаграждение кураторов">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr>
                <th style={TABLE_HEAD} scope="col">Куратор</th>
                <th style={TABLE_NUM_HEAD} scope="col">Работ</th>
                <th style={TABLE_NUM_HEAD} scope="col">Начислено</th>
                <th style={TABLE_NUM_HEAD} scope="col">Выплачено</th>
                <th style={TABLE_NUM_HEAD} scope="col">К выплате</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.expertId}>
                  <td style={TABLE_CELL}>
                    <a className="cab-mark" href={`/cabinet/manage/finance/payouts?curator=${row.expertId}#lines`}>
                      {row.fullName}
                    </a>
                  </td>
                  <td style={TABLE_NUM}>{row.works}</td>
                  <td style={TABLE_NUM}>{formatAmount(row.accrued)}</td>
                  <td style={TABLE_NUM}>{formatAmount(row.paid)}</td>
                  <td style={TABLE_NUM}>{formatAmount(row.toPay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      {chosen === null ? null : (
        <div id="lines" style={{ marginTop: 20 }}>
          <Text size={15} style={{ marginBottom: 10 }}>
            {`${chosen.fullName}: начисления по работам`}
          </Text>
          <TableCard label={`Начисления: ${chosen.fullName}`}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={TABLE_HEAD} scope="col">Работа</th>
                  <th style={TABLE_HEAD} scope="col">За что</th>
                  <th style={TABLE_HEAD} scope="col">Состояние</th>
                  <th style={TABLE_NUM_HEAD} scope="col">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td style={TABLE_CELL}>
                      <a className="cab-mark" href={`/cabinet/projects/${line.project.code}/payments`}>
                        {line.project.title}
                      </a>
                    </td>
                    <td style={TABLE_CELL}>
                      {line.stage?.title ?? 'по работе в целом'}
                      {line.comment === null ? null : (
                        <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>{line.comment}</div>
                      )}
                    </td>
                    <td style={TABLE_CELL}>{line.status === 'PAID' ? `выплачено ${formatDate(line.paidOn)}` : 'начислено'}</td>
                    <td style={TABLE_NUM}>{formatAmount(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        </div>
      )}
    </Shell>
  );
}

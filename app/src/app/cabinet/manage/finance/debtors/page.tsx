import { redirect } from 'next/navigation';

import ActionError from '../../../../../components/cabinet/ActionError';
import Shell from '../../../../../components/cabinet/Shell';
import {
  Button,
  Checkbox,
  Disclosure,
  Empty,
  Field,
  Form,
  Notice,
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
import { overdueTranches } from '../../../../../lib/cabinet/finance';
import { formatAmount } from '../../../../../lib/cabinet/money';
import { homeFor } from '../../../../../lib/cabinet/nav';
import { requireActor } from '../../../../../lib/cabinet/session';
import { moveTrancheDate, writeOffDebt } from '../../../actions';

export const dynamic = 'force-dynamic';

/**
 * «Деньги → Должники» (требование РК-10, решение Р-345).
 *
 * Просроченные транши — тем же условием, что плитка «Просрочено по
 * траншам» на «Сводке»: суммы совпадают. Давние сверху. У строки —
 * «Напомнить» (переписка работы с заготовкой без сумм), «Перенести дату»
 * с причиной в журнал, «Списать» с подтверждением и, для идущей работы,
 * приостановка до оплаты по п. 8.5 оферты.
 */
export default async function DebtorsScreen({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; moved?: string }>;
}) {
  const actor = await requireActor('/cabinet/manage/finance/debtors');
  if (!can(actor, 'MARGIN_VIEW')) redirect(homeFor(actor));
  const flags = await searchParams;
  const rows = await overdueTranches(actor);
  const total = rows.reduce((acc, row) => acc + row.amount, 0n);

  return (
    <Shell actor={actor} current="/cabinet/manage/finance">
      <ScreenHead
        backHref="/cabinet/manage/finance"
        backLabel="Деньги"
        title="Должники"
        note={
          rows.length === 0
            ? 'Просроченных платежей нет.'
            : `Просрочено ${rows.length} ${plural(rows.length, 'платёж', 'платежа', 'платежей')} на ${formatAmount(total)} — та же сумма, что «Просрочено по траншам» на «Сводке».`
        }
      />
      <ActionError id={flags.error} />
      {flags.moved === '1' ? (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="quiet">Дата перенесена; причина записана в журнал.</Notice>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <Empty title="Должников нет">Платежи со сроком раньше сегодняшнего дня оплачены, перенесены или списаны.</Empty>
      ) : (
        <>
          <Text muted size={13} style={{ marginBottom: 12 }}>
            Просрочен платёж, срок которого раньше сегодняшнего дня; отменённые работы денег не ждут.
            По п. 8.5 оферты работу можно приостановить до оплаты — «Приостановить» у строки ведёт к
            смене состояния работы.
          </Text>
          <TableCard label="Должники">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1040 }}>
              <thead>
                <tr>
                  <th style={TABLE_HEAD} scope="col">Клиент</th>
                  <th style={TABLE_HEAD} scope="col">Работа</th>
                  <th style={TABLE_HEAD} scope="col">Менеджер</th>
                  <th style={TABLE_HEAD} scope="col">Транш</th>
                  <th style={TABLE_NUM_HEAD} scope="col">Сумма</th>
                  <th style={TABLE_HEAD} scope="col">Плановая дата</th>
                  <th style={TABLE_NUM_HEAD} scope="col">Дней просрочки</th>
                  <th style={TABLE_HEAD} scope="col">Что сделать</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.trancheId}>
                    <td style={TABLE_CELL}>{row.client}</td>
                    <td style={TABLE_CELL}>
                      <a className="cab-mark" href={`/cabinet/projects/${row.code}/payments`}>
                        {row.work}
                      </a>
                      {row.workStatus === 'PAUSED' ? ' · приостановлена' : ''}
                    </td>
                    <td style={TABLE_CELL}>{row.manager}</td>
                    <td style={TABLE_CELL}>{row.title}</td>
                    <td style={TABLE_NUM}>{formatAmount(row.amount)}</td>
                    <td style={TABLE_CELL}>{formatDate(row.plannedDate)}</td>
                    <td style={TABLE_NUM}>{row.late}</td>
                    <td style={{ ...TABLE_CELL, minWidth: 220 }}>
                      <div style={{ display: 'grid', gap: 6 }}>
                        <a
                          className="cab-mark"
                          href={`/cabinet/projects/${row.code}/messages?draft=payment&tranche=${row.trancheId}#body`}
                        >
                          Напомнить
                        </a>
                        {row.workStatus === 'ACTIVE' ? (
                          <a className="cab-mark" href={`/cabinet/projects/${row.code}/status?to=PAUSED`}>
                            Приостановить
                          </a>
                        ) : null}
                        <Disclosure title="Перенести дату">
                          <Form action={moveTrancheDate}>
                            <input type="hidden" name="trancheId" value={row.trancheId} />
                            <Field label="Новая плановая дата" name="plannedDate" type="date" scope={row.trancheId} required />
                            <Field
                              label="Причина переноса"
                              name="reason"
                              scope={`reason-${row.trancheId}`}
                              required
                              hint="Записывается в журнал."
                            />
                            <Button tone="quiet">Перенести</Button>
                          </Form>
                        </Disclosure>
                        <Disclosure title="Списать">
                          <Form action={writeOffDebt}>
                            <input type="hidden" name="trancheId" value={row.trancheId} />
                            <Checkbox name="confirm" required label="Подтверждаю: долг списывается и больше не ждёт оплаты" />
                            <Button tone="quiet">Списать</Button>
                          </Form>
                        </Disclosure>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        </>
      )}
    </Shell>
  );
}

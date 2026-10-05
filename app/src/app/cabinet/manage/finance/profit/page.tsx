import { redirect } from 'next/navigation';

import ActionError from '../../../../../components/cabinet/ActionError';
import Shell from '../../../../../components/cabinet/Shell';
import {
  Button,
  Card,
  Field,
  Form,
  FormActions,
  Heading,
  ScreenHead,
  Select,
  TABLE_CELL,
  TABLE_HEAD,
  TABLE_NUM,
  TABLE_NUM_HEAD,
  TableCard,
  Text,
} from '../../../../../components/cabinet/ui';
import { can } from '../../../../../lib/cabinet/access';
import { MONTHS_SHORT } from '../../../../../lib/cabinet/analytics/metrics';
import { formDraft } from '../../../../../lib/cabinet/flash';
import { formatAmount } from '../../../../../lib/cabinet/money';
import { homeFor } from '../../../../../lib/cabinet/nav';
import { expenseCategories, monthlyProfit } from '../../../../../lib/cabinet/profit';
import { serviceTypes } from '../../../../../lib/cabinet/queries';
import { requireActor } from '../../../../../lib/cabinet/session';
import { addExpenseAction, removeExpenseAction } from '../../../actions';

export const dynamic = 'force-dynamic';

const label = (year: number, month: number) => `${MONTHS_SHORT[month - 1]} ${year}`;

/**
 * «Деньги → Прибыль по месяцам» (требование РК-21, решение Р-353).
 *
 * Прибыль месяца — поступления по дате поступления минус выплаты
 * кураторам по дате выплаты минус расходы по статьям; разрез по видам
 * работ, расходы без вида — «общие». Здесь же вносятся расходы месяца.
 */
export default async function ProfitScreen({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requireActor('/cabinet/manage/finance/profit');
  if (!can(actor, 'MARGIN_VIEW')) redirect(homeFor(actor));
  const flags = await searchParams;
  const draft = (await formDraft(flags.error)) ?? {};
  const editable = can(actor, 'PAYMENT_EDIT');
  const [profit, categories, types] = await Promise.all([
    monthlyProfit(actor),
    editable ? expenseCategories(actor) : Promise.resolve([]),
    editable ? serviceTypes(actor) : Promise.resolve([]),
  ]);
  const total = profit.months.reduce(
    (acc, month) => ({
      revenue: acc.revenue + month.revenue,
      payouts: acc.payouts + month.payouts,
      expenses: acc.expenses + month.expenses,
      profit: acc.profit + month.profit,
    }),
    { revenue: 0n, payouts: 0n, expenses: 0n, profit: 0n },
  );

  return (
    <Shell actor={actor} current="/cabinet/manage/finance">
      <ScreenHead
        backHref="/cabinet/manage/finance"
        backLabel="Деньги"
        title="Прибыль по месяцам"
        note={`Поступления по дате поступления минус выплаты кураторам по дате выплаты минус расходы по статьям; двенадцать месяцев по текущий. Сумма месяцев года сходится с «Итогами по годам».${profit.fallbackDated === 0 ? '' : ` Поступлений без даты оплаты — ${profit.fallbackDated}: по строкам перенесённой книги они отнесены к дате договора или заказа.`}`}
      />
      <ActionError id={flags.error} />

      <TableCard label="Прибыль по месяцам" style={{ marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr>
              <th style={TABLE_HEAD} scope="col">Месяц</th>
              <th style={TABLE_NUM_HEAD} scope="col">Поступления</th>
              <th style={TABLE_NUM_HEAD} scope="col">Выплаты кураторам</th>
              <th style={TABLE_NUM_HEAD} scope="col">Расходы</th>
              <th style={TABLE_NUM_HEAD} scope="col">Прибыль</th>
            </tr>
          </thead>
          <tbody>
            {profit.months.map((month) => (
              <tr key={month.key}>
                <th style={TABLE_CELL} scope="row">{label(month.year, month.month)}</th>
                <td style={TABLE_NUM}>{formatAmount(month.revenue)}</td>
                <td style={TABLE_NUM}>{formatAmount(month.payouts)}</td>
                <td style={TABLE_NUM}>{formatAmount(month.expenses)}</td>
                <td style={TABLE_NUM}>{formatAmount(month.profit)}</td>
              </tr>
            ))}
            <tr>
              <th style={{ ...TABLE_CELL, fontWeight: 600 }} scope="row">Итого</th>
              <td style={{ ...TABLE_NUM, fontWeight: 600 }}>{formatAmount(total.revenue)}</td>
              <td style={{ ...TABLE_NUM, fontWeight: 600 }}>{formatAmount(total.payouts)}</td>
              <td style={{ ...TABLE_NUM, fontWeight: 600 }}>{formatAmount(total.expenses)}</td>
              <td style={{ ...TABLE_NUM, fontWeight: 600 }}>{formatAmount(total.profit)}</td>
            </tr>
          </tbody>
        </table>
      </TableCard>

      <TableCard label="По видам работ" style={{ marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <caption style={{ ...TABLE_CELL, textAlign: 'left', color: 'var(--pd-ink-secondary)' }}>
            По видам работ за те же месяцы; расходы без вида — «общие».
          </caption>
          <thead>
            <tr>
              <th style={TABLE_HEAD} scope="col">Вид работ</th>
              <th style={TABLE_NUM_HEAD} scope="col">Поступления</th>
              <th style={TABLE_NUM_HEAD} scope="col">Выплаты кураторам</th>
              <th style={TABLE_NUM_HEAD} scope="col">Расходы</th>
              <th style={TABLE_NUM_HEAD} scope="col">Прибыль</th>
            </tr>
          </thead>
          <tbody>
            {profit.byType.length === 0 ? (
              <tr>
                <td style={TABLE_CELL} colSpan={5}>За двенадцать месяцев движения денег нет.</td>
              </tr>
            ) : (
              profit.byType.map((row) => (
                <tr key={row.typeCode}>
                  <th style={TABLE_CELL} scope="row">{row.typeName}</th>
                  <td style={TABLE_NUM}>{formatAmount(row.revenue)}</td>
                  <td style={TABLE_NUM}>{formatAmount(row.payouts)}</td>
                  <td style={TABLE_NUM}>{formatAmount(row.expenses)}</td>
                  <td style={TABLE_NUM}>{formatAmount(row.profit)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableCard>

      {!editable ? null : (
        <Card>
          <Heading level={2} size={3} style={{ marginBottom: 12 }}>
            Расходы
          </Heading>
          <Form action={addExpenseAction}>
            <Field label="Месяц" name="month" type="month" required defaultValue={draft.month ?? ''} />
            <Select label="Статья" name="categoryId" required defaultValue={draft.categoryId ?? ''}>
              <option value="">Выберите статью</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
            <Field label="Сумма, ₽" name="amount" required defaultValue={draft.amount ?? ''} placeholder="25 000" />
            <Select label="Вид работ, если расход на него" name="serviceTypeId" defaultValue={draft.serviceTypeId ?? ''}>
              <option value="">Общий расход</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </Select>
            <Field label="Заметка" name="note" defaultValue={draft.note ?? ''} hint="Не длиннее 500 знаков." />
            <FormActions>
              <Button>Внести расход</Button>
            </FormActions>
          </Form>
          {profit.expenses.length === 0 ? (
            <Text muted style={{ marginTop: 16 }}>
              За двенадцать месяцев расходов не внесено.
            </Text>
          ) : (
            <ul style={{ margin: '20px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
              {profit.expenses.map((expense) => (
                <li key={expense.id} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Text size={14} style={{ flex: '1 1 260px' }}>
                    {`${label(expense.month.getUTCFullYear(), expense.month.getUTCMonth() + 1)} · ${expense.category.name} · ${formatAmount(expense.amount)}${expense.serviceType === null ? ' · общий' : ` · ${expense.serviceType.name}`}${expense.note === null ? '' : ` · ${expense.note}`}`}
                  </Text>
                  <Form action={removeExpenseAction} inline>
                    <input type="hidden" name="id" value={expense.id} />
                    <Button tone="quiet">Удалить</Button>
                  </Form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </Shell>
  );
}

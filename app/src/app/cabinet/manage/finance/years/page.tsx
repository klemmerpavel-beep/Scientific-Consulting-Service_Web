import { redirect } from 'next/navigation';

import Shell from '../../../../../components/cabinet/Shell';
import { SANS } from '../../../../../components/cabinet/tokens';
import {
  Button,
  Card,
  Empty,
  Field,
  Form,
  FormActions,
  FormRow,
  Heading,
  Mono,
  Text,
  TABLE_CELL,
  TABLE_HEAD,
  TABLE_NUM,
} from '../../../../../components/cabinet/ui';
import { can } from '../../../../../lib/cabinet/access';
import { yearlyRows } from '../../../../../lib/cabinet/finance-years';
import { formatAmount } from '../../../../../lib/cabinet/money';
import { currentActor } from '../../../../../lib/cabinet/session';
import { saveFinanceYear } from '../../../actions';

export const dynamic = 'force-dynamic';

/** Разница показывается со знаком: без него не видно, в какую сторону разошлось. */
function gap(value: bigint | null): string {
  if (value === null) return '—';
  if (value === 0n) return 'сходится';
  return `${value > 0n ? '+' : '−'}${formatAmount(value < 0n ? -value : value)}`;
}

export default async function FinanceYearsScreen() {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  if (!can(actor, 'MARGIN_VIEW')) redirect('/cabinet/projects');

  const rows = await yearlyRows(actor);
  const editable = can(actor, 'PAYMENT_EDIT');

  return (
    <Shell actor={actor} current="/cabinet/manage/finance">
      <Mono>Деньги практики</Mono>
      <Heading level={1} style={{ margin: '12px 0 8px' }}>
        Итоги по годам
      </Heading>
      <Text muted style={{ marginBottom: 24 }}>
        В строке года две величины рядом: введённая вами и посчитанная кабинетом по оплаченным
        траншам и выплатам экспертам. Пока история прошлых лет ведётся отдельно, они расходятся —
        колонка «расхождение» показывает, насколько.
      </Text>

      {rows.length === 0 ? (
        <Empty title="Годовых итогов пока нет">
          Введите первый год в форме ниже. Посчитанные величины появятся сами, как только по
          работам пройдут оплаты.
        </Empty>
      ) : (
        <Card style={{ padding: 0, overflowX: 'auto', marginBottom: 28 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SANS }}>
            <caption style={{ ...TABLE_CELL, textAlign: 'left', color: 'var(--pd-ink-secondary)' }}>
              Суммы в рублях. Выручка года — оплаты, пришедшие в этом году.
            </caption>
            <thead>
              <tr>
                <th style={TABLE_HEAD} scope="col">Год</th>
                <th style={TABLE_HEAD} scope="col">Выручка, введено</th>
                <th style={TABLE_HEAD} scope="col">Расходы, введено</th>
                <th style={TABLE_HEAD} scope="col">Прибыль, введено</th>
                <th style={TABLE_HEAD} scope="col">Выручка в кабинете</th>
                <th style={TABLE_HEAD} scope="col">Прибыль в кабинете</th>
                <th style={TABLE_HEAD} scope="col">Работ</th>
                <th style={TABLE_HEAD} scope="col">Расхождение</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.year}>
                  <th style={{ ...TABLE_CELL, fontWeight: 500 }} scope="row">
                    {row.year}
                  </th>
                  <td style={TABLE_NUM}>{row.entered ? formatAmount(row.entered.revenue) : '—'}</td>
                  <td style={TABLE_NUM}>{row.entered ? formatAmount(row.entered.costs) : '—'}</td>
                  <td style={TABLE_NUM}>{row.entered ? formatAmount(row.entered.profit) : '—'}</td>
                  <td style={TABLE_NUM}>{formatAmount(row.counted.revenue)}</td>
                  <td style={TABLE_NUM}>{formatAmount(row.counted.profit)}</td>
                  <td style={TABLE_NUM}>{row.counted.orders}</td>
                  <td style={TABLE_NUM}>{gap(row.revenueGap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {editable ? (
        <Card>
          <Mono>Ввод и правка</Mono>
          <Heading level={2} style={{ margin: '12px 0 8px' }}>
            Год целиком
          </Heading>
          <Text muted style={{ marginBottom: 16 }}>
            Повторный ввод того же года заменяет прежние величины: строка на год одна. Суммы
            принимаются в рублях, пробелы и запятая допустимы — «1 250 000,50».
          </Text>
          {/* minmax(0,1fr): без него колонка растягивается под содержимое и форма
              вылезает за край на телефоне (решение Р-130). */}
          <Form action={saveFinanceYear} style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
            <FormRow>
              <Field label="Год" name="year" required placeholder="2025" />
              <Field label="Выручка за год, ₽" name="revenue" required placeholder="1 250 000" />
              <Field label="Расходы за год, ₽" name="costs" required placeholder="480 000" />
            </FormRow>
            <Field
              label="Заметка"
              name="note"
              multiline
              hint="Чем именно отличается год: смена направления, длинная работа, разовый заказ."
            />
            <FormActions>
              <Button>Сохранить год</Button>
            </FormActions>
          </Form>
        </Card>
      ) : null}
    </Shell>
  );
}

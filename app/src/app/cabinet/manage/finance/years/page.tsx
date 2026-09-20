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
  LongTable,
  ScreenHead,
  Text,
  plural,
  TABLE_CELL,
  TABLE_HEAD,
  TableCard,
  TABLE_NUM,
  TABLE_NUM_HEAD,
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

  const { rows, datedByContract, undated } = await yearlyRows(actor);
  const editable = can(actor, 'PAYMENT_EDIT');

  return (
    <Shell actor={actor} current="/cabinet/manage/finance">
      <ScreenHead
        backHref="/cabinet/manage/finance"
        backLabel="к расчётам"
        title="Итоги по годам"
        note="В строке года две величины рядом: введённая вами и посчитанная кабинетом по оплаченным траншам и выплатам экспертам. Пока история прошлых лет ведётся отдельно, они расходятся — колонка «расхождение» показывает, насколько."
      />

      {rows.length === 0 ? (
        <Empty title="Годовых итогов пока нет">
          Введите первый год в форме ниже. Посчитанные величины появятся сами, как только по
          работам пройдут оплаты.
        </Empty>
      ) : (
        <LongTable
          label="Итоги по годам"
          minWidth={880}
          caption={
            <caption style={{ ...TABLE_CELL, textAlign: 'left', color: 'var(--pd-ink-secondary)' }}>
              Суммы в рублях. Выручка года — оплаты, пришедшие в этом году.
              {datedByContract > 0
                ? ` Из них ${datedByContract} ${plural(datedByContract, 'поступление отнесено', 'поступления отнесены', 'поступлений отнесены')} к году по дате договора: в перенесённой книге заказов дата оплаты не велась.`
                : ''}
            </caption>
          }
          columns={
            <tr>
              <th style={TABLE_HEAD} scope="col">Год</th>
              <th scope="col" style={TABLE_NUM_HEAD}>Выручка, введено</th>
              <th scope="col" style={TABLE_NUM_HEAD}>Расходы, введено</th>
              <th scope="col" style={TABLE_NUM_HEAD}>Прибыль, введено</th>
              <th scope="col" style={TABLE_NUM_HEAD}>Выручка в кабинете</th>
              <th scope="col" style={TABLE_NUM_HEAD}>Прибыль в кабинете</th>
              <th scope="col" style={TABLE_NUM_HEAD}>Работ</th>
              <th scope="col" style={TABLE_NUM_HEAD}>Расхождение</th>
            </tr>
          }
          rows={rows.map((row) => (
            <tr key={row.year}>
              <th style={TABLE_CELL} scope="row">
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
        />
      )}

      {undated > 0n ? (
        <Text muted style={{ marginBottom: 20 }}>
          Поступления на {formatAmount(undated)} в сводку не вошли: у них нет ни даты оплаты, ни
          даты договора, и отнести их к году не к чему. Проставьте дату договора на карточке
          работы — суммы появятся в своём году.
        </Text>
      ) : null}

      {editable ? (
        <Card style={{ marginTop: 28 }}>
          {/* Моно-метка над заголовком раздела ничего не добавляла:
              заголовок и так называет, что здесь делают (правило Р-141). */}
          <Heading level={2} style={{ marginBottom: 8 }}>
            Ввод и правка: год целиком
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

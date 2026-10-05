import { redirect } from 'next/navigation';

import ActionError from '../../../../../components/cabinet/ActionError';
import Shell from '../../../../../components/cabinet/Shell';
import { SANS } from '../../../../../components/cabinet/tokens';
import {
  Button,
  ButtonLink,
  Card,
  Empty,
  Field,
  Form,
  FormActions,
  FormRow,
  Heading,
  LongTable,
  Notice,
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
import { requireActor } from '../../../../../lib/cabinet/session';
import { homeFor } from '../../../../../lib/cabinet/nav';
import { removeFinanceYear, saveFinanceYear } from '../../../actions';

export const dynamic = 'force-dynamic';

/** Разница показывается со знаком: без него не видно, в какую сторону разошлось. */
function gap(value: bigint | null): string {
  if (value === null) return '—';
  if (value === 0n) return 'сходится';
  return `${value > 0n ? '+' : '−'}${formatAmount(value < 0n ? -value : value)}`;
}

export default async function FinanceYearsScreen({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; confirm?: string; removed?: string }>;
}) {
  const actor = await requireActor('/cabinet/manage/finance/years');
  if (!can(actor, 'MARGIN_VIEW')) redirect(homeFor(actor));

  const { rows, datedByContract, undated } = await yearlyRows(actor);
  const editable = can(actor, 'PAYMENT_EDIT');
  const flags = await searchParams;
  // Удаление года — второй формой: ссылка «Удалить» открывает
  // подтверждение с величинами года (требование РК-15, решение Р-346).
  const entered = rows.filter((row) => row.entered !== null);
  const confirming = editable ? (entered.find((row) => String(row.year) === flags.confirm) ?? null) : null;

  return (
    <Shell actor={actor} current="/cabinet/manage/finance">
      <ScreenHead
        backHref="/cabinet/manage/finance"
        backLabel="к расчётам"
        title="Итоги по годам"
        note="В строке года две величины рядом: введённая вами и посчитанная кабинетом по оплаченным траншам и выплатам кураторам. Пока история прошлых лет ведётся отдельно, они расходятся — колонка «расхождение» показывает, насколько, и считается по выручке. «Прибыль в кабинете» — выручка за вычетом выплаченного кураторам и расходов по статьям, внесённых в «Прибыли по месяцам»; расходы вне кабинета в неё не входят."
      />

      <ActionError id={flags.error} />
      {flags.removed === '1' ? (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="quiet">Введённые величины года удалены; запись — в журнале.</Notice>
        </div>
      ) : null}
      {confirming === null || confirming.entered === null ? null : (
        <Card style={{ marginBottom: 20 }}>
          <Heading level={2} size={3} style={{ marginBottom: 8 }}>
            Удалить введённые величины {confirming.year} года?
          </Heading>
          <Text style={{ marginBottom: 12 }}>
            Выручка {formatAmount(confirming.entered.revenue)}, расходы{' '}
            {formatAmount(confirming.entered.costs)}. Посчитанные кабинетом величины останутся; прежние
            цифры сохранятся в журнале.
          </Text>
          <Form action={removeFinanceYear} inline>
            <input type="hidden" name="year" value={confirming.year} />
            <Button>Удалить год</Button>
            <ButtonLink href="/cabinet/manage/finance/years" tone="quiet">
              Отмена
            </ButtonLink>
          </Form>
        </Card>
      )}

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
              {/* Прежде подпись говорила «по дате договора», а служба берёт
                  дату договора, а без неё — начала работы (решение Р-257). */}
              Суммы в рублях. Выручка года — оплаты, отнесённые к году по дате оплаты; без неё — по
              дате договора или начала работы.
              {datedByContract > 0
                ? ` Без даты оплаты — ${datedByContract} ${plural(datedByContract, 'поступление', 'поступления', 'поступлений')}: в перенесённой книге заказов она не велась.`
                : ''}
              {' '}Расхождение — по выручке: введённая минус посчитанная.
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
                {/* Заметка года — в его строке (улучшение УР-03, решение Р-387). */}
                {row.entered?.note ? (
                  <div style={{ fontSize: 13, fontWeight: 400, color: 'var(--pd-ink-muted)', maxWidth: 220 }}>
                    {row.entered.note}
                  </div>
                ) : null}
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
              hint="Чем именно отличается год: смена направления, длинная работа, разовый заказ. Пустое поле при повторном вводе года оставляет прежнюю заметку."
            />
            <FormActions>
              <Button>Сохранить год</Button>
            </FormActions>
          </Form>
          {entered.length === 0 ? null : (
            <Text muted size={13} style={{ marginTop: 16 }}>
              Удалить введённый год:{' '}
              {entered.map((row, index) => (
                <span key={row.year}>
                  {index === 0 ? '' : ' · '}
                  <a className="cab-mark" href={`/cabinet/manage/finance/years?confirm=${row.year}`}>
                    {row.year}
                  </a>
                </span>
              ))}
              . Сначала откроется подтверждение.
            </Text>
          )}
        </Card>
      ) : null}
    </Shell>
  );
}

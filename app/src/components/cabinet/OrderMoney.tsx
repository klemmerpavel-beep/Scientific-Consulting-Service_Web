import ActionError from './ActionError';
import { Button, Field, Form, FormActions, FormRow, Heading, Text } from './ui';
import { formatAmount } from '../../lib/cabinet/money';
import { RECEIPT_NOTE_MAX } from '../../lib/cabinet/finance';
import { recordReceiptAction } from '../../app/cabinet/actions';

/**
 * «Деньги по заказу» (запрос владельца 13.11.2026, решение Р-871).
 *
 * Числа — строкой в шапке карточки работы рядом с кнопкой «Деньги по
 * заказу», форма «Записать поступление» — на экране оплат, первой в сводке
 * договора. Отдельным блоком карточки они не стоят: у менеджера на ней уже
 * пять блоков, предел заказчика (Р-183). Строят их только у того, кто
 * ведёт деньги работы (`PAYMENT_EDIT`, Р-870): клиенту и куратору нет ни
 * чисел, ни формы, ни комментария в данных экрана.
 */
export interface OrderMoneyFigures {
  readonly contract: bigint;
  readonly received: bigint;
  readonly rest: bigint;
  readonly overpaid: bigint;
}

/** «Договор 120 000 ₽ · поступило 80 000 ₽ · остаток 40 000 ₽ · переплата …». */
export function orderMoneyLine(figures: OrderMoneyFigures | null): string {
  if (figures === null) return 'Сумма договора не указана';
  return [
    `Договор ${formatAmount(figures.contract)}`,
    `поступило ${formatAmount(figures.received)}`,
    `остаток ${formatAmount(figures.rest)}`,
    figures.overpaid > 0n ? `переплата ${formatAmount(figures.overpaid)}` : null,
  ]
    .filter((part) => part !== null)
    .join(' · ');
}

/**
 * Форма «Записать поступление»: сумма, дата и комментарий одним действием.
 * Комментарий — внутренний: подсказка под полем говорит это прямо.
 */
export function ReceiptForm({
  code,
  projectId,
  errorId,
  draft,
  today,
}: {
  code: string;
  projectId: string;
  errorId?: string;
  draft: Readonly<Record<string, string>>;
  /** Сегодня по Москве, `ГГГГ-ММ-ДД`: дата поступления по умолчанию. */
  today: string;
}) {
  return (
    <Form action={recordReceiptAction} id="receipt" style={{ scrollMarginTop: 24 }}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="back" value="payments" />
      <Heading level={2} size={3}>
        Записать поступление
      </Heading>
      <Text muted size={14} style={{ marginTop: -8 }}>
        Сколько денег пришло по заказу. Поступление сразу учитывается в «Получено» и «Осталось оплатить».
      </Text>
      <ActionError id={errorId} slot="receipt" />
      <FormRow>
        <Field
          label="Сумма поступления"
          name="amount"
          scope="receipt"
          required
          placeholder="50 000"
          defaultValue={draft.amount ?? ''}
        />
        <Field
          label="Дата поступления"
          name="paidOn"
          type="date"
          scope="receipt"
          required
          defaultValue={draft.paidOn ?? today}
        />
        <Field
          label="Комментарий"
          name="note"
          scope="receipt"
          maxLength={RECEIPT_NOTE_MAX}
          placeholder="Перевод на карту, счёт № 12"
          defaultValue={draft.note ?? ''}
          hint="Виден только практике: клиенту не показывается и в письма не уходит."
        />
      </FormRow>
      <FormActions>
        <Button>Записать поступление</Button>
      </FormActions>
    </Form>
  );
}

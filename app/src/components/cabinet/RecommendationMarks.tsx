import type { CSSProperties, ReactNode } from 'react';

import { CONFIDENCE_LABEL, calendarKey, type CalendarRow, type WindowState } from '../../lib/cabinet/analytics/calendar';
import { formatAmount } from '../../lib/cabinet/money';
import type { Mark } from '../../lib/cabinet/recommendations';
import { RADIUS } from './tokens';
import { Button, ButtonLink, Chip, Form, Mono, Text, formatDate, formatDay } from './ui';

const LABEL: Record<Mark['status'], string> = {
  ACCEPTED: 'принято',
  DECLINED: 'отклонено',
  DONE: 'сделано',
  POSTPONED: 'отложено',
};

const ROW: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' };

/**
 * Отметка рекомендации (требования РК-16, РК-17, решения Р-349, Р-350,
 * Р-491). Неотмеченную руководитель принимает, отклоняет или откладывает;
 * принятую поручает и отмечает сделанной; любую отметку можно снять.
 * «Поручить» стоит у неотмеченной, принятой и отложенной: отклонённое и
 * сделанное поручать незачем. Возврат — на тот экран, откуда отмечали.
 */
export default function RecommendationMarks({
  markKey,
  mark,
  back,
  action,
  assignHref,
}: {
  markKey: string | null;
  mark: Mark | undefined;
  back: 'recommendations' | 'calendar';
  /** Серверное действие отметки — передаёт экран. */
  action: (form: FormData) => Promise<void>;
  /** Поручение по рекомендации: форма поручения с готовым текстом. */
  assignHref?: string;
}) {
  if (markKey === null) return null;
  const form = (status: string, label: string, tone: 'primary' | 'quiet' = 'quiet') => (
    <Form action={action} inline>
      <input type="hidden" name="key" value={markKey} />
      <input type="hidden" name="status" value={status} />
      {/* Снимается та отметка, что видна на экране (Р-498). */}
      {status === '' && mark !== undefined ? <input type="hidden" name="current" value={mark.status} /> : null}
      <input type="hidden" name="back" value={back} />
      <Button tone={tone}>{label}</Button>
    </Form>
  );
  const assign =
    assignHref === undefined ? null : (
      <ButtonLink href={assignHref} tone={mark?.status === 'ACCEPTED' ? 'primary' : 'quiet'}>
        Поручить
      </ButtonLink>
    );
  if (mark === undefined) {
    return (
      <div style={ROW}>
        {form('ACCEPTED', 'Принять', 'primary')}
        {form('DECLINED', 'Отклонить')}
        {form('POSTPONED', 'Отложить')}
        {assign}
      </div>
    );
  }
  return (
    <div style={ROW}>
      <Chip tone={mark.status === 'ACCEPTED' || mark.status === 'DONE' ? 'accent' : 'neutral'}>
        {`${LABEL[mark.status]} ${formatDay(mark.at)}`}
      </Chip>
      {mark.status === 'ACCEPTED' || mark.status === 'POSTPONED' ? assign : null}
      {mark.status === 'ACCEPTED' ? form('DONE', 'Сделано') : null}
      {form('', 'Снять отметку')}
    </div>
  );
}

/**
 * Карточка одной рекомендации в ленте (решение Р-491): метка вида, суть,
 * на чём основана, отметка и действия — внизу карточки. Рамка и тихий фон
 * — как у записей «Сводки» (Р-490); отмеченная карточка — белая: взгляд
 * сначала находит то, что ещё ждёт решения.
 */
export function RecommendationCard({
  kind,
  title,
  details,
  marked,
  children,
}: {
  kind: string;
  title: ReactNode;
  details: ReactNode;
  marked: boolean;
  /** Отметка и действия. */
  children: ReactNode;
}) {
  return (
    <article
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        height: '100%',
        boxSizing: 'border-box',
        padding: '14px 16px 16px',
        border: '1px solid var(--pd-border)',
        borderRadius: RADIUS.field,
        background: marked ? 'var(--pd-ink-inverse)' : 'var(--pd-surface-quiet)',
      }}
    >
      <Mono>{kind}</Mono>
      <Text size={15} style={{ fontWeight: 600, lineHeight: 1.4 }}>
        {title}
      </Text>
      <Text muted size={13}>
        {details}
      </Text>
      <div style={{ marginTop: 'auto', paddingTop: 6 }}>{children}</div>
    </article>
  );
}

/** Метка карточки окна — по его состоянию (Р-491). */
const WINDOW_KIND: Record<WindowState, string> = {
  main: 'Главное окно идёт',
  open: 'Окно открыто',
  soon: 'Окно скоро',
  later: 'Окно впереди',
};

/** Форма поручения с готовым текстом. */
export const assignHref = (text: string) =>
  `/cabinet/manage/assignments?${new URLSearchParams({ text }).toString()}#new`;

/**
 * Карточка окна продвижения — одна и та же на «Рекомендациях» и в
 * «Сейчас» календаря (решения Р-491, Р-492): что сделать, даты окна,
 * уверенность и вес, отметка и поручение.
 */
export function CalendarRecommendationCard({
  row,
  mark,
  back,
  action,
}: {
  row: CalendarRow;
  mark: Mark | undefined;
  back: 'recommendations' | 'calendar';
  action: (form: FormData) => Promise<void>;
}) {
  const title =
    row.state === 'main'
      ? `Запустить продвижение «${row.typeName}»: заказ около ${formatDate(row.orderOn)}`
      : row.state === 'open'
        ? `Подготовить продвижение «${row.typeName}»: главное окно с ${formatDate(row.mainStart)}`
        : `Окно «${row.typeName}» откроется ${formatDate(row.windowStart)}: подготовить материалы`;
  return (
    <RecommendationCard
      kind={WINDOW_KIND[row.state ?? 'later']}
      title={title}
      details={[
        `окно ${formatDate(row.windowStart)} — ${formatDate(row.orderOn)}, главное с ${formatDate(row.mainStart)}`,
        `уверенность — ${CONFIDENCE_LABEL[row.confidence]}`,
        row.weight === null ? null : `вес ${formatAmount(row.weight)}`,
      ]
        .filter((part) => part !== null)
        .join(' · ')}
      marked={mark !== undefined}
    >
      <RecommendationMarks
        markKey={calendarKey(row)}
        mark={mark}
        back={back}
        action={action}
        assignHref={assignHref(
          `Запустить продвижение «${row.typeName}»: главное окно с ${formatDate(row.mainStart) ?? ''}, заказ около ${formatDate(row.orderOn) ?? ''}`,
        )}
      />
    </RecommendationCard>
  );
}

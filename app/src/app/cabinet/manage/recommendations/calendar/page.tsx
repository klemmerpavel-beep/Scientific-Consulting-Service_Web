import { redirect } from 'next/navigation';

import ActionError from '../../../../../components/cabinet/ActionError';
import RecommendationMarks from '../../../../../components/cabinet/RecommendationMarks';
import Shell from '../../../../../components/cabinet/Shell';
import {
  Button,
  Card,
  Chip,
  Disclosure,
  Form,
  Heading,
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
import {
  CONFIDENCE_LABEL,
  MONTH_NAMES,
  calendarKey,
  type CalendarRow,
} from '../../../../../lib/cabinet/analytics/calendar';
import { moscowToday, now as clockNow } from '../../../../../lib/cabinet/clock';
import { formatAmount } from '../../../../../lib/cabinet/money';
import { homeFor } from '../../../../../lib/cabinet/nav';
import { calendarFor } from '../../../../../lib/cabinet/recommendations';
import { markRecommendationAction } from '../../../actions';
import { requireActor } from '../../../../../lib/cabinet/session';

export const dynamic = 'force-dynamic';

const DAY = 86_400_000;
const SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const days = (value: number) => String(value).replace('.', ',');
const norm = (value: number) => (Math.round(value * 100) / 100).toString().replace('.', ',');

/** Что сделать по окну — строкой «Сейчас». */
function action(row: CalendarRow): string {
  if (row.state === 'main') {
    return `Запустить продвижение «${row.typeName}»: главное окно идёт, заказ около ${formatDate(row.orderOn)}`;
  }
  if (row.state === 'open') {
    return `Подготовить продвижение «${row.typeName}»: окно открыто, главное — с ${formatDate(row.mainStart)}`;
  }
  return `Окно «${row.typeName}» откроется ${formatDate(row.windowStart)}: подготовить материалы`;
}

/**
 * «Календарь продвижения» (требование РК-16, решение Р-349).
 *
 * Когда продвигать каждый вид работ — от сроков сдачи: расчётная дата
 * заказа — середина месяца сдачи минус медиана выполнения, окно — шесть
 * недель до неё, последние четыре главные. Сверху — «Сейчас» с одним–тремя
 * действиями; полоса на двенадцать месяцев; таблица видов; «На чём
 * основано» — заказы по месяцам и годам, медиана, средний чек и оговорки.
 */
export default async function PromoCalendarScreen({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requireActor('/cabinet/manage/recommendations/calendar');
  if (!can(actor, 'ANALYTICS_VIEW')) redirect(homeFor(actor));
  const flags = await searchParams;
  const at = clockNow();
  const { rows, now, marks, since, skipped, leads } = await calendarFor(actor, at);
  const today = moscowToday(at);
  const strip = Array.from({ length: 12 }, (_, index) => {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + index, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
    return { first, last, label: `${SHORT[first.getUTCMonth()]} ${String(first.getUTCFullYear()).slice(2)}` };
  });
  const windowed = rows.filter((row) => row.orderOn !== null);
  const cellOf = (row: CalendarRow, month: (typeof strip)[number]) => {
    const overlaps = (from: Date | null, to: Date | null) =>
      from !== null && to !== null && from.getTime() <= month.last.getTime() && to.getTime() >= month.first.getTime();
    const delivery = row.deliveryMonths.includes(month.first.getUTCMonth() + 1);
    if (overlaps(row.mainStart, row.orderOn)) return { text: 'главное', strong: true };
    if (overlaps(row.windowStart, row.mainStart === null ? null : new Date(row.mainStart.getTime() - DAY))) {
      return { text: 'окно', strong: false };
    }
    return delivery ? { text: 'сдача', strong: false, plain: true } : null;
  };

  return (
    <Shell actor={actor} current="/cabinet/manage/recommendations">
      <ScreenHead
        backHref="/cabinet/manage/recommendations"
        backLabel="Рекомендации"
        title="Календарь продвижения"
        note="Когда продвигать каждый вид работ: от сроков сдачи и медианы выполнения. Это ориентир по истории практики, не прогноз."
      />
      <ActionError id={flags.error} />

      <Card style={{ marginBottom: 20 }}>
        <Heading level={2} size={3} style={{ marginBottom: 10 }}>
          Сейчас
        </Heading>
        {now.length === 0 ? (
          <Text muted>
            Открытых окон продвижения нет
            {windowed.length === 0
              ? '.'
              : `; ближайшее — «${windowed.slice().sort((a, b) => a.windowStart!.getTime() - b.windowStart!.getTime())[0]!.typeName}» с ${formatDate(windowed.slice().sort((a, b) => a.windowStart!.getTime() - b.windowStart!.getTime())[0]!.windowStart)}.`}
          </Text>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 12 }}>
            {now.map((row) => (
              <li key={row.typeCode} style={{ display: 'grid', gap: 6 }}>
                <Text size={15}>{action(row)}</Text>
                <Text muted size={13}>
                  {`уверенность — ${CONFIDENCE_LABEL[row.confidence]}${row.weight === null ? '' : ` · вес ${formatAmount(row.weight)}`}`}
                </Text>
                <RecommendationMarks markKey={calendarKey(row)} mark={marks.get(calendarKey(row) ?? '')} back="calendar" action={markRecommendationAction} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {windowed.length === 0 ? null : (
        <TableCard label="Полоса на двенадцать месяцев" style={{ marginBottom: 20 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
            <caption style={{ ...TABLE_CELL, textAlign: 'left', color: 'var(--pd-ink-secondary)' }}>
              Окно продвижения — шесть недель до расчётной даты заказа, главное — последние четыре;
              «сдача» — месяц сдачи вида.
            </caption>
            <thead>
              <tr>
                <th style={TABLE_HEAD} scope="col">
                  Вид работ
                </th>
                {strip.map((month) => (
                  <th key={month.label} style={{ ...TABLE_HEAD, textAlign: 'center' }} scope="col">
                    {month.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {windowed.map((row) => (
                <tr key={row.typeCode}>
                  <th style={TABLE_CELL} scope="row">
                    {row.typeName}
                  </th>
                  {strip.map((month) => {
                    const cell = cellOf(row, month);
                    return (
                      <td
                        key={month.label}
                        style={{
                          ...TABLE_CELL,
                          textAlign: 'center',
                          fontSize: 12,
                          background: cell === null || 'plain' in cell ? undefined : 'var(--pd-accent-tint)',
                          color: cell === null ? undefined : 'var(--pd-ink)',
                          fontWeight: cell?.strong ? 600 : 400,
                        }}
                      >
                        {cell?.text ?? ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      <TableCard label="Виды работ" style={{ marginBottom: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1120 }}>
          <thead>
            <tr>
              <th style={TABLE_HEAD} scope="col">Вид работ</th>
              <th style={TABLE_NUM_HEAD} scope="col">Наблюдений</th>
              <th style={TABLE_HEAD} scope="col">Месяц сдачи (сроков / сезонов)</th>
              <th style={TABLE_NUM_HEAD} scope="col">Медиана, дней</th>
              <th style={TABLE_HEAD} scope="col">Заказ около</th>
              <th style={TABLE_HEAD} scope="col">Окно (главное с)</th>
              <th style={TABLE_HEAD} scope="col">Пик заказов, справочно</th>
              <th style={TABLE_NUM_HEAD} scope="col">Вес</th>
              <th style={TABLE_HEAD} scope="col">Уверенность</th>
              <th style={TABLE_HEAD} scope="col">Отметка</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.typeCode}>
                <th style={TABLE_CELL} scope="row">{row.typeName}</th>
                <td style={TABLE_NUM}>{row.observations}</td>
                <td style={TABLE_CELL}>
                  {row.deliveryMonths.length === 0
                    ? '—'
                    : `${row.deliveryMonths.map((month) => MONTH_NAMES[month - 1]).join(' и ')} (${row.deliveryCount} / ${row.deliverySeasons})`}
                </td>
                <td style={TABLE_NUM}>{row.medianDays === null ? '—' : days(row.medianDays)}</td>
                <td style={TABLE_CELL}>{row.orderOn === null ? '—' : formatDate(row.orderOn)}</td>
                <td style={TABLE_CELL}>
                  {row.windowStart === null
                    ? '—'
                    : `${formatDate(row.windowStart)} — ${formatDate(row.orderOn)} (${formatDate(row.mainStart)})`}
                </td>
                <td style={TABLE_CELL}>
                  {row.peak === null
                    ? '—'
                    : `${MONTH_NAMES[row.peak.month - 1]}: ${norm(row.peak.norm)}; по годам ${row.peak.years.map((year) => year.orders).join(' и ')}`}
                </td>
                <td style={TABLE_NUM}>{row.weight === null ? '—' : formatAmount(row.weight)}</td>
                <td style={TABLE_CELL}>{CONFIDENCE_LABEL[row.confidence]}</td>
                <td style={TABLE_CELL}>
                  <RecommendationMarks markKey={calendarKey(row)} mark={marks.get(calendarKey(row) ?? '')} back="calendar" action={markRecommendationAction} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      <Disclosure title="На чём основано">
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, display: 'grid', gap: 6 }}>
          <li>
            <Text size={14}>
              Учёт — с {formatDate(since)} по последний полный месяц; текущий неполный месяц не
              считается. Работ без даты заказа или раньше начала учёта: {skipped}.
            </Text>
          </li>
          <li>
            <Text size={14}>
              Медиана выполнения — по плановым длительностям: срок минус дата заказа. Месяц сдачи — по
              наблюдавшимся месяцам: сроки будущих месяцев не входят.
            </Text>
          </li>
          <li>
            <Text size={14}>
              Вес — норма заказов вида в окне по долям дней месяцев, умноженная на средний чек вида.
              Уверенность — по числу наблюдений; при двух сезонах месяца сдачи — не выше «вероятно».
            </Text>
          </li>
          <li>
            <Text size={14}>
              Заявки — справочно: вид заявки берётся по направлению формы сайта, одно направление
              объединяет несколько видов. Заявок без направления: {[...leads.values()][0]?.undirected ?? 0}.
            </Text>
          </li>
        </ul>
        {rows.map((row) => (
          <div key={row.typeCode} style={{ marginBottom: 16 }}>
            <Text size={14} style={{ fontWeight: 600, marginBottom: 4 }}>
              {row.typeName}
            </Text>
            <Text muted size={13} style={{ marginBottom: 6 }}>
              {`медиана ${row.medianDays === null ? '—' : `${days(row.medianDays)} дн.`} · средний чек ${row.averageCheck === null ? '—' : formatAmount(row.averageCheck)}`}
              {/* Заявки — по направлению формы сайта, к которому относится вид (РК-18). */}
              {leads.get(row.typeCode)?.direction == null ? '' : ` · заявки — по направлению «${leads.get(row.typeCode)!.direction}»`}
            </Text>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TABLE_HEAD} scope="col">Месяц</th>
                  <th style={TABLE_NUM_HEAD} scope="col">Норма заказов</th>
                  <th style={TABLE_HEAD} scope="col">По годам</th>
                  <th style={TABLE_NUM_HEAD} scope="col">Заявок направления, справочно</th>
                </tr>
              </thead>
              <tbody>
                {row.orders
                  .filter((month) => month.years.some((year) => year.orders > 0))
                  .map((month) => (
                    <tr key={month.month}>
                      <td style={TABLE_CELL}>{MONTH_NAMES[month.month - 1]}</td>
                      <td style={TABLE_NUM}>{norm(month.norm)}</td>
                      <td style={TABLE_CELL}>{month.years.map((year) => `${year.year}: ${year.orders}`).join(' · ')}</td>
                      <td style={TABLE_NUM}>{leads.get(row.typeCode)?.direction === null ? '—' : (leads.get(row.typeCode)?.byMonth[month.month - 1] ?? 0)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
      </Disclosure>
    </Shell>
  );
}

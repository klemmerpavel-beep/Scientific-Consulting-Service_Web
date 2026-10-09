import type { CSSProperties } from 'react';

import { MONTH_NAMES, type CalendarRow } from '../../lib/cabinet/analytics/calendar';
import { RADIUS, SANS } from './tokens';
import { Card, Heading, Text } from './ui';

const DAY = 86_400_000;
const SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
/**
 * Столбец с названием вида и датами. На узком экране график листается
 * вбок, а столбец стоит на месте и сужается, чтобы полосам осталось место.
 */
const LABEL = 'clamp(150px, 26vw, 300px)';
const STICKY: CSSProperties = { position: 'sticky', left: 0, zIndex: 1, background: 'var(--pd-ink-inverse)' };

/** Короткая дата полосы: «8 сен». */
const short = (value: Date) => `${value.getUTCDate()} ${SHORT[value.getUTCMonth()]}`;

const STATE_NOTE: Record<NonNullable<CalendarRow['state']>, string> = {
  main: 'главное окно идёт',
  open: 'окно открыто',
  soon: 'окно скоро',
  later: '',
};

const SWATCH: CSSProperties = { display: 'inline-block', flex: '0 0 auto', width: 22, height: 12, borderRadius: RADIUS.mark };
const WINDOW_BAR: CSSProperties = {
  background: 'var(--pd-accent-mark)',
  border: '1px solid var(--pd-accent-edge)',
};
const MAIN_BAR: CSSProperties = { background: 'var(--pd-accent)', border: '1px solid var(--pd-accent)' };
const DELIVERY: CSSProperties = {
  background:
    'repeating-linear-gradient(135deg, var(--pd-edge-neutral) 0 1px, transparent 1px 7px), var(--pd-surface-quiet)',
};

/**
 * Окна продвижения графиком Ганта (замечание владельца 08.10.2026, решение
 * Р-493).
 *
 * Прежде окна стояли таблицей «вид × месяц» со словами «окно», «главное»,
 * «сдача» в ячейках: месяц закрашивался целиком, даже если окно задевало
 * его одним днём, и где окно начинается и кончается, было не видно. Теперь
 * у каждого вида — полоса на шкале двенадцати месяцев с точностью до дня:
 * светлая часть — окно, тёмная — главные четыре недели, вертикальная черта
 * — расчётная дата заказа, штриховка — месяц сдачи, пунктир — сегодня.
 * Даты стоят и текстом в столбце вида: полосы — для взгляда, даты — для
 * чтения и для читалки (рисунок от неё скрыт).
 */
export default function PromoGantt({ rows, today }: { rows: readonly CalendarRow[]; today: Date }) {
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1);
  const months = Array.from({ length: 12 }, (_, index) => {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + index, 1));
    const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return { first, days, label: `${SHORT[first.getUTCMonth()]} ${String(first.getUTCFullYear()).slice(2)}` };
  });
  const total = months.reduce((sum, month) => sum + month.days, 0);
  const end = start + total * DAY;
  const columns = months.map((month) => `${month.days}fr`).join(' ');
  /** Доля шкалы от её начала, в процентах; за краями — край. */
  const at = (time: number) => Math.min(100, Math.max(0, ((time - start) / (end - start)) * 100));
  const todayAt = at(today.getTime() + DAY / 2);

  /**
   * Полоса от `from` до `to`. `joined` — сторона, которой она стыкуется с
   * соседней полосой: там угол прямой, иначе на стыке окна и главного окна
   * скругления оставляли выемку (Р-539).
   */
  const bar = (from: number, to: number, style: CSSProperties, joined: { left?: boolean; right?: boolean } = {}) => {
    if (to <= start || from >= end) return null;
    const left = at(from);
    const right = at(to);
    const squareLeft = from < start || joined.left === true;
    const squareRight = to > end || joined.right === true;
    return (
      <span
        style={{
          position: 'absolute',
          top: 'calc(50% - 10px)',
          height: 20,
          left: `${left}%`,
          width: `${Math.max(right - left, 0.4)}%`,
          boxSizing: 'border-box',
          // Окно, начатое до шкалы или уходящее за неё, обрезано прямым краем.
          borderTopLeftRadius: squareLeft ? 0 : RADIUS.mark,
          borderBottomLeftRadius: squareLeft ? 0 : RADIUS.mark,
          borderTopRightRadius: squareRight ? 0 : RADIUS.mark,
          borderBottomRightRadius: squareRight ? 0 : RADIUS.mark,
          ...style,
        }}
      />
    );
  };

  return (
    <Card style={{ marginBottom: 20 }}>
      <Heading level={2} size={3} style={{ marginBottom: 6 }}>
        Окна продвижения на двенадцать месяцев
      </Heading>
      <Text muted size={13} style={{ marginBottom: 12 }}>
        Окно — шесть недель до расчётной даты заказа, главное — последние четыре. Расчётная дата
        заказа — середина месяца сдачи минус медиана выполнения вида.
      </Text>

      {/* Обозначения поясняют рисунок, а рисунок от читалки скрыт: она
          читает даты в столбце вида, обозначения ей ни к чему (Р-539). */}
      <ul
        aria-hidden="true"
        style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', margin: '0 0 14px', padding: 0, listStyle: 'none' }}
      >
        {[
          { key: 'window', label: 'окно продвижения', swatch: { ...SWATCH, ...WINDOW_BAR } },
          { key: 'main', label: 'главное окно', swatch: { ...SWATCH, ...MAIN_BAR } },
          { key: 'order', label: 'расчётная дата заказа', swatch: { ...SWATCH, width: 3, height: 18, borderRadius: undefined, background: 'var(--pd-ink)' } },
          { key: 'delivery', label: 'месяц сдачи', swatch: { ...SWATCH, ...DELIVERY, border: '1px solid var(--pd-border)' } },
          { key: 'today', label: 'сегодня', swatch: { ...SWATCH, width: 0, height: 18, borderRadius: undefined, borderLeft: '2px dashed var(--pd-ink-muted)' } },
        ].map((item) => (
          <li key={item.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span aria-hidden="true" style={item.swatch} />
            <Text size={13} style={{ color: 'var(--pd-ink-secondary)' }}>
              {item.label}
            </Text>
          </li>
        ))}
      </ul>

      <div className="cab-gantt" role="region" aria-label="График окон продвижения" tabIndex={0} style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 900 }}>
          <div
            aria-hidden="true"
            style={{
              display: 'grid',
              gridTemplateColumns: `${LABEL} minmax(0,1fr)`,
              borderBottom: '1px solid var(--pd-border)',
            }}
          >
            <span style={STICKY} />
            <div style={{ display: 'grid', gridTemplateColumns: columns }}>
              {months.map((month) => (
                <span
                  key={month.label}
                  style={{
                    padding: '0 0 8px 6px',
                    borderLeft: '1px solid var(--pd-divider)',
                    fontFamily: SANS,
                    fontSize: 12,
                    lineHeight: 1.4,
                    color: 'var(--pd-ink-muted)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {month.label}
                </span>
              ))}
            </div>
          </div>

          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {rows.map((row) => {
              const windowFrom = row.windowStart?.getTime() ?? null;
              const mainFrom = row.mainStart?.getTime() ?? null;
              const orderOn = row.orderOn?.getTime() ?? null;
              return (
                <li
                  key={row.typeCode}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `${LABEL} minmax(0,1fr)`,
                    borderBottom: '1px solid var(--pd-divider)',
                  }}
                >
                  <div style={{ ...STICKY, padding: '10px 14px 10px 0', display: 'grid', gap: 2, alignContent: 'center' }}>
                    <Text size={14} style={{ fontWeight: 600, lineHeight: 1.4, color: 'var(--pd-ink)' }}>
                      {row.typeName}
                    </Text>
                    <Text muted size={12} style={{ lineHeight: 1.4 }}>
                      {[
                        row.state === null || row.state === 'later' ? null : STATE_NOTE[row.state],
                        windowFrom === null || orderOn === null
                          ? null
                          : `окно ${short(row.windowStart!)} — заказ ${short(row.orderOn!)}, главное с ${short(row.mainStart!)}`,
                        row.deliveryMonths.length === 0
                          ? null
                          : `сдача — ${row.deliveryMonths.map((month) => MONTH_NAMES[month - 1]).join(' и ')}`,
                      ]
                        .filter((part) => part !== null)
                        .join(' · ')}
                    </Text>
                  </div>
                  <div aria-hidden="true" style={{ position: 'relative', minHeight: 44 }}>
                    <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: columns }}>
                      {months.map((month) => (
                        <span
                          key={month.label}
                          style={{
                            borderLeft: '1px solid var(--pd-divider)',
                            ...(row.deliveryMonths.includes(month.first.getUTCMonth() + 1) ? DELIVERY : null),
                          }}
                        />
                      ))}
                    </div>
                    {windowFrom === null || mainFrom === null ? null : bar(windowFrom, mainFrom, WINDOW_BAR, { right: true })}
                    {mainFrom === null || orderOn === null
                      ? null
                      : bar(mainFrom, orderOn + DAY, MAIN_BAR, { left: windowFrom !== null && windowFrom < mainFrom })}
                    {orderOn === null || orderOn < start || orderOn >= end ? null : (
                      <span
                        style={{
                          position: 'absolute',
                          top: 'calc(50% - 15px)',
                          height: 30,
                          left: `calc(${at(orderOn + DAY / 2)}% - 1px)`,
                          width: 3,
                          background: 'var(--pd-ink)',
                        }}
                      />
                    )}
                    <span
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: `${todayAt}%`,
                        borderLeft: '2px dashed var(--pd-ink-muted)',
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Card>
  );
}

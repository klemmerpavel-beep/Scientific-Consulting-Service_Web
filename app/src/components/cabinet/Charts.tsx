/**
 * Графики кабинета. Разметка собирается элементами React; вся геометрия —
 * в `lib/cabinet/charts.ts` и проверяется отдельно от разметки.
 *
 * Каждый график — картинка с текстовым описанием (`role="img"` и
 * `aria-label`), а под ним на экранах стоит таблица с теми же числами:
 * график показывает форму, а читают — таблицу. Ни один вывод не существует
 * только в виде картинки.
 */

import type { CSSProperties } from 'react';

import {
  compactMoney,
  compactNumber,
  donutArc,
  niceCeil,
  seriesColor,
  seriesInkDark,
  smoothPath,
  ticks,
  topRoundedBar,
  wavePath,
  type WaveMood,
} from '../../lib/cabinet/charts';
import { MONO, RADIUS, SANS } from './tokens';

const GRID = 'var(--pd-divider)';
const MUTED = 'var(--pd-ink-muted)';
const INK = 'var(--pd-ink)';

const svgStyle: CSSProperties = { width: '100%', height: 'auto', display: 'block' };

/** Маркер ряда в легенде. Набор радиусов закрыт: 6 — подсветка. */
const swatch: CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: 6,
  border: '1px solid var(--pd-edge-neutral)',
  display: 'inline-block',
};

function Axis({
  padL,
  padT,
  iw,
  ih,
  max,
  format,
  count = 4,
}: {
  padL: number;
  padT: number;
  iw: number;
  ih: number;
  max: number;
  format: (value: number) => string;
  count?: number;
}) {
  return (
    <g>
      {ticks(max, count).map((value, index) => {
        const y = padT + (index / count) * ih;
        return (
          <g key={index}>
            <line
              x1={padL}
              y1={y}
              x2={padL + iw}
              y2={y}
              stroke={GRID}
              strokeWidth={1}
              strokeDasharray={index === count ? undefined : '1 3'}
            />
            <text x={padL - 7} y={y + 3.5} textAnchor="end" fontSize={12} fill={MUTED}>
              {format(value)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export interface BarDatum {
  readonly label: string;
  readonly value: number;
  readonly color?: string;
}

/** Вертикальные столбцы: шкала слева, подпись значения над столбцом. */
export function BarChart({
  data,
  format = compactNumber,
  title,
  height = 260,
  width = 720,
  unit,
}: {
  data: readonly BarDatum[];
  format?: (value: number) => string;
  title: string;
  height?: number;
  /**
   * Ширина поля рисунка. Рисунок растягивается по ширине карточки, и при
   * поле 720 px в карточке шириной 1160 всё увеличивается в полтора раза:
   * кегль 12 показывается как 19, а столбцов в ряду помещается в полтора
   * раза меньше. На широкой карточке поле задаётся по месту (Р-175).
   */
  width?: number;
  /**
   * Единица величины. Вынесенная в шкалу, она укорачивает подпись над
   * столбцом с «570 тыс» до «570» — и подписанными оказываются все
   * столбцы, а не каждый третий.
   */
  unit?: string;
}) {
  const W = width;
  const H = height;
  const pad = { t: 26, r: 14, b: 36, l: 52 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = niceCeil(Math.max(0, ...data.map((item) => item.value)) || 1);
  const n = Math.max(1, data.length);
  const gap = Math.max(6, (iw * 0.012 * 8) / n);
  const bw = Math.min(64, (iw - gap * (n - 1)) / n);
  const x0 = pad.l + (iw - (bw * n + gap * (n - 1))) / 2;

  /**
   * Прореживание подписей.
   *
   * При двух десятках столбцов подписи месяцев сливались в сплошную строку
   * («фев 24мар 24апр 24»), а числа над соседними столбцами наезжали друг
   * на друга. Подпись месяца занимает около 46 px при кегле 12, число —
   * около 54. Если шаг столбца меньше, показывается каждая k-я подпись;
   * отсчёт ведётся от последнего столбца, поэтому свежий месяц подписан
   * всегда, а расстановка остаётся равномерной. Значения остальных
   * столбцов не теряются: они в подсказке и в таблице под графиком.
   */
  const step = bw + gap;
  const everyLabel = Math.max(1, Math.ceil(46 / step));
  // Ширина числа считается по самой длинной подписи ряда, а не берётся
  // постоянной: «570» занимает втрое меньше «1 250 000 ₽», и мерить их
  // одной меркой значит прореживать подписи там, где они помещаются все.
  const valueWidth = Math.max(
    16,
    ...data.map((item) => (item.value === 0 ? 0 : format(item.value).length * 7 + 8)),
  );
  const everyValue = Math.max(1, Math.ceil(valueWidth / step));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={svgStyle}
      fontFamily={SANS} role="img" aria-label={title}>
      <Axis padL={pad.l} padT={pad.t} iw={iw} ih={ih} max={max} format={format} />
      {unit === undefined ? null : (
        <text x={4} y={12} textAnchor="start" fontSize={12} fill={MUTED}>
          {unit}
        </text>
      )}
      {/* Столбцы рисуются первыми, подписи — следом: иначе соседний столбец
          ложится поверх уже написанного числа и срезает его («175 ть»). */}
      {data.map((item, index) => {
        const x = x0 + index * (bw + gap);
        const h = max > 0 ? (item.value / max) * ih : 0;
        return (
          <g key={`bar-${item.label}-${index}`}>
            <title>{`${item.label}: ${format(item.value)}`}</title>
            <path
              d={topRoundedBar(x, pad.t + ih - h, bw, Math.max(0, h), 5)}
              fill={item.color ?? seriesColor(1)}
            />
          </g>
        );
      })}
      {data.map((item, index) => {
        const x = x0 + index * (bw + gap);
        const h = max > 0 ? (item.value / max) * ih : 0;
        const y = pad.t + ih - h;
        return (
          <g key={`label-${item.label}-${index}`}>
            {item.value === 0 || (n - 1 - index) % everyValue !== 0 ? null : (
              <text x={x + bw / 2} y={y - 6} textAnchor="middle" fontSize={12} fontWeight={500} fill={INK}>
                {format(item.value)}
              </text>
            )}
            {(n - 1 - index) % everyLabel === 0 ? (
              <text x={x + bw / 2} y={H - 12} textAnchor="middle" fontSize={12} fill={MUTED}>
                {item.label}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/** Горизонтальное ранжирование: длинные подписи слева, значение справа. */
export function RankChart({
  data,
  format = compactNumber,
  title,
  labelWidth = 200,
  width = 720,
}: {
  data: readonly BarDatum[];
  format?: (value: number) => string;
  title: string;
  labelWidth?: number;
  /** Ширина поля рисунка; на широкой карточке задаётся по месту (Р-176). */
  width?: number;
}) {
  const W = width;
  const rowH = 30;
  const padR = 92;
  const top = 6;
  const H = top * 2 + Math.max(1, data.length) * rowH;
  const max = Math.max(1, ...data.map((item) => item.value));
  const iw = W - labelWidth - padR;

  /**
   * Подпись не должна уходить за левый край.
   *
   * Подписи выключены вправо по границе колонки, и длинное название
   * позиции («Сопровождение выпускной квалификационной работы») уезжало
   * влево за пределы картинки: первые слова просто срезались, и строка
   * начиналась с середины. Ширину текста в SVG не измерить, поэтому она
   * оценивается по числу знаков — при кегле 12 знак кириллицы занимает
   * около 6,8 px. Что не поместилось, заменяется многоточием; полное
   * название остаётся в подсказке и в таблице под графиком.
   */
  const fit = (label: string): string => {
    const room = Math.max(6, Math.floor((labelWidth - 14) / 6.8));
    return label.length <= room ? label : `${label.slice(0, room - 1).trimEnd()}…`;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={svgStyle}
      fontFamily={SANS} role="img" aria-label={title}>
      {data.map((item, index) => {
        const y = top + index * rowH;
        const width = max > 0 ? (item.value / max) * iw : 0;
        return (
          <g key={`${item.label}-${index}`}>
            <title>{`${item.label}: ${format(item.value)}`}</title>
            <text x={labelWidth - 10} y={y + rowH / 2 + 4} textAnchor="end" fontSize={12} fill={INK}>
              {fit(item.label)}
            </text>
            <rect x={labelWidth} y={y + 6} width={iw} height={rowH - 14} rx={(rowH - 14) / 2} fill={GRID} />
            <rect
              x={labelWidth}
              y={y + 6}
              width={Math.max(4, width)}
              height={rowH - 14}
              rx={(rowH - 14) / 2}
              fill={item.color ?? seriesColor(1)}
            />
            <text x={labelWidth + Math.max(4, width) + 8} y={y + rowH / 2 + 4} fontSize={12} fontWeight={500} fill={INK}>
              {format(item.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export interface Series {
  readonly name: string;
  readonly points: readonly number[];
  readonly color?: string;
}

/** Линии по общей шкале с подписанной осью категорий. */
export function LineChart({
  categories,
  series,
  format = compactNumber,
  title,
  height = 280,
  width = 720,
}: {
  categories: readonly string[];
  series: readonly Series[];
  format?: (value: number) => string;
  title: string;
  height?: number;
  /** Ширина поля рисунка; на широкой карточке задаётся по месту (Р-176). */
  width?: number;
}) {
  const W = width;
  const H = height;
  const pad = { t: 26, r: 16, b: 34, l: 52 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = niceCeil(Math.max(1, ...series.flatMap((line) => [...line.points])));
  const xAt = (index: number): number =>
    pad.l + (categories.length <= 1 ? iw / 2 : (index / (categories.length - 1)) * iw);
  const yAt = (value: number): number => pad.t + ih - (value / max) * ih;
  /**
   * Прореживание подписей — то же правило, что у столбчатой диаграммы.
   *
   * Прежде шаг задавался числом («не больше двенадцати подписей») и не
   * зависел ни от ширины поля, ни от длины метки, а отсчёт вёлся от
   * начала ряда: на тридцати двух месяцах подписанным оказывался каждый
   * третий начиная с первого, и самый свежий месяц — тот, ради которого
   * на график и смотрят, — оставался без подписи (решение Р-176).
   */
  const gapX = categories.length <= 1 ? iw : iw / (categories.length - 1);
  const everyLabel = Math.max(1, Math.ceil(46 / gapX));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={svgStyle}
      fontFamily={SANS} role="img" aria-label={title}>
      <Axis padL={pad.l} padT={pad.t} iw={iw} ih={ih} max={max} format={format} />
      {series.map((line, lineIndex) => {
        const color = line.color ?? seriesColor(lineIndex);
        const points = line.points.map((value, index) => ({ x: xAt(index), y: yAt(value) }));
        return (
          <g key={line.name}>
            <path
              d={smoothPath(points)}
              fill="none"
              stroke={color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {points.map((point, index) => (
              <g key={index}>
                <title>{`${line.name} · ${categories[index] ?? ''}: ${format(line.points[index] ?? 0)}`}</title>
                <circle cx={point.x} cy={point.y} r={3} fill={color} stroke="var(--pd-ink-inverse)" strokeWidth={1.5} />
              </g>
            ))}
          </g>
        );
      })}
      {categories.map((category, index) =>
        (categories.length - 1 - index) % everyLabel === 0 ? (
          <text
            key={`tick-${category}-${index}`}
            x={xAt(index)}
            y={H - 10}
            /* Крайние подписи якорятся по краю поля: центрированная
               подпись последней точки наполовину уходила за границу
               рисунка и обрезалась («сен 2»). */
            textAnchor={index === 0 ? 'start' : index === categories.length - 1 ? 'end' : 'middle'}
            fontSize={12}
            fill={MUTED}
          >
            {category}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export interface Segment {
  readonly label: string;
  readonly value: number;
  readonly color?: string;
}

/** Кольцо со сводкой в центре. */
export function DonutChart({
  segments,
  center,
  centerLabel,
  title,
}: {
  segments: readonly Segment[];
  center: string;
  centerLabel: string;
  title: string;
}) {
  const W = 260;
  const H = 260;
  const cx = W / 2;
  const cy = H / 2;
  const outer = W / 2 - 6;
  const inner = outer * 0.66;
  const total = segments.reduce((acc, segment) => acc + segment.value, 0);

  let angle = -Math.PI / 2;
  // Цвет назначается по месту в исходном ряду, а не в отобранном: пока
  // индекс считался после отбрасывания пустых секторов, первый же тип с
  // нулевой суммой сдвигал цвета всех последующих относительно легенды
  // (решение Р-175).
  const arcs = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => segment.value > 0)
    .map(({ segment, index }) => {
      const to = angle + (segment.value / total) * Math.PI * 2;
      const path = donutArc(cx, cy, outer, inner, angle, to);
      angle = to;
      return { path, segment, index };
    });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={svgStyle}
      fontFamily={SANS} role="img" aria-label={title}>
      {total <= 0 ? (
        <>
          <circle cx={cx} cy={cy} r={(outer + inner) / 2} fill="none" stroke={GRID} strokeWidth={outer - inner} />
          <text x={cx} y={cy} textAnchor="middle" fontSize={12} fill={MUTED}>
            нет данных
          </text>
        </>
      ) : (
        <>
          {arcs.map(({ path, segment, index }) => (
            <path
              key={segment.label}
              d={path}
              fill={segment.color ?? seriesColor(index)}
              stroke="var(--pd-ink-inverse)"
              strokeWidth={1}
            >
              <title>{`${segment.label}: ${Math.round((segment.value / total) * 100)} %`}</title>
            </path>
          ))}
          <text x={cx} y={cy - 3} textAnchor="middle" fontSize={17} fontWeight={500} fill={INK}>
            {center}
          </text>
          <text x={cx} y={cy + 16} textAnchor="middle" fontSize={12} fill={MUTED} fontFamily={MONO}>
            {centerLabel}
          </text>
        </>
      )}
    </svg>
  );
}

/** Полоса долей: сегменты клиентов, структура портфеля. */
export function StackBar({
  segments,
  title,
  width = 720,
}: {
  segments: readonly Segment[];
  title: string;
  /** Ширина поля рисунка; на широкой карточке задаётся по месту (Р-176). */
  width?: number;
}) {
  const W = width;
  const H = 18;
  const total = segments.reduce((acc, segment) => acc + segment.value, 0);
  let x = 0;

  return (
    <svg viewBox={`0 0 ${W} ${H + 4}`} preserveAspectRatio="none" style={svgStyle}
      fontFamily={SANS} role="img" aria-label={title}>
      <rect x={0} y={0} width={W} height={H} rx={H / 2} fill={GRID} />
      {segments.map((segment, index) => {
        const width = total > 0 ? (segment.value / total) * W : 0;
        const share = total > 0 ? Math.round((segment.value / total) * 100) : 0;
        const left = x;
        const piece =
          width <= 0 ? null : (
            <g key={segment.label}>
              <rect
                x={left}
                y={0}
                width={Math.max(0, width - 1.5)}
                height={H}
                rx={H / 2}
                fill={segment.color ?? seriesColor(index)}
              >
                <title>{`${segment.label}: ${segment.value}`}</title>
              </rect>
              {/* Доля подписана прямо в сегменте, где он вмещает подпись:
                  иначе смысл держался бы на одной заливке. */}
              {width < 46 ? null : (
                <text
                  x={left + width / 2}
                  y={H / 2 + 4}
                  textAnchor="middle"
                  fontSize={12}
                  fill={seriesInkDark(index) ? INK : 'var(--pd-ink-inverse)'}
                >
                  {share} %
                </text>
              )}
            </g>
          );
        x += width;
        return piece;
      })}
    </svg>
  );
}

/**
 * Подпись под графиком: цвет — ряд.
 *
 * Два вида. Поток с переносом годится, когда подписей три-четыре и они
 * короткие. Столбец (`column`) нужен кольцу: в потоке шесть длинных
 * названий вставали в две колонки, порядок чтения рвался, и найти в них
 * нужный тип было нельзя. В столбце порядок строгий — тот же, что у
 * секторов, — а сумма и доля стоят столбиком и сравниваются по разряду.
 * Легенда со значениями и есть текстовый дублёр кольца: доля больше не
 * живёт в одной подсказке под мышью (решение Р-175).
 */
export function Legend({
  items,
  column = false,
}: {
  items: readonly { label: string; color: string; value?: string; share?: string }[];
  column?: boolean;
}) {
  if (column) {
    return (
      <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
        {items.map((item) => (
          <li
            key={item.label}
            style={{
              display: 'grid',
              gridTemplateColumns: '12px minmax(0,1fr) auto auto',
              alignItems: 'baseline',
              gap: 12,
              fontFamily: SANS,
              fontSize: 13,
              lineHeight: 1.5,
              color: 'var(--pd-ink-secondary)',
            }}
          >
            <i aria-hidden="true" style={{ ...swatch, background: item.color }} />
            <span>{item.label}</span>
            <span style={{ color: INK, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
              {item.value ?? ''}
            </span>
            <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 46, textAlign: 'right' }}>
              {item.share ?? ''}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 12 }}>
      {items.map((item) => (
        <span
          key={item.label}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: SANS, fontSize: 13, color: 'var(--pd-ink-secondary)' }}
        >
          <i aria-hidden="true" style={{ ...swatch, background: item.color }} />
          {item.label}
          {item.value === undefined ? null : <b style={{ color: INK, fontWeight: 500 }}>{item.value}</b>}
        </span>
      ))}
    </div>
  );
}

/**
 * Шкала готовности работы: заполнение волной, а не ровной заливкой.
 *
 * Прямая полоса сообщает одну величину — долю. Волна сообщает вторую:
 * гребень у кромки заполнения поднимается, пока работа идёт, опадает до
 * ряби, когда она ждёт человека, и сходит в гладь, когда всё закрыто.
 * Форма считается из доли, поэтому у каждой работы свой рисунок.
 *
 * Смысл на рисунке не держится: доля стоит числом рядом, а состояние —
 * словами в заголовке блока. Картинка помечена `aria-hidden`, потому что
 * читалке она не сообщает ничего сверх уже сказанного текстом.
 *
 * Покачивание — только у идущей работы и только через класс
 * `cab-tide`: правило `prefers-reduced-motion` в таблице токенов гасит
 * его вместе со всем прочим движением.
 */
export function WaveBar({ share, mood }: { share: number; mood: WaveMood }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'block',
        height: 26,
        borderRadius: RADIUS.mark,
        background: 'var(--pd-divider)',
        overflow: 'hidden',
      }}
    >
      <svg
        viewBox="0 0 100 24"
        preserveAspectRatio="none"
        style={{ display: 'block', width: '100%', height: '100%' }}
      >
        <path
          className={mood === 'active' ? 'cab-tide' : undefined}
          d={wavePath(share, mood)}
          fill="var(--pd-accent)"
        />
      </svg>
    </span>
  );
}

export { compactMoney, compactNumber, seriesColor };

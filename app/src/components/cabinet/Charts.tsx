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
  smoothPath,
  ticks,
  topRoundedBar,
} from '../../lib/cabinet/charts';
import { MONO, SANS } from './tokens';

const GRID = 'var(--pd-divider)';
const MUTED = 'var(--pd-ink-muted)';
const INK = 'var(--pd-ink)';

const svgStyle: CSSProperties = { width: '100%', height: 'auto', display: 'block' };

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
}: {
  data: readonly BarDatum[];
  format?: (value: number) => string;
  title: string;
  height?: number;
}) {
  const W = 720;
  const H = height;
  const pad = { t: 26, r: 14, b: 36, l: 52 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = niceCeil(Math.max(0, ...data.map((item) => item.value)) || 1);
  const n = Math.max(1, data.length);
  const gap = Math.max(6, (iw * 0.012 * 8) / n);
  const bw = Math.min(64, (iw - gap * (n - 1)) / n);
  const x0 = pad.l + (iw - (bw * n + gap * (n - 1))) / 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={svgStyle}
      fontFamily={SANS} role="img" aria-label={title}>
      <Axis padL={pad.l} padT={pad.t} iw={iw} ih={ih} max={max} format={format} />
      {data.map((item, index) => {
        const x = x0 + index * (bw + gap);
        const h = max > 0 ? (item.value / max) * ih : 0;
        const y = pad.t + ih - h;
        return (
          <g key={`${item.label}-${index}`}>
            <title>{`${item.label}: ${format(item.value)}`}</title>
            <path d={topRoundedBar(x, y, bw, Math.max(0, h), 5)} fill={item.color ?? seriesColor(1)} />
            {item.value === 0 ? null : (
              <text x={x + bw / 2} y={y - 6} textAnchor="middle" fontSize={12} fontWeight={500} fill={INK}>
                {format(item.value)}
              </text>
            )}
            <text x={x + bw / 2} y={H - 12} textAnchor="middle" fontSize={12} fill={MUTED}>
              {item.label}
            </text>
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
}: {
  data: readonly BarDatum[];
  format?: (value: number) => string;
  title: string;
  labelWidth?: number;
}) {
  const W = 720;
  const rowH = 30;
  const padR = 92;
  const top = 6;
  const H = top * 2 + Math.max(1, data.length) * rowH;
  const max = Math.max(1, ...data.map((item) => item.value));
  const iw = W - labelWidth - padR;

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
              {item.label}
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
}: {
  categories: readonly string[];
  series: readonly Series[];
  format?: (value: number) => string;
  title: string;
  height?: number;
}) {
  const W = 720;
  const H = height;
  const pad = { t: 26, r: 16, b: 34, l: 52 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = niceCeil(Math.max(1, ...series.flatMap((line) => [...line.points])));
  const xAt = (index: number): number =>
    pad.l + (categories.length <= 1 ? iw / 2 : (index / (categories.length - 1)) * iw);
  const yAt = (value: number): number => pad.t + ih - (value / max) * ih;
  // Подписи месяцев на узком экране сливаются: показывается каждая n-я.
  const step = Math.ceil(categories.length / 12);

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
        index % step === 0 ? (
          <text key={category} x={xAt(index)} y={H - 10} textAnchor="middle" fontSize={12} fill={MUTED}>
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
  const arcs = segments
    .filter((segment) => segment.value > 0)
    .map((segment, index) => {
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
              strokeWidth={2}
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
export function StackBar({ segments, title }: { segments: readonly Segment[]; title: string }) {
  const W = 720;
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
                  fill={index % 4 === 2 ? INK : 'var(--pd-ink-inverse)'}
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

/** Подпись под графиком: цвет — ряд. */
export function Legend({ items }: { items: readonly { label: string; color: string; value?: string }[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 12 }}>
      {items.map((item) => (
        <span
          key={item.label}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: SANS, fontSize: 13, color: 'var(--pd-ink-secondary)' }}
        >
          <i
            aria-hidden="true"
            style={{
              width: 12,
              height: 12,
              borderRadius: 2,
              background: item.color,
              border: '1px solid var(--pd-edge-neutral)',
              display: 'inline-block',
            }}
          />
          {item.label}
          {item.value === undefined ? null : <b style={{ color: INK, fontWeight: 500 }}>{item.value}</b>}
        </span>
      ))}
    </div>
  );
}

export { compactMoney, compactNumber, seriesColor };

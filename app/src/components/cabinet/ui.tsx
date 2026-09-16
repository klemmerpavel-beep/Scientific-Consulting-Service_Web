import type { CSSProperties, ReactNode } from 'react';

import { MONO, RADIUS, SANS, SERIF, SHADOW } from './tokens.ts';

/**
 * Составные части экранов кабинета. Пишутся вручную и типизированно —
 * в отличие от девяти страниц сайта, которые порождаются из макетов
 * `tools/dc-to-tsx.mjs`. Обоснование — docs/DECISIONS.md, Р-122.
 *
 * Стили заданы объектами, как на страницах сайта; общие правила и токены
 * подключаются один раз в разметке раздела.
 */

/** Моноширинная метка раздела: 12 px, трекинг .06em, прописные. */
export function Mono({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 12,
        lineHeight: 1.4,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        color: 'var(--pd-ink-muted)',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  style,
  as: Tag = 'section',
}: {
  children: ReactNode;
  style?: CSSProperties;
  as?: 'section' | 'article' | 'div' | 'li';
}) {
  return (
    <Tag
      className="cab-card"
      style={{
        background: 'var(--pd-ink-inverse)',
        border: '1px solid var(--pd-border)',
        borderRadius: RADIUS.card,
        boxShadow: SHADOW.level1,
        padding: '20px 22px',
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

export function Heading({
  children,
  level = 2,
  style,
}: {
  children: ReactNode;
  level?: 1 | 2 | 3;
  style?: CSSProperties;
}) {
  const sizes = { 1: 'clamp(28px,2.8vw,40px)', 2: 21, 3: 17 } as const;
  const Tag = (`h${level}` as unknown) as 'h1';
  return (
    <Tag
      style={{
        fontFamily: SERIF,
        fontWeight: 500,
        fontSize: sizes[level],
        lineHeight: 1.24,
        letterSpacing: level === 1 ? '-.015em' : '-.012em',
        color: 'var(--pd-ink)',
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

export function Text({
  children,
  muted = false,
  size = 15,
  style,
}: {
  children: ReactNode;
  muted?: boolean;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <p
      style={{
        margin: 0,
        fontFamily: SANS,
        fontSize: size,
        lineHeight: 1.6,
        color: muted ? 'var(--pd-ink-muted)' : 'var(--pd-ink-secondary)',
        ...style,
      }}
    >
      {children}
    </p>
  );
}

export type ChipTone = 'neutral' | 'accent' | 'ok' | 'warn';

const CHIP_TONES: Record<ChipTone, CSSProperties> = {
  neutral: {
    background: 'var(--pd-surface-quiet)',
    color: 'var(--pd-ink-muted)',
    border: '1px solid var(--pd-border)',
  },
  accent: {
    background: 'var(--pd-accent-tint)',
    color: 'var(--pd-accent)',
    border: '1px solid var(--pd-accent-edge)',
  },
  ok: {
    background: 'var(--pd-ok-bg)',
    color: 'var(--pd-ok-ink)',
    border: '1px solid var(--pd-ok-border)',
  },
  warn: {
    background: 'var(--pd-err-bg)',
    color: 'var(--pd-err-ink)',
    border: '1px solid var(--pd-err-border)',
  },
};

export function Chip({
  children,
  tone = 'neutral',
  mono = false,
}: {
  children: ReactNode;
  tone?: ChipTone;
  mono?: boolean;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: RADIUS.pill,
        fontFamily: mono ? MONO : SANS,
        fontSize: mono ? 12 : 13,
        fontWeight: mono ? 400 : 500,
        letterSpacing: mono ? '.06em' : undefined,
        lineHeight: 1.4,
        ...CHIP_TONES[tone],
      }}
    >
      {children}
    </span>
  );
}

/** Цель нажатия не меньше 44 px — правило дизайн-системы сайта. */
const BUTTON_BASE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  minHeight: 44,
  padding: '0 20px',
  borderRadius: RADIUS.pill,
  fontFamily: SANS,
  fontSize: 15,
  fontWeight: 500,
  lineHeight: 1.4,
  cursor: 'pointer',
  border: '1px solid transparent',
};

export const BUTTON_PRIMARY: CSSProperties = {
  ...BUTTON_BASE,
  background: 'var(--pd-accent)',
  color: 'var(--pd-ink-inverse)',
};

export const BUTTON_QUIET: CSSProperties = {
  ...BUTTON_BASE,
  background: 'var(--pd-ink-inverse)',
  color: 'var(--pd-ink-secondary)',
  borderColor: 'var(--pd-edge-neutral)',
};

export function Button({
  children,
  tone = 'primary',
  type = 'submit',
  name,
  value,
  style,
}: {
  children: ReactNode;
  tone?: 'primary' | 'quiet';
  type?: 'submit' | 'button';
  name?: string;
  value?: string;
  style?: CSSProperties;
}) {
  return (
    <button
      type={type}
      name={name}
      value={value}
      className={`cab-btn ${tone === 'primary' ? 'cab-btn-primary' : 'cab-btn-quiet'}`}
      style={{ ...(tone === 'primary' ? BUTTON_PRIMARY : BUTTON_QUIET), ...style }}
    >
      {children}
    </button>
  );
}

/** Поле ввода. Кегль не меньше 16 px: иначе Safari на телефоне масштабирует. */
export function Field({
  label,
  name,
  type = 'text',
  required = false,
  placeholder,
  defaultValue,
  hint,
  multiline = false,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  hint?: string;
  multiline?: boolean;
}) {
  const control: CSSProperties = {
    boxSizing: 'border-box',
    width: '100%',
    minHeight: 44,
    padding: '12px 14px',
    borderRadius: RADIUS.field,
    border: '1px solid var(--pd-edge-neutral)',
    background: 'var(--pd-ink-inverse)',
    color: 'var(--pd-ink)',
    fontFamily: SANS,
    fontSize: 16,
    lineHeight: 1.5,
  };
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 500, color: 'var(--pd-ink)' }}>
        {label}
      </span>
      {multiline ? (
        <textarea
          name={name}
          required={required}
          placeholder={placeholder}
          defaultValue={defaultValue}
          rows={4}
          style={{ ...control, resize: 'vertical' }}
        />
      ) : (
        <input
          name={name}
          type={type}
          required={required}
          placeholder={placeholder}
          defaultValue={defaultValue}
          style={control}
        />
      )}
      {hint === undefined ? null : (
        <span style={{ fontFamily: SANS, fontSize: 13, color: 'var(--pd-ink-muted)' }}>{hint}</span>
      )}
    </label>
  );
}

export function Notice({
  children,
  tone = 'ok',
  role = 'status',
}: {
  children: ReactNode;
  tone?: 'ok' | 'error';
  role?: 'status' | 'alert';
}) {
  const ok = tone === 'ok';
  return (
    <div
      role={role}
      style={{
        padding: '14px 16px',
        borderRadius: RADIUS.field,
        background: ok ? 'var(--pd-ok-bg)' : 'var(--pd-err-bg)',
        border: `1px solid ${ok ? 'var(--pd-ok-border)' : 'var(--pd-err-border)'}`,
        color: ok ? 'var(--pd-ok-ink)' : 'var(--pd-err-ink)',
        fontFamily: SANS,
        fontSize: 15,
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  );
}

/** Пустое состояние. Отдельный вид: пустой список без объяснения читается как сбой. */
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card style={{ textAlign: 'center', padding: '40px 24px' }}>
      <Heading level={3} style={{ marginBottom: 8 }}>
        {title}
      </Heading>
      {children === undefined ? null : <Text muted>{children}</Text>}
    </Card>
  );
}

/** Согласование числительного: «1 этап», «2 этапа», «5 этапов». */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = count % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export const STAGE_STATE_LABEL = {
  NOT_STARTED: 'Не начат',
  IN_PROGRESS: 'В работе',
  AWAITING_CLIENT: 'Ждём ваших данных',
  IN_APPROVAL: 'На согласовании',
  DONE: 'Завершён',
} as const;

export type StageStateKey = keyof typeof STAGE_STATE_LABEL;

/** Цвет полосы этапа. Различие состояний — цветом и подписью, не прозрачностью. */
const STAGE_BAR: Record<StageStateKey, string> = {
  NOT_STARTED: 'var(--pd-border)',
  IN_PROGRESS: 'var(--pd-accent)',
  AWAITING_CLIENT: 'var(--pd-err-ink)',
  IN_APPROVAL: 'var(--pd-accent-soft)',
  DONE: 'var(--pd-ok-ink)',
};

export interface StepItem {
  readonly id: string;
  readonly title: string;
  readonly state: StageStateKey;
  readonly dueOn?: string | null;
  readonly href?: string;
}

/** Трекер этапов. Композиция взята из согласованного прототипа кабинета. */
export function Stepper({ items }: { items: readonly StepItem[] }) {
  if (items.length === 0) {
    return <Text muted>Этапы ещё не заведены — менеджер добавит их после согласования плана.</Text>;
  }
  return (
    <ol
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(items.length, 6)}, minmax(140px, 1fr))`,
        gap: 12,
        margin: 0,
        padding: 0,
        listStyle: 'none',
        overflowX: 'auto',
      }}
    >
      {items.map((item) => (
        <li key={item.id} style={{ minWidth: 140 }}>
          <div
            style={{
              height: 4,
              borderRadius: 4,
              background: STAGE_BAR[item.state],
              marginBottom: 10,
            }}
          />
          <span
            style={{
              display: 'block',
              fontFamily: SANS,
              fontSize: 14,
              fontWeight: 500,
              lineHeight: 1.4,
              color: 'var(--pd-ink)',
            }}
          >
            {item.href === undefined ? item.title : <a href={item.href}>{item.title}</a>}
          </span>
          <span
            style={{
              display: 'block',
              marginTop: 4,
              fontFamily: SANS,
              fontSize: 13,
              color: 'var(--pd-ink-muted)',
            }}
          >
            {STAGE_STATE_LABEL[item.state]}
            {item.dueOn ? ` · срок ${item.dueOn}` : ''}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Дата в виде «14 апреля 2026». Единый вид на всех экранах кабинета. */
const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

export function formatDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return `${value.getUTCDate()} ${MONTHS[value.getUTCMonth()]} ${value.getUTCFullYear()}`;
}

/** Размер файла. Точность до десятых достаточна и не создаёт ложной строгости. */
export function formatSize(bytes: bigint | number): string {
  const value = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} КБ`;
  return `${(value / 1024 / 1024).toFixed(1)} МБ`;
}

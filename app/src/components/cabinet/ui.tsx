import type { CSSProperties, ReactNode } from 'react';

import { BUTTON_PRIMARY, BUTTON_QUIET, MONO, RADIUS, SANS, SERIF, SHADOW } from './tokens.ts';

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
  link = false,
}: {
  children: ReactNode;
  style?: CSSProperties;
  as?: 'section' | 'article' | 'div' | 'li';
  /** Карточка целиком ведёт куда-то: подсвечивается при наведении и фокусе. */
  link?: boolean;
}) {
  return (
    <Tag
      className={link ? 'cab-card cab-link-card' : 'cab-card'}
      style={{
        background: 'var(--pd-ink-inverse)',
        border: '1px solid var(--pd-border)',
        borderRadius: RADIUS.card,
        boxShadow: SHADOW.level2,
        padding: '18px 20px 20px',
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

/**
 * Заголовок раздела.
 *
 * `level` — это уровень в разметке, по которому читалка строит навигацию,
 * а `size` — ступень кегля. Обычно они совпадают, но не всегда: заголовок
 * карточки внутри раздела должен набираться мелко и при этом не пропускать
 * уровень. Пропуск (h1 сразу к h3) для читалки выглядит как потерянный
 * раздел, поэтому уровень и кегль разведены.
 */
export function Heading({
  children,
  level = 2,
  size,
  style,
}: {
  children: ReactNode;
  level?: 1 | 2 | 3;
  size?: 1 | 2 | 3;
  style?: CSSProperties;
}) {
  // Кегли и начертания — из таблицы дизайн-системы, раздел 3.2. Заголовок
  // раздела равен 22 px на всех страницах сайта (решение Р-99), и кабинет
  // не исключение; третья ступень набирается плотнее и жирнее — 600 при 1.4.
  const sizes = { 1: 'clamp(28px,2.8vw,40px)', 2: 22, 3: 17 } as const;
  const step = size ?? level;
  const Tag = (`h${level}` as unknown) as 'h1';
  return (
    <Tag
      style={{
        fontFamily: SERIF,
        fontWeight: step === 3 ? 600 : 500,
        fontSize: sizes[step],
        lineHeight: step === 3 ? 1.4 : 1.24,
        letterSpacing: step === 1 ? '-.015em' : '-.012em',
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
        // Плотный текст интерфейса набирается плотнее: 1.6 в системе
        // закреплён за сплошным текстом от 15 px, мелкому он не положен.
        lineHeight: size >= 15 ? 1.6 : 1.5,
        color: muted ? 'var(--pd-ink-muted)' : 'var(--pd-ink-secondary)',
        ...style,
      }}
    >
      {children}
    </p>
  );
}

export type ChipTone = 'neutral' | 'accent';

/**
 * Тона чипа. Их два, и оба — из шкалы сайта.
 *
 * Зелёный и красный из чипов убраны решением Р-146: дизайн-система держит
 * эту пару за исходом действия (блок подтверждения и блок ошибки), а в
 * кабинете она разошлась по срокам, статусам и подписям — экран от этого
 * пестрел, а настоящая ошибка переставала выделяться. Состояние называется
 * словом; заливка его не дублирует.
 */
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
        padding: '8px 14px',
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

/**
 * Кнопка вынесена в отдельный модуль: она единственная работает на стороне
 * браузера, потому что гасит себя на время отправки. Реэкспорт оставлен,
 * чтобы экраны по-прежнему брали всё оформление из одного места.
 */
export { Button } from './Button.tsx';
export { BUTTON_PRIMARY, BUTTON_QUIET };

/** Поле ввода. Кегль не меньше 16 px: иначе Safari на телефоне масштабирует. */
/**
 * Подпись, убранная с глаз, но оставшаяся в дереве.
 *
 * В строке таблицы видимая подпись у поля лишняя — её роль исполняет
 * заголовок столбца. Убирать подпись вовсе нельзя: читалка назовёт поле
 * «правка», а голосовое управление не найдёт его по имени. Поэтому подпись
 * остаётся той же, только не занимает места.
 */
const VISUALLY_HIDDEN: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

const LABEL: CSSProperties = {
  fontFamily: SANS,
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--pd-ink)',
};

/**
 * Идентификатор поля.
 *
 * Пока он складывался из одного имени, форма, повторённая в перечне,
 * давала столько одинаковых идентификаторов, сколько строк: подпись вела
 * к первому полю, и читалка называла не то, что человек правит. Область
 * (`scope`) — то, что уже уникально: строка перечня. Имена полей внутри
 * формы различны по определению, поэтому пара «область и имя» не
 * сталкивается.
 */
function fieldId(name: string, scope?: string): string {
  return scope === undefined ? name : `${scope}-${name}`;
}

export function Field({
  label,
  name,
  type = 'text',
  required = false,
  placeholder,
  defaultValue,
  hint,
  multiline = false,
  scope,
  labelHidden = false,
  minWidth,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  hint?: string;
  multiline?: boolean;
  /** Строка перечня, в которой стоит поле: от неё зависит идентификатор. */
  scope?: string;
  /** Подпись остаётся в дереве, но не занимает места: поле в строке таблицы. */
  labelHidden?: boolean;
  /** Единственный размер, зависящий от места: ширина поля в ряду. */
  minWidth?: number;
}) {
  const control: CSSProperties = {
    boxSizing: 'border-box',
    width: '100%',
    minHeight: 48,
    padding: '12px 14px',
    borderRadius: RADIUS.field,
    border: '1px solid var(--pd-edge-neutral)',
    background: 'var(--pd-ink-inverse)',
    color: 'var(--pd-ink)',
    fontFamily: SANS,
    fontSize: 16,
    lineHeight: 1.5,
  };
  // Подсказка лежит вне подписи и связывается с полем отдельно. Пока она
  // стояла внутри `<label>`, доступным именем поля становилась склейка:
  // «Электронная почта Тот адрес, который вы указывали при обращении.»
  const id = fieldId(name, scope);
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const shared = { name, required, placeholder, defaultValue, 'aria-describedby': hintId };
  const box = minWidth === undefined ? control : { ...control, minWidth };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label htmlFor={id} style={labelHidden ? VISUALLY_HIDDEN : LABEL}>
        {label}
      </label>
      {multiline ? (
        <textarea id={id} {...shared} rows={4} style={{ ...box, resize: 'vertical' }} />
      ) : (
        <input id={id} type={type} {...shared} style={box} />
      )}
      {hint === undefined ? null : (
        <span id={hintId} style={{ fontFamily: SANS, fontSize: 13, color: 'var(--pd-ink-muted)' }}>
          {hint}
        </span>
      )}
    </div>
  );
}

/**
 * Как назвать автора файла или замечания на экране клиента.
 *
 * Клиент видит практику как куратора: состав привлечённых специалистов ему
 * не показывается (решение Р-140). Имя эксперта, подписанное под версией
 * материала, обходило это правило с другой стороны — через авторство.
 * Себя клиент видит по имени, куратора тоже: с ним он переписывается.
 */
export function authorName(
  author: { fullName: string; role: string },
  viewer: { id?: string; role: string },
  authorId?: string,
): string {
  if (authorId !== undefined && authorId === viewer.id) return 'Вы';
  if (viewer.role === 'CLIENT' && author.role === 'EXPERT') return 'Специалист практики';
  return author.fullName;
}

/**
 * Строй формы — один на кабинет.
 *
 * Формы писались по мере появления экранов, и разнобой копился: расстояние
 * между полями 8, 12, 16 или 20 px; сетка полей то `minmax(180px,1fr)`, то
 * `minmax(200px,1fr)`; кнопка то прижата к полям, то отбита. На соседних
 * карточках это читается как небрежность, а в двух колонках — как перекос
 * (решение Р-152).
 *
 * `Form` — колонка полей с единым шагом; `FormRow` — ряд полей, который
 * сам переносится на узком экране; `FormActions` — блок действий, прижатый
 * к низу, чтобы кнопки соседних форм стояли на одной линии.
 */
const FORM_GAP = 16;

export function Form({
  action,
  method,
  encType,
  inline = false,
  children,
  style,
}: {
  action?: (form: FormData) => void | Promise<void>;
  /**
   * Форма-фильтр отправляется адресом на свой же маршрут. Со `method` не
   * сочетается серверное действие: одно исключает другое.
   */
  method?: 'get';
  encType?: string;
  /**
   * Форма внутри ячейки таблицы: ряд, а не колонка. Высота не растягивается
   * на всю ячейку — иначе строка таблицы разъезжается.
   */
  inline?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const shape: CSSProperties = inline
    ? { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end' }
    : { display: 'flex', flexDirection: 'column', gap: FORM_GAP, height: '100%' };
  return (
    <form action={action} method={method} encType={encType} style={{ ...shape, ...style }}>
      {children}
    </form>
  );
}

/**
 * Флажок.
 *
 * Подпись оборачивает поле, поэтому идентификатор не нужен вовсе — связь
 * держится разметкой. Цель нажатия считается по подписи: сам квадратик
 * 18×18 меньше нормы, и попасть в него на телефоне трудно.
 */
export function Checkbox({
  label,
  name,
  defaultChecked = false,
  disabled = false,
}: {
  label: ReactNode;
  name: string;
  defaultChecked?: boolean;
  disabled?: boolean;
}) {
  return (
    <label
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        minHeight: 44,
        fontFamily: SANS,
        fontSize: 14,
        color: 'var(--pd-ink)',
      }}
    >
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        style={{ width: 18, height: 18 }}
      />
      <span>{label}</span>
    </label>
  );
}

/**
 * Ссылка, выглядящая кнопкой: выгрузка журнала, привязка Telegram, скачивание
 * версии. Каждое из этих мест набирало вид кнопки заново по полтора десятка
 * строк. Компонент серверный: состояния отправки у перехода нет.
 */
export function ButtonLink({
  href,
  children,
  tone = 'quiet',
  download = false,
}: {
  href: string;
  children: ReactNode;
  tone?: 'primary' | 'quiet';
  download?: boolean;
}) {
  return (
    <a
      href={href}
      download={download ? '' : undefined}
      className={`cab-btn ${tone === 'primary' ? 'cab-btn-primary' : 'cab-btn-quiet'}`}
      style={{
        ...(tone === 'primary' ? BUTTON_PRIMARY : BUTTON_QUIET),
        textDecoration: 'none',
      }}
    >
      {children}
    </a>
  );
}

/**
 * Полоса вкладок раздела. Одна разметка стояла в двух написаниях: у
 * аналитики и у журналов.
 */
export function Tabs({
  label,
  items,
}: {
  label: string;
  items: readonly { href: string; label: string; active: boolean }[];
}) {
  return (
    <nav aria-label={label} style={{ marginBottom: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {items.map((tab) => (
        <a
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? 'page' : undefined}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 44,
            padding: '0 18px',
            borderRadius: RADIUS.pill,
            fontFamily: SANS,
            fontSize: 15,
            fontWeight: 500,
            border: `1px solid ${tab.active ? 'var(--pd-accent)' : 'var(--pd-border)'}`,
            background: tab.active ? 'var(--pd-accent-tint)' : 'var(--pd-ink-inverse)',
            color: tab.active ? 'var(--pd-accent)' : 'var(--pd-ink-secondary)',
          }}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}

/**
 * Поле выбора файла.
 *
 * Своя связка подписи и `input[type=file]` стояла на трёх экранах в трёх
 * написаниях: где-то подпись сеткой с отступом 8, где-то строкой без него.
 * Вид кнопки выбора задан общими стилями кабинета, здесь — только подпись
 * и связь с полем.
 */
export function FileField({
  label,
  name,
  required = false,
  hint,
  accept,
  scope,
  labelHidden = false,
}: {
  label: string;
  name: string;
  required?: boolean;
  hint?: string;
  /** Какие расширения предлагать в окне выбора: книга заказов — только `.xlsx`. */
  accept?: string;
  scope?: string;
  labelHidden?: boolean;
}) {
  const id = fieldId(name, scope);
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label htmlFor={id} style={labelHidden ? VISUALLY_HIDDEN : LABEL}>
        {label}
      </label>
      <input
        id={id}
        type="file"
        name={name}
        accept={accept}
        required={required}
        aria-describedby={hintId}
      />
      {hint === undefined ? null : (
        <span id={hintId} style={{ fontFamily: SANS, fontSize: 13, color: 'var(--pd-ink-muted)' }}>
          {hint}
        </span>
      )}
    </div>
  );
}

export function FormRow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: FORM_GAP,
        alignItems: 'end',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function FormActions({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        marginTop: 'auto',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        flexWrap: 'wrap',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Лента переписки одного канала.
 *
 * Разметка сообщений была написана на экране переписки и понадобилась
 * второй раз — коротким блоком на карточке работы. Второго написания не
 * заводится: оба места берут эту ленту, а различаются числом показанных
 * сообщений и тем, показывается ли пометка о передаче контактов.
 */
export interface ThreadMessage {
  readonly id: string;
  readonly body: string;
  readonly createdAt: Date;
  readonly containsContactHint: boolean;
  readonly author: { id: string; fullName: string; role: string };
}

/** Кем подписано сообщение: роль словом, а не кодом перечисления. */
const ROLE_LABEL: Record<string, string> = {
  CLIENT: 'клиент',
  EXPERT: 'эксперт',
  MANAGER: 'куратор',
  HEAD: 'руководитель',
};

export function Thread({
  messages,
  viewer,
  flagContacts = false,
  empty = 'Сообщений пока нет.',
}: {
  messages: readonly ThreadMessage[];
  viewer: { id: string; role: string };
  flagContacts?: boolean;
  empty?: string;
}) {
  if (messages.length === 0) return <Text muted>{empty}</Text>;

  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 18 }}>
      {messages.map((message) => {
        const mine = message.author.id === viewer.id;
        return (
          <li
            key={message.id}
            style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}
          >
            <div style={{ maxWidth: '78%' }}>
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 14,
                  background: mine ? 'var(--pd-accent-tint)' : 'var(--pd-surface-quiet)',
                  border: `1px solid ${mine ? 'var(--pd-accent-edge)' : 'var(--pd-border)'}`,
                  fontFamily: SANS,
                  fontSize: 15,
                  lineHeight: 1.6,
                  color: 'var(--pd-ink)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {message.body}
              </div>
              <div
                style={{
                  marginTop: 6,
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  justifyContent: mine ? 'flex-end' : 'flex-start',
                  flexWrap: 'wrap',
                }}
              >
                <Text muted size={13}>
                  {authorName(message.author, viewer, message.author.id)} ·{' '}
                  {ROLE_LABEL[message.author.role] ?? message.author.role} ·{' '}
                  {formatDate(message.createdAt)}
                </Text>
                {flagContacts && message.containsContactHint ? (
                  <Chip>похоже на передачу контактов</Chip>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Ячейки таблицы — один набор на кабинет.
 *
 * Объект с этими же значениями был скопирован в девять экранов и уже
 * разошёлся: где-то `10px 14px`, где-то `10px 12px`. Таблицы кабинета
 * из-за этого свёрстаны с разной плотностью.
 */
export const TABLE_CELL: CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--pd-divider)',
  fontFamily: SANS,
  fontSize: 14,
  lineHeight: 1.5,
  color: 'var(--pd-ink-secondary)',
  textAlign: 'left',
  verticalAlign: 'top',
  // Цифры в таблице стоят по разряду даже в смешанной ячейке вида
  // «3 · 1 в работе»: пропорциональные знаки прыгают от строки к строке,
  // и столбец читается лесенкой (решение Р-165). На буквы не влияет.
  fontVariantNumeric: 'tabular-nums',
};

/** Колонка чисел: выравнивание по разряду и моноширинные цифры. */
export const TABLE_NUM: CSSProperties = {
  ...TABLE_CELL,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
};

export const TABLE_HEAD: CSSProperties = {
  ...TABLE_CELL,
  fontWeight: 500,
  color: 'var(--pd-ink)',
  background: 'var(--pd-surface-quiet)',
  whiteSpace: 'nowrap',
};

/**
 * Выпадающий список с подписью.
 *
 * Инлайновых `<select>` в кабинете набралось десять, и часть из них шла
 * без `fontSize`: Safari на телефоне увеличивает вьюпорт, когда поле
 * мельче 16 px, — ровно тот отказ, который запрещает решение Р-86.
 */
export function Select({
  label,
  name,
  defaultValue,
  required = false,
  hint,
  scope,
  labelHidden = false,
  minWidth,
  children,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  hint?: string;
  scope?: string;
  labelHidden?: boolean;
  minWidth?: number;
  children: ReactNode;
}) {
  const id = fieldId(name, scope);
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label htmlFor={id} style={labelHidden ? VISUALLY_HIDDEN : LABEL}>
        {label}
      </label>
      <select
        id={id}
        name={name}
        required={required}
        defaultValue={defaultValue}
        aria-describedby={hintId}
        style={{
          boxSizing: 'border-box',
          width: '100%',
          minHeight: 48,
          minWidth,
          padding: '12px 14px',
          borderRadius: RADIUS.field,
          border: '1px solid var(--pd-edge-neutral)',
          background: 'var(--pd-ink-inverse)',
          color: 'var(--pd-ink)',
          fontFamily: SANS,
          fontSize: 16,
          lineHeight: 1.5,
        }}
      >
        {children}
      </select>
      {hint === undefined ? null : (
        <span id={hintId} style={{ fontFamily: SANS, fontSize: 13, color: 'var(--pd-ink-muted)' }}>
          {hint}
        </span>
      )}
    </div>
  );
}

/**
 * Блок исхода действия.
 *
 * Зелёный и красный дизайн-система держит за исходом: получилось или не
 * получилось. Состояние работы — не исход, поэтому причина остановки этапа
 * и предупреждения витрин выводятся спокойным тоном (решение Р-146).
 */
export function Notice({
  children,
  tone = 'ok',
  role = 'status',
}: {
  children: ReactNode;
  tone?: 'ok' | 'error' | 'quiet';
  role?: 'status' | 'alert';
}) {
  const paint =
    tone === 'ok'
      ? { background: 'var(--pd-ok-bg)', border: 'var(--pd-ok-border)', color: 'var(--pd-ok-ink)' }
      : tone === 'error'
        ? {
            background: 'var(--pd-err-bg)',
            border: 'var(--pd-err-border)',
            color: 'var(--pd-err-ink)',
          }
        : {
            background: 'var(--pd-surface-quiet)',
            border: 'var(--pd-border)',
            color: 'var(--pd-ink-secondary)',
          };
  return (
    <div
      role={role}
      style={{
        padding: '14px 16px',
        borderRadius: RADIUS.field,
        background: paint.background,
        border: `1px solid ${paint.border}`,
        color: paint.color,
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
/**
 * Плитка величины: подпись, число, пояснение расчёта.
 *
 * Жила в `manage/analytics/shared.tsx` и понадобилась сводке руководителя.
 * Держать две одинаковые плитки в разных файлах — верный способ получить
 * два разных кегля числа через месяц.
 */
export function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card>
      <Mono>{label}</Mono>
      <Text
        size={22}
        style={{ marginTop: 8, color: 'var(--pd-ink)', fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </Text>
      {note === undefined ? null : (
        <Text muted size={13} style={{ marginTop: 6 }}>
          {note}
        </Text>
      )}
    </Card>
  );
}

export function Tiles({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: 16,
        marginBottom: 28,
      }}
    >
      {children}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card style={{ textAlign: 'center', padding: '40px 24px' }}>
      <Heading level={2} size={3} style={{ marginBottom: 8 }}>
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

/**
 * Отметка этапа. Цвет несёт одно различие — начат этап или нет; само
 * состояние стоит рядом словом. Светофор из красного, зелёного и двух
 * синих снят решением Р-146: пять цветов на одной полосе читались как
 * пестрота, а не как порядок работ.
 */
const STAGE_MARK: Record<StageStateKey, string> = {
  NOT_STARTED: 'var(--pd-edge-neutral)',
  IN_PROGRESS: 'var(--pd-accent)',
  AWAITING_CLIENT: 'var(--pd-accent)',
  IN_APPROVAL: 'var(--pd-accent)',
  DONE: 'var(--pd-accent-deep)',
};

export interface StepItem {
  readonly id: string;
  readonly title: string;
  readonly state: StageStateKey;
  readonly dueOn?: string | null;
  readonly href?: string;
}

/**
 * Ход работы в перечне: сколько этапов позади и что происходит сейчас.
 *
 * В карточке перечня нужен ответ, а не трекер: раньше здесь стояла полоса
 * на шесть колонок, из которой состояние читалось цветом и только на
 * широком экране.
 */
export function Progress({
  done,
  total,
  current,
}: {
  done: number;
  total: number;
  current: { title: string; state: StageStateKey } | null;
}) {
  const share = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <span
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'baseline',
          fontFamily: SANS,
          fontSize: 15,
          lineHeight: 1.5,
          color: 'var(--pd-ink)',
        }}
      >
        {current === null ? (
          total === 0 ? (
            <span>План работы ещё составляется</span>
          ) : (
            <span>Все этапы завершены</span>
          )
        ) : (
          <>
            <strong style={{ fontWeight: 600 }}>{STAGE_STATE_LABEL[current.state]}</strong>
            <span style={{ color: 'var(--pd-ink-secondary)' }}>{current.title}</span>
          </>
        )}
        {/* Доля названа числом: полоса показывает её вид, а прочитать
            выполнение заказа человек должен, не измеряя глазом. */}
        {total === 0 ? null : (
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: MONO,
              fontSize: 13,
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--pd-ink-secondary)',
            }}
          >
            {share} %
          </span>
        )}
      </span>
      {/* Пока этапов нет, полоса рисовала пустую рамку: заполнять её нечем,
          а смысла в ней столько же, сколько в пустом месте. */}
      {total === 0 ? null : (
        <span
          aria-hidden="true"
          style={{
            display: 'block',
            height: 6,
            borderRadius: RADIUS.mark,
            background: 'var(--pd-divider)',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              display: 'block',
              width: `${share}%`,
              height: '100%',
              background: 'var(--pd-accent)',
            }}
          />
        </span>
      )}
      {/* Пока этапов нет, строка выше уже сказала это словами; вторая
          формулировка того же ничего не добавляла. */}
      {total === 0 ? null : (
        <span style={{ fontFamily: SANS, fontSize: 13, lineHeight: 1.5, color: 'var(--pd-ink-muted)' }}>
          {done} из {total} {plural(total, 'этапа', 'этапов', 'этапов')} завершено
        </span>
      )}
    </div>
  );
}

/**
 * Состояние работы одной строкой.
 *
 * Первое, что должен увидеть клиент: где работа сейчас и что требуется от
 * него. Раньше ответ собирался из трёх мест экрана — полосы этапов, ленты
 * событий и блока «кто ведёт проект», — и на телефоне не собирался вовсе.
 */
export function StatusLine({
  state,
  title,
  dueOn,
  action,
}: {
  state: StageStateKey | null;
  title: string | null;
  dueOn?: string | null;
  action?: string | null;
}) {
  const waiting = state === 'AWAITING_CLIENT' || state === 'IN_APPROVAL';
  return (
    <div
      style={{
        display: 'grid',
        gap: 6,
        padding: '16px 20px',
        borderRadius: RADIUS.card,
        border: `1px solid ${waiting ? 'var(--pd-accent-edge)' : 'var(--pd-border)'}`,
        background: waiting ? 'var(--pd-accent-tint)' : 'var(--pd-ink-inverse)',
      }}
    >
      <span
        style={{
          fontFamily: SANS,
          fontSize: 17,
          fontWeight: 600,
          lineHeight: 1.4,
          color: 'var(--pd-ink)',
        }}
      >
        {state === null || title === null
          ? 'План работы ещё составляется'
          : `${STAGE_STATE_LABEL[state]}: ${title}`}
      </span>
      <span style={{ fontFamily: SANS, fontSize: 14, lineHeight: 1.5, color: 'var(--pd-ink-secondary)' }}>
        {action ?? 'Сейчас от вас ничего не требуется — работа идёт.'}
        {dueOn ? ` Срок этапа — ${dueOn}.` : ''}
      </span>
    </div>
  );
}

/**
 * Отметка завершённого этапа.
 *
 * Прежде здесь стоял знак ✓ текстом: он тянул начертание из гарнитуры,
 * а правило облика запрещает символы-украшения — знаки в кабинете
 * штриховые, толщина 1.5 (решение Р-165). Смысл несёт слово «Завершён»
 * рядом, поэтому значок скрыт от читалки.
 */
function DoneMark() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export interface RoadmapItem extends StepItem {
  readonly note?: string | null;
  readonly done?: boolean;
}

/**
 * Дорожная карта работы: этапы сверху вниз.
 *
 * Горизонтальная полоса на шесть колонок читалась только на большом экране
 * и передавала состояние почти одним цветом. Вертикальный порядок держит
 * тот же смысл на любой ширине, называет состояние словом и показывает
 * причину остановки там же, где она возникла.
 */
export function Roadmap({ items }: { items: readonly RoadmapItem[] }) {
  if (items.length === 0) {
    return (
      <Text muted>Этапы ещё не заведены — куратор добавит их после согласования плана.</Text>
    );
  }
  return (
    <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 0 }}>
      {items.map((item, index) => (
        <li
          key={item.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '28px minmax(0,1fr)',
            gap: 14,
            paddingBottom: index === items.length - 1 ? 0 : 18,
            borderLeft: index === items.length - 1 ? 'none' : '1px solid var(--pd-divider)',
            marginLeft: 13,
            paddingLeft: 13,
            position: 'relative',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: -14,
              top: 0,
              width: 26,
              height: 26,
              borderRadius: '50%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: item.state === 'DONE' ? 'var(--pd-accent-deep)' : 'var(--pd-ink-inverse)',
              border: `1px solid ${STAGE_MARK[item.state]}`,
              color: item.state === 'DONE' ? 'var(--pd-ink-inverse)' : 'var(--pd-ink-muted)',
              fontFamily: MONO,
              fontSize: 12,
            }}
          >
            {item.state === 'DONE' ? <DoneMark /> : index + 1}
          </span>
          <span style={{ gridColumn: '2' }}>
            <span style={{ display: 'block' }}>
              {item.href === undefined ? (
                <span
                  style={{
                    fontFamily: SANS,
                    fontSize: 16,
                    fontWeight: 500,
                    lineHeight: 1.4,
                    color: 'var(--pd-ink)',
                  }}
                >
                  {item.title}
                </span>
              ) : (
                <a className="cab-mark" href={item.href} style={{ fontSize: 16, fontWeight: 500 }}>
                  {item.title}
                </a>
              )}
            </span>
            <span
              style={{
                display: 'block',
                fontFamily: SANS,
                fontSize: 14,
                lineHeight: 1.5,
                color: 'var(--pd-ink-muted)',
              }}
            >
              {STAGE_STATE_LABEL[item.state]}
              {item.dueOn ? ` · срок ${item.dueOn}` : ''}
            </span>
            {item.note === null || item.note === undefined ? null : (
              <span
                style={{
                  display: 'block',
                  marginTop: 6,
                  padding: '10px 14px',
                  borderRadius: RADIUS.field,
                  background: 'var(--pd-surface-quiet)',
                  border: '1px solid var(--pd-border)',
                  fontFamily: SANS,
                  fontSize: 14,
                  lineHeight: 1.5,
                  color: 'var(--pd-ink-secondary)',
                }}
              >
                {item.note}
              </span>
            )}
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

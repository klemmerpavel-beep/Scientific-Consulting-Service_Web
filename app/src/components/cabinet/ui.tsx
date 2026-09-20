import type { CSSProperties, ReactNode } from 'react';

import { FilePick } from './FilePick.tsx';
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
      className={link ? 'cab-block cab-card cab-link-card' : 'cab-block cab-card'}
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
 * Карточка с таблицей, которая на узком экране прокручивается вбок.
 *
 * Двадцать три места кабинета ставили `overflowX: 'auto'` прямо на
 * карточку. Прокрутка при этом работала мышью и пальцем, но не с
 * клавиатуры: у области прокрутки не было фокуса, и добраться до правых
 * колонок на телефоне было нечем. Машинная проверка доступности назвала
 * это на тринадцати экранах (Р-168).
 *
 * Поэтому прокручивается не карточка, а вложенная область: она получает
 * фокус (`tabIndex`), называется читалке (`role="region"` и `aria-label`)
 * и скругляется по радиусу карточки, чтобы у таблицы не срезались углы.
 * Лишний шаг обхода на широком экране — принятая цена: заранее знать,
 * поместится ли таблица, разметка не может.
 */
export function TableCard({
  label,
  children,
  style,
}: {
  /** Чем таблица занята: читалка называет область, когда в неё попадает фокус. */
  label: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <Card style={{ padding: 0, ...style }}>
      <div
        role="region"
        aria-label={label}
        tabIndex={0}
        style={{ overflowX: 'auto', borderRadius: RADIUS.card }}
      >
        {children}
      </div>
    </Card>
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
 * Подпись поля с пометкой обязательного.
 *
 * Обязательность жила только в атрибуте `required`: браузер ругался при
 * отправке, но до неё обязательное и необязательное поля выглядели
 * одинаково, и человек узнавал о разнице, уже потеряв время. Звёздочка
 * помечает поле на виду, а словом — для читалки (решение Р-172).
 */
function FieldLabel({
  id,
  label,
  required,
  hidden,
}: {
  id: string;
  label: string;
  required: boolean;
  hidden: boolean;
}) {
  return (
    <label htmlFor={id} style={hidden ? VISUALLY_HIDDEN : LABEL}>
      {label}
      {required ? (
        <>
          <span aria-hidden="true" style={{ color: 'var(--pd-accent)' }}> *</span>
          <span style={VISUALLY_HIDDEN}> — обязательное поле</span>
        </>
      ) : null}
    </label>
  );
}

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
  dense = false,
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
  /**
   * Поле в полосе отбора: высота 44 вместо 48, вровень с вкладками и
   * кнопкой. Кегль остаётся 16 — при меньшем Safari на телефоне
   * масштабирует вьюпорт (Р-86), поэтому высота снимается отступом.
   */
  dense?: boolean;
}) {
  const control: CSSProperties = {
    boxSizing: 'border-box',
    width: '100%',
    minHeight: dense ? 44 : 48,
    padding: dense ? '10px 14px' : '12px 14px',
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
      <FieldLabel id={id} label={label} required={required} hidden={labelHidden} />
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
 * Раздел экрана без карточки: заголовок и содержимое прямо на поле.
 *
 * Такие разделы были набраны своей `<section>` на девяти экранах, и
 * правило о пяти блоках их не видело: признак блока ставят общие части,
 * а тут общей части не было вовсе (Р-183).
 */
export function Block({
  children,
  style,
  as: Tag = 'section',
}: {
  children: ReactNode;
  style?: CSSProperties;
  as?: 'section' | 'div' | 'ul';
}) {
  return (
    <Tag className="cab-block" style={style}>
      {children}
    </Tag>
  );
}

/**
 * Узкая колонка содержимого.
 *
 * Четыре экрана — переписка, настройки, новая заявка, разбор заявки —
 * ограничивали ширину своей обёрткой `maxWidth`. Обёртка ничего не
 * значит по смыслу, но правило о пяти блоках видело только её и не
 * добиралось до настоящих блоков внутри (Р-183).
 */
export function Narrow({ width = 780, children }: { width?: number; children: ReactNode }) {
  return (
    <div className="cab-column" style={{ maxWidth: width }}>
      {children}
    </div>
  );
}

/**
 * Шапка экрана, собранная не общей частью.
 *
 * Экран заказа и перечень работ ставят свою шапку — с чипом кода и
 * сроком у первого, с полосой отбора у второго, — и `ScreenHead` им не
 * подходит. Обёртка даёт им тот же признак, что и общей шапке, чтобы
 * правило о пяти блоках не считало их блоками (Р-183).
 */
export function ScreenTop({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="cab-head" style={style}>
      {children}
    </div>
  );
}

/**
 * Полоса отбора: вкладки слева, поиск и кнопки справа.
 *
 * Одно устройство было набрано своей вёрсткой на четырёх экранах —
 * перечень работ, реестры, справочники, деньги, — и копии уже разошлись
 * по отступам. Полоса блоком не считается: она управляет экраном, а не
 * несёт содержимое, и правило о пяти блоках её не считает (Р-183).
 */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div
      className="cab-filter"
      style={{
        display: 'flex',
        gap: 16,
        alignItems: 'flex-end',
        flexWrap: 'wrap',
        marginBottom: 24,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Полоса вкладок раздела. Одна разметка стояла в двух написаниях: у
 * аналитики и у журналов.
 */
export function Tabs({
  label,
  items,
  flush = false,
}: {
  label: string;
  items: readonly { href: string; label: string; active: boolean }[];
  /**
   * Полоса стоит в ряду с другими частями отбора и свой нижний отступ не
   * несёт. Пока отступ стоял всегда, ряд «вкладки — поиск — кнопка»
   * выравнивался по низу вместе с ним, и вкладки оказывались на двадцать
   * пикселей выше поля (решение Р-175).
   */
  flush?: boolean;
}) {
  return (
    <nav
      aria-label={label}
      style={{ marginBottom: flush ? 0 : 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}
    >
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
      <FieldLabel id={id} label={label} required={required} hidden={labelHidden} />
      <FilePick id={id} name={name} accept={accept} required={required} describedBy={hintId} />
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
  dense = false,
}: {
  messages: readonly ThreadMessage[];
  viewer: { id: string; role: string };
  flagContacts?: boolean;
  empty?: string;
  /**
   * Переписка стоит колонкой панели, а не во всю ширину экрана.
   *
   * В колонке около 390 пикселей пузырь шириной 78 % оставляет от строки
   * треть, и сообщение рвётся на пять строк вместо двух. В плотном режиме
   * пузырь занимает ширину целиком; чьё сообщение — по-прежнему видно по
   * заливке и подписи (решение Р-169).
   */
  dense?: boolean;
}) {
  if (messages.length === 0) return <Text muted>{empty}</Text>;

  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: dense ? 14 : 18 }}>
      {messages.map((message) => {
        const mine = message.author.id === viewer.id;
        return (
          <li
            key={message.id}
            style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}
          >
            <div style={{ maxWidth: dense ? '100%' : '78%', width: dense ? '100%' : undefined }}>
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
 * Шапка числового столбца.
 *
 * `{...TABLE_HEAD, textAlign: 'right'}` повторялся на экранах денег,
 * сводки и аналитики — по три-пять раз на таблицу. Числа выравниваются по
 * разряду, и их шапка обязана стоять над ними (решение Р-172).
 */
export const TABLE_NUM_HEAD: CSSProperties = {
  ...TABLE_HEAD,
  textAlign: 'right',
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
      <FieldLabel id={id} label={label} required={required} hidden={labelHidden} />
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

/**
 * Длинная таблица: первые строки на виду, остаток — под свёрткой.
 *
 * Таблицы аналитики шли целиком: двадцать клиентов давали тысячу триста
 * пикселей, а дебиторка была обрезана на сороковой строке молча — плитка
 * выше честно называла полное число работ с остатком, и расхождение никак
 * не объяснялось. Первых десяти строк довольно, чтобы увидеть главное:
 * перечни отсортированы по убыванию величины. Остаток никуда не девается —
 * он раскрывается на месте, без ухода на другой экран (решение Р-176).
 *
 * Строки передаются готовыми: у каждой таблицы свои колонки, и сводить их
 * к общему описанию значило бы завести язык описания таблиц ради четырёх
 * применений.
 */
export function LongTable({
  label,
  columns,
  rows,
  visible = 10,
  minWidth = 720,
  caption,
}: {
  label: string;
  /** Строка заголовков: те же `<th scope="col">`, что и были. */
  columns: ReactNode;
  rows: readonly ReactNode[];
  visible?: number;
  minWidth?: number;
  caption?: ReactNode;
}) {
  const shown = rows.slice(0, visible);
  const rest = rows.slice(visible);
  const style = { width: '100%', borderCollapse: 'collapse' as const, minWidth };

  return (
    <>
      <TableCard label={label}>
        <table style={style}>
          {caption === undefined ? null : caption}
          <thead>{columns}</thead>
          <tbody>{shown}</tbody>
        </table>
      </TableCard>
      {rest.length === 0 ? null : (
        <Disclosure
          title={`Ещё ${rest.length} ${plural(rest.length, 'строка', 'строки', 'строк')}`}
          style={{ marginTop: 12 }}
        >
          <table style={style}>
            <thead>{columns}</thead>
            <tbody>{rest}</tbody>
          </table>
        </Disclosure>
      )}
    </>
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
      {/* Число — главное в плитке, и оно обязано весить больше подписей
          вокруг. Прежде вес не задавался вовсе, и «4 370 000 ₽» при кегле
          22 читалось легче заголовка колонки под ним; интерлиньяж 1,6 на
          однострочном числе добавлял к плитке девять лишних пикселей
          (решение Р-175). */}
      <Text
        size={22}
        style={{
          marginTop: 8,
          color: 'var(--pd-ink)',
          fontWeight: 600,
          lineHeight: 1.24,
          fontVariantNumeric: 'tabular-nums',
        }}
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
      className="cab-block"
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
  // Пока плана нет, полосе нечего показывать, а фраза «План работы ещё
  // составляется» в перечне эксперта повторялась семнадцать раз подряд и
  // занимала больше места, чем сообщала. Состояние работы без плана
  // называет чип в плашке (решение Р-169).
  if (total === 0) return null;
  const share = Math.round((done / total) * 100);
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
          <span>Все этапы завершены</span>
        ) : (
          <>
            <strong style={{ fontWeight: 600 }}>{STAGE_STATE_LABEL[current.state]}</strong>
            <span style={{ color: 'var(--pd-ink-secondary)' }}>{current.title}</span>
          </>
        )}
        {/* Доля названа числом: полоса показывает её вид, а прочитать
            выполнение заказа человек должен, не измеряя глазом. */}
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: MONO,
            fontSize: 13,
            lineHeight: 1.4,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--pd-ink-secondary)',
          }}
        >
          {share} %
        </span>
      </span>
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

/**
 * Шапка рабочего экрана — одной полосой.
 *
 * Четыре экрана — этап, материалы, переписка, оплаты — набирали её каждый
 * по-своему: где-то крошка моноширинной ссылкой, где-то моно-метка, где-то
 * заголовок в сорок пикселей и под ним подпись. Три яруса занимали до ста
 * десяти пикселей и всякий раз выглядели иначе, а экран заказа рядом с
 * ними уложился в семьдесят шесть (решения Р-169, Р-170).
 *
 * Порядок один: откуда пришли, название, чем оно занято, справа срок.
 */
export function ScreenHead({
  backHref,
  backLabel,
  title,
  chips,
  note,
  aside,
}: {
  /** Куда вернуться: код работы для экранов внутри неё. */
  backHref?: string;
  backLabel?: string;
  title: string;
  /** Состояние и прочие пометки рядом с названием. */
  chips?: ReactNode;
  /** Строка под названием: чему принадлежит экран. */
  note?: string | null;
  /** Правый край полосы: срок. */
  aside?: string | null;
}) {
  return (
    // Шапка экрана блоком не считается: она называет страницу, а не
    // несёт содержимое. Класс нужен правилу о пяти блоках, чтобы
    // отличить шапку от блока, собранного мимо общих частей (Р-183).
    <div className="cab-head" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {backHref === undefined ? null : (
          <a
            className="cab-mark"
            href={backHref}
            style={{ fontFamily: MONO, fontSize: 13, lineHeight: 1.4 }}
          >
            {backLabel ?? 'назад'}
          </a>
        )}
        <Heading level={1} size={2}>
          {title}
        </Heading>
        {chips}
        {aside == null ? null : (
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: MONO,
              fontSize: 13,
              lineHeight: 1.4,
              color: 'var(--pd-ink-muted)',
            }}
          >
            {aside}
          </span>
        )}
      </div>
      {note == null ? null : (
        <p
          style={{
            margin: '8px 0 0',
            fontFamily: SANS,
            fontSize: 13,
            lineHeight: 1.5,
            color: 'var(--pd-ink-muted)',
          }}
        >
          {note}
        </p>
      )}
    </div>
  );
}

/**
 * Панель экрана заказа: ряд колонок высотой по остатку окна.
 *
 * Экран заказа собирался лентой во всю ширину 1220 px: готовность, этапы,
 * переписка и реквизиты шли друг под другом, правая половина экрана
 * пустовала, а страница вырастала до двух с лишним экранов — материалов
 * на ней не было вовсе. Заказчик потребовал обратного: всё главное сразу
 * и без прокрутки страницы (решение Р-169).
 *
 * Высота держится цепочкой `flex` от `body` через `main` до тела колонки,
 * и каждому звену нужен `minHeight: 0`: без него потомок колонки-flex не
 * сжимается ниже своего содержимого, и прокрутка уходит на страницу.
 *
 * Ниже 1024 px панель становится обычной лентой — правило в `CABINET_CSS`.
 */
export function Board({
  columns,
  weights,
  children,
}: {
  columns: 2 | 3;
  /**
   * Доли ширины колонок. Пока колонки делились поровну, на сводке
   * руководителя «Заявки» с одной строкой занимали ту же треть, что и
   * перечень работ, и строки в двух других колонках рвались посреди слова:
   * «Подготовка / к предзащите» (решение Р-175). Длина массива обязана
   * совпадать с числом колонок, иначе доли не применяются.
   */
  weights?: readonly number[];
  children: ReactNode;
}) {
  const tracks =
    weights !== undefined && weights.length === columns
      ? weights.map((weight) => `minmax(0,${weight}fr)`).join(' ')
      : `repeat(${columns}, minmax(0,1fr))`;
  return (
    <div
      className="cab-block cab-board"
      style={{
        display: 'grid',
        gridTemplateColumns: tracks,
        gap: 20,
        alignItems: 'stretch',
      }}
    >
      {children}
    </div>
  );
}

/**
 * Колонка панели: несмещаемая шапка, прокручиваемое тело, место под форму.
 *
 * Тело обязано получать фокус и имя — иначе с клавиатуры до нижних записей
 * не добраться; это то же требование, что у широких таблиц (решение Р-168).
 */
export function BoardColumn({
  title,
  href,
  hrefLabel,
  footer,
  anchor = 'start',
  fit = false,
  flow = false,
  children,
}: {
  title: string;
  /** Полный перечень на своём экране: в колонке видно главное. */
  href?: string;
  hrefLabel?: string;
  /** Форма отправки: стоит под телом и с ним не прокручивается. */
  footer?: ReactNode;
  /**
   * `end` открывает колонку на последних записях. Нужно переписке: в
   * ленте, открытой на первом сообщении, свежее оказывается за краем, и
   * человек листает вниз каждый раз. Разворот колонки делает это
   * разметкой, без клиентского кода.
   */
  anchor?: 'start' | 'end';
  /**
   * Колонка занимает столько, сколько нужно содержимому, и прокручивается
   * только когда его больше остатка окна. Без этого колонка с одной
   * строкой («Новых заявок нет») держала белое поле до низа экрана: у
   * менеджера пустовала половина окна (решение Р-175).
   */
  fit?: boolean;
  /**
   * Колонка идёт потоком: внутренней прокрутки нет, тело растёт по
   * содержимому. Нужно сводке, где прокручивается сама страница: там
   * предел в семь десятых окна резал последнюю запись пополам, и
   * счётчик в заголовке обещал больше, чем колонка показывала
   * (решение Р-182). На панели заказа, которая в окно уложена, колонки
   * по-прежнему прокручиваются внутри себя.
   */
  flow?: boolean;
  children: ReactNode;
}) {
  return (
    // Колонка носит `cab-card` ради оформления, но не `cab-block`:
    // панель из трёх колонок читается как одно устройство экрана и
    // считается одним блоком — решение заказчика (Р-183).
    <section
      className="cab-card"
      style={{
        background: 'var(--pd-ink-inverse)',
        border: '1px solid var(--pd-border)',
        borderRadius: RADIUS.card,
        boxShadow: SHADOW.level2,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        ...(fit ? { alignSelf: 'start', maxHeight: '100%' } : {}),
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          padding: '10px 18px',
          borderBottom: '1px solid var(--pd-divider)',
        }}
      >
        <h2
          style={{
            fontFamily: SERIF,
            fontWeight: 500,
            fontSize: 17,
            lineHeight: 1.4,
            letterSpacing: '-.005em',
            color: 'var(--pd-ink)',
          }}
        >
          {title}
        </h2>
        {href === undefined ? null : (
          <a className="cab-mark" href={href} style={{ fontFamily: SANS, fontSize: 14 }}>
            {hrefLabel ?? 'весь список'}
          </a>
        )}
      </div>
      <div
        className="cab-board-body"
        // Область, которая не прокручивается, не нуждается ни в фокусе,
        // ни в имени: то и другое добавило бы лишний шаг обхода.
        {...(flow ? {} : { role: 'region', 'aria-label': title, tabIndex: 0 })}
        style={{
          // Высота ограничена сверху, но не снизу: короткое содержимое
          // видно целиком, длинное прокручивается внутри колонки. Прежде
          // тело тянулось за остатком окна и при окне ниже девятисот
          // пикселей ужималось до тридцати двух — полутора строк
          // (решение Р-180).
          // Тело занимает остаток колонки, но не сжимается ниже двухсот
          // пикселей: при `0 1 auto` пустая колонка оставляла форму
          // висеть посреди белого поля, а её подвал не доходил до низа
          // карточки (решение Р-182). Нижний предел оставлен от Р-180:
          // при окне ниже девятисот тело ужималось до полутора строк.
          flex: fit || flow ? '0 1 auto' : '1 1 auto',
          minHeight: fit ? 0 : 200,
          ...(flow
            ? { maxHeight: 'none', overflowY: 'visible' }
            : { maxHeight: '70vh', overflowY: 'auto' }),
          padding: '16px 18px',
          ...(anchor === 'end' ? { display: 'flex', flexDirection: 'column-reverse' } : {}),
        }}
      >
        {children}
      </div>
      {footer === undefined ? null : (
        <div style={{ padding: '14px 18px', borderTop: '1px solid var(--pd-divider)' }}>
          {footer}
        </div>
      )}
    </section>
  );
}

/**
 * Готовность работы — самый крупный блок экрана заказа.
 *
 * Отвечает на три вопроса сразу: сколько сделано, где работа сейчас и что
 * требуется от человека. Прежде на это отвечали два блока — полоса доли в
 * перечне и строка состояния на карточке, — а срок работы целиком не
 * назывался нигде, кроме чипа в шапке (решение Р-169).
 *
 * Остаток дней до срока здесь не считается намеренно: он менялся бы день
 * ото дня и ломал побайтную воспроизводимость снимков, на которой держится
 * приёмка облика.
 */
export function ProgressPanel({
  done,
  total,
  current,
  stageDueOn,
  projectDueOn,
  action,
  actionHref,
  actionLabel,
  style,
}: {
  done: number;
  total: number;
  current: { title: string; state: StageStateKey } | null;
  stageDueOn?: string | null;
  projectDueOn?: string | null;
  action?: string | null;
  actionHref?: string | null;
  actionLabel?: string;
  style?: CSSProperties;
}) {
  const share = total === 0 ? 0 : Math.round((done / total) * 100);
  // Ожидание человека подсвечивается: это единственное состояние, в котором
  // работа стоит из-за него, и оно не должно теряться среди прочих.
  const waiting = current?.state === 'AWAITING_CLIENT' || current?.state === 'IN_APPROVAL';
  return (
    <section
      className="cab-block"
      style={{
        display: 'grid',
        gap: 12,
        padding: '18px 22px',
        borderRadius: RADIUS.card,
        border: `1px solid ${waiting ? 'var(--pd-accent-edge)' : 'var(--pd-border)'}`,
        background: waiting ? 'var(--pd-accent-tint)' : 'var(--pd-ink-inverse)',
        ...style,
      }}
    >
      <div style={{ display: 'flex', gap: 16, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span
          style={{
            fontFamily: SANS,
            fontSize: 17,
            fontWeight: 600,
            lineHeight: 1.4,
            color: 'var(--pd-ink)',
          }}
        >
          {current === null
            ? total === 0
              ? 'План работы ещё составляется'
              : 'Все этапы завершены'
            : `${STAGE_STATE_LABEL[current.state]}: ${current.title}`}
        </span>
        {/* Доля названа числом: полоса показывает её вид, а прочитать
            выполнение заказа человек должен, не измеряя глазом. */}
        {total === 0 ? null : (
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: MONO,
              fontSize: 13,
              lineHeight: 1.4,
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--pd-ink-secondary)',
            }}
          >
            {share} %
          </span>
        )}
      </div>

      {total === 0 ? null : (
        <span
          aria-hidden="true"
          style={{
            display: 'block',
            height: 10,
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

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <span
          style={{
            fontFamily: SANS,
            fontSize: 15,
            lineHeight: 1.5,
            color: 'var(--pd-ink-secondary)',
          }}
        >
          {action ?? 'Сейчас от вас ничего не требуется — работа идёт.'}
        </span>
        {actionHref == null ? null : (
          <ButtonLink href={actionHref} tone="primary">
            {actionLabel ?? 'Открыть этап'}
          </ButtonLink>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 20,
          flexWrap: 'wrap',
          fontFamily: SANS,
          fontSize: 13,
          lineHeight: 1.5,
          color: 'var(--pd-ink-muted)',
        }}
      >
        {total === 0 ? null : (
          <span>
            {done} из {total} {plural(total, 'этапа', 'этапов', 'этапов')} завершено
          </span>
        )}
        {stageDueOn == null ? null : <span>срок этапа — {stageDueOn}</span>}
        {projectDueOn == null ? null : <span>срок работы — {projectDueOn}</span>}
      </div>
    </section>
  );
}

/**
 * Свёртка: то, что нужно раз в жизни заказа, не занимает места постоянно.
 *
 * Собрана на `<details>`: своего состояния разметке не требуется, а
 * клиентский компонент ради раскрытия утянул бы в браузер весь экран.
 * Нативный маркер снят в `CABINET_CSS`, вместо него штриховой значок —
 * знаки в кабинете не символьные (решение Р-165).
 */
export function Disclosure({
  title,
  children,
  style,
}: {
  title: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  // Раскрытая свёртка не должна выталкивать панель за край окна, поэтому
  // её тело ограничено по высоте и прокручивается внутри — а значит, как
  // и колонка, получает фокус и имя (решения Р-168, Р-169).

  return (
    // Свёртка считается блоком, даже сомкнутая: пять свёрток подряд
    // перегружают экран так же, как пять карточек — решение заказчика
    // (Р-183).
    <details
      className="cab-block"
      style={{
        background: 'var(--pd-ink-inverse)',
        border: '1px solid var(--pd-border)',
        borderRadius: RADIUS.card,
        ...style,
      }}
    >
      <summary
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          minHeight: 44,
          padding: '0 18px',
          fontFamily: SANS,
          fontSize: 14,
          fontWeight: 500,
          lineHeight: 1.5,
          color: 'var(--pd-ink-secondary)',
        }}
      >
        <Caret />
        {title}
      </summary>
      <div
        className="cab-board-body"
        role="region"
        aria-label={title}
        tabIndex={0}
        style={{ maxHeight: 200, overflowY: 'auto', padding: '4px 18px 18px' }}
      >
        {children}
      </div>
    </details>
  );
}

/** Уголок свёртки: поворачивается при раскрытии правилом `CABINET_CSS`. */
/**
 * Значок снятия: тот же штриховой строй, что у отметки завершения.
 *
 * Прежде здесь стоял знак ✕ текстом — символ-украшение, который правило
 * облика запрещает (Р-165). Правило молчало только потому, что наполнение
 * артбордов не заводит исторических написаний и чип в снимок не попадал
 * (решение Р-177). Смысл несёт подпись рядом, поэтому значок скрыт от
 * читалки.
 */
export function DropMark() {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function Caret() {
  return (
    <svg
      className="cab-caret"
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
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export interface MaterialRow {
  id: string;
  title: string;
  stageTitle: string | null;
  versionNumber: number | null;
  size: string | null;
  uploadedAt: string | null;
  comments: number;
  href: string | null;
}

/**
 * Материалы колонкой: название, последняя версия, вес, дата, замечания.
 *
 * Прежде материалов на экране заказа не было вовсе — за ними уходили на
 * отдельный экран. Полный перечень версий остаётся там же: в колонке видно
 * последнюю, а история версий нужна не каждый раз (решение Р-169).
 */
export function MaterialList({
  items,
  empty = 'Материалов пока нет.',
}: {
  items: readonly MaterialRow[];
  empty?: string;
}) {
  if (items.length === 0) return <Text muted>{empty}</Text>;
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 14 }}>
      {items.map((item) => (
        <li key={item.id} style={{ display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            {item.versionNumber === null ? null : (
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 13,
                  lineHeight: 1.4,
                  color: 'var(--pd-ink-muted)',
                }}
              >
                v{item.versionNumber}
              </span>
            )}
            {item.href === null ? (
              <span
                style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.5, color: 'var(--pd-ink)' }}
              >
                {item.title}
              </span>
            ) : (
              <a href={item.href} style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.5 }}>
                {item.title}
              </a>
            )}
          </div>
          <span
            style={{
              fontFamily: SANS,
              fontSize: 13,
              lineHeight: 1.5,
              color: 'var(--pd-ink-muted)',
            }}
          >
            {[
              item.stageTitle,
              item.size,
              item.uploadedAt,
              item.comments === 0
                ? null
                : `${item.comments} ${plural(item.comments, 'замечание', 'замечания', 'замечаний')}`,
            ]
              .filter((part) => part !== null)
              .join(' · ')}
          </span>
        </li>
      ))}
    </ul>
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

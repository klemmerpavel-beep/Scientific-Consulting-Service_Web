/**
 * Оформление кабинета. Значения взяты из дизайн-системы сайта без изменений:
 * тот же блок токенов, что стоит в каждом макете `design/*.dc.html`, те же
 * гарнитуры, радиусы и тени. Кабинет открывается по кнопке с посадочной
 * страницы, и расхождение обликов было бы заметно на первом же переходе.
 *
 * Роли токенов и правила расширения — `docs/DESIGN-SYSTEM.md`. Новый цвет,
 * радиус, кегль или длительность сначала вносится туда с обоснованием и
 * только потом появляется здесь.
 */

import type { CSSProperties } from 'react';

/** Блок токенов, совпадающий с макетами сайта побайтно. */
export const ROOT_TOKENS =
  ':root{--pd-ink:#14161C;--pd-ink-secondary:#3D4450;--pd-ink-muted:#5C6474;' +
  '--pd-ink-inverse:#FFFFFF;--pd-border:#E3E7EC;--pd-divider:#EFF1F4;' +
  '--pd-surface-quiet:#F6F7F9;--pd-edge-neutral:#C4CAD4;--pd-accent:#14417A;' +
  '--pd-accent-press:#0F3260;--pd-accent-deep:#0D2B52;--pd-accent-mark:#D8E4F3;' +
  '--pd-accent-edge:#B4C9E5;--pd-accent-tint:#ECF1F8;--pd-button-hover:#262A33;' +
  '--pd-accent-hover:#0A2145;--pd-accent-active:#081A38;--pd-ok-bg:#E6F9F1;' +
  '--pd-ok-ink:#0E4E3C;--pd-err-bg:#FAE7E5;--pd-err-border:#F0C9C3;' +
  '--pd-err-ink:#8E2C22;--pd-ok-border:#C5EEDD;--pd-accent-soft:#2A63B4;' +
  '--pd-art-line:#E5EBF2;--pd-art-mark:#D3DEEC;--pd-art-dot:#D8DEE6}';

export const SERIF = "'Literata', Georgia, 'Times New Roman', serif";
export const SANS = "'Inter','Helvetica Neue',Arial,sans-serif";
export const MONO = "'JetBrains Mono','SFMono-Regular',monospace";

/** Радиусы. Набор закрыт: 6 — подсветка, 10 — поле, 14 — карточка, 999 — pill. */
export const RADIUS = { mark: 6, field: 10, card: 14, pill: 999 } as const;

export const SHADOW = {
  level1: '0 1px 2px rgba(20,22,28,.05)',
  level2: '0 6px 14px rgba(20,22,28,.06), 0 1px 2px rgba(20,22,28,.05)',
  hover: '0 10px 20px rgba(20,22,28,.09)',
  focus: '0 0 0 3px rgba(20,65,122,.16)',
} as const;

/** Единственная кривая движения в проекте. Длительности 180—260 мс. */
export const EASING = 'cubic-bezier(.2,0,.2,1)';

/**
 * Оформление кнопки.
 *
 * Лежит в токенах, а не в `Button.tsx`: тот помечен `'use client'`, и всё,
 * что из него берут, уезжает в браузер. Кнопке-ссылке и кнопке выхода в
 * каркасе состояние отправки не нужно — им нужен только вид.
 *
 * Цель нажатия не меньше 44 px — правило дизайн-системы сайта.
 */
export const BUTTON_BASE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  minHeight: 44,
  padding: '0 20px',
  borderRadius: RADIUS.pill,
  fontFamily: SANS,
  fontSize: 15,
  fontWeight: 600,
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
  border: '1px solid var(--pd-edge-neutral)',
};

/**
 * Кнопка размером с плашку: снятие написания в справочнике. По виду — чип,
 * по существу — действие, поэтому цель нажатия остаётся полной.
 */
export const BUTTON_CHIP: CSSProperties = {
  ...BUTTON_BASE,
  padding: '0 14px',
  fontSize: 13,
  fontWeight: 500,
  background: 'var(--pd-surface-quiet)',
  color: 'var(--pd-ink-secondary)',
  border: '1px solid var(--pd-border)',
};

/** Ширина рабочей колонки и поля, как на страницах сайта. */
export const CONTAINER = 1220;
export const GUTTER = 30;

/**
 * Общие правила кабинета. Подключаются один раз в разметке раздела:
 * в каждом компоненте свой блок стилей означал бы десятки повторов одного
 * и того же и расхождение при первой же правке.
 */
export const CABINET_CSS = `
${ROOT_TOKENS}
body{margin:0;background:var(--pd-surface-quiet)}
h1,h2,h3{text-wrap:balance;margin:0}
p,li{text-wrap:pretty}
a{color:var(--pd-accent);text-decoration:none}
a:hover{color:var(--pd-accent-press)}
*:focus-visible{outline:2px solid var(--pd-accent);outline-offset:2px}
.pd-skip{position:absolute;left:-9999px;top:0;z-index:9;box-sizing:border-box;min-height:44px;display:flex;align-items:center;background:var(--pd-ink);color:var(--pd-ink-inverse);padding:12px 20px;border-radius:0 0 10px 0;font-size:14px;font-weight:600}
.pd-skip:focus{left:0;color:var(--pd-ink-inverse)}
.cab-nav a{color:var(--pd-ink-secondary)}
.cab-nav a:hover,.cab-nav a:focus-visible{color:var(--pd-accent)}
.cab-nav a[aria-current="page"]{color:var(--pd-accent);box-shadow:inset 0 -2px 0 var(--pd-accent)}
.cab-btn{transition:background 180ms ${EASING},border-color 180ms ${EASING},color 180ms ${EASING},transform 180ms ${EASING}}
.cab-btn:active{transform:scale(.97)}
.cab-btn-primary:hover,.cab-btn-primary:focus-visible{background:var(--pd-accent-hover)}
.cab-btn-primary:active{background:var(--pd-accent-active)}
.cab-btn-quiet:hover,.cab-btn-quiet:focus-visible{border-color:var(--pd-accent);color:var(--pd-accent)}
.cab-card{transition:box-shadow 200ms ${EASING},border-color 200ms ${EASING}}
.cab-link-card:hover,.cab-link-card:focus-within{box-shadow:${SHADOW.hover};border-color:var(--pd-accent-edge)}
.cab-mark{display:inline-flex;align-items:center;min-height:44px}
.cab-wordmark{transition:background 180ms ${EASING}}
.cab-wordmark:hover{background:rgba(216,228,243,.62)}
.cab-wordmark:active{background:rgba(216,228,243,.84)}
input,textarea,select{font-family:${SANS};font-size:16px}
input:focus,textarea:focus,select:focus{box-shadow:${SHADOW.focus};border-color:var(--pd-accent)}
input[type="checkbox"],input[type="radio"]{accent-color:var(--pd-accent)}
input::placeholder,textarea::placeholder{color:var(--pd-ink-muted);opacity:1}
input[type="file"]{font-family:${SANS};font-size:16px;color:var(--pd-ink-secondary)}
input[type="file"]::file-selector-button{min-height:44px;padding:0 18px;margin-right:14px;border-radius:999px;border:1px solid var(--pd-edge-neutral);background:var(--pd-ink-inverse);color:var(--pd-ink-secondary);font-family:${SANS};font-size:15px;cursor:pointer;transition:border-color 180ms ${EASING},color 180ms ${EASING}}
input[type="file"]::file-selector-button:hover{border-color:var(--pd-accent);color:var(--pd-accent)}
button[disabled]{opacity:.7!important;cursor:progress!important}
@keyframes pd-appear{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
[role="status"],[role="alert"]{animation:pd-appear 220ms ${EASING}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
@media (max-width:768px){.cab-two{grid-template-columns:minmax(0,1fr)!important}}
@media (max-width:480px){.cab-pad{padding-left:20px!important;padding-right:20px!important}}
`;

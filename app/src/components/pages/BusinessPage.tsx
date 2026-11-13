// @ts-nocheck — логика перенесена из макета дословно и правится только в макете.
'use client';
// Сгенерировано из BusinessPage.dc.html через tools/dc-to-tsx.mjs.
// Правки вносятся в макет и переносятся заново, а не здесь.
import React from 'react';
import { submitLead } from '../../lib/submit-lead';
import PhotoSlot from '../PhotoSlot';
import { ABOVE_THE_FOLD } from '../photos';

/** Текст благодарности по обработчику формы заявки — из макета (Р-406). */
const LEAD_THANKS: Record<string, string> = {
  "submitTop": "Заявка принята. Ответим в рабочее время, Пн—Пт 10:00—19:00.",
  "submitMain": "Заявка принята. Менеджер ответит в течение рабочего дня и пришлёт NDA."
};

const css = `

/* Токены палитры. Значения здесь, а не в каждом объявлении: страница
   держит около 1700 упоминаний цвета, и смена одного оттенка иначе
   означает правку в сотнях мест. Роли токенов — docs/DESIGN-SYSTEM.md,
   раздел 2. Цвета внутри атрибутов SVG остаются литералами: var() в
   презентационном атрибуте не работает. */
:root{--pd-ink:#14161C;--pd-ink-secondary:#3D4450;--pd-ink-muted:#5C6474;--pd-ink-inverse:#FFFFFF;--pd-border:#E3E7EC;--pd-divider:#EFF1F4;--pd-surface-quiet:#F6F7F9;--pd-edge-neutral:#C4CAD4;--pd-accent:#14417A;--pd-accent-press:#0F3260;--pd-accent-deep:#0D2B52;--pd-accent-mark:#D8E4F3;--pd-accent-edge:#B4C9E5;--pd-accent-tint:#ECF1F8;--pd-button-hover:#262A33;--pd-accent-hover:#0A2145;--pd-accent-active:#081A38;--pd-ok-bg:#E6F9F1;--pd-ok-ink:#0E4E3C;--pd-err-bg:#FAE7E5;--pd-err-border:#F0C9C3;--pd-err-ink:#8E2C22;--pd-ok-border:#C5EEDD;--pd-accent-soft:#2A63B4;--pd-art-line:#E5EBF2;--pd-art-mark:#D3DEEC;--pd-art-dot:#D8DEE6}

.bp-nav{display:flex;align-items:center;gap:4px}
.bp-burger{display:none}
.bp-cta{white-space:nowrap}body{margin:0;background:var(--pd-ink-inverse)}h1,h2,h3{text-wrap:balance}p,li{text-wrap:pretty}a{color:var(--pd-accent);text-decoration:none}a:hover{color:var(--pd-accent-press)}*:focus-visible{outline:2px solid var(--pd-accent);outline-offset:2px}input[type=checkbox]{accent-color:var(--pd-accent)}
.pd-skip{position:absolute;left:-9999px;top:0;z-index:9;box-sizing:border-box;min-height:44px;display:flex;align-items:center;background:var(--pd-ink);color:var(--pd-ink-inverse);padding:12px 20px;border-radius:0 0 10px 0;font-size:13px;font-weight:600}
.pd-skip:focus{left:0;color:var(--pd-ink-inverse)}
.bp-scroll{overflow-x:auto;overscroll-behavior-x:contain;scroll-behavior:smooth}
.bp-hero{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,.92fr)}
.bp-team{display:grid;grid-template-columns:minmax(0,.78fr) minmax(0,1fr)}
/* Полоса натюрморта фиксирована 96 пикселями и не тянется вместе с
   карточкой. Карточки одного ряда равны по высоте, но ряд высотой в
   самый длинный пакет не навязывается: второй ряд шире и короче, и
   равные ряды оставляли в нём до 150 px пустоты, а в одну колонку —
   у каждого короткого пакета. */
/* Условия «Как устроена работа» (Р-802): шесть карточек в две колонки
   (до 768 px — одна). Каждая карточка стоит по своей высоте
   (align-items: start у сетки .bp-mech, логика высоту не задаёт):
   карточка не тянется до соседки по ряду, поэтому между текстом и «Чем
   закреплено» провала нет, а раскрытие строки «Чем закреплено» не
   меняет соседнюю карточку. Карточка — медиаобъект: изображение 96 px
   слева в строках заголовка и текста, номер спокойный справа от
   заголовка (условия не последовательность), подвал «Чем закреплено» на
   всю ширину под изображением. Строка текста — 1fr: при коротком тексте
   она доходит до низа изображения, и подвал стоит сразу под более
   высоким из двух столбцов. На 769—1100 px и до 480 px изображение 64 px
   рядом с заголовком, текст на всю ширину под ними. */
/* Р-834 (замечание владельца 07.11.2026: «все блоки сделать одинакового размера»): от 769 px все шесть карточек в закрытом виде одной высоты — по самой высокой (min-height из переменной --bp-mech-h, её ставит сценарий fitMech после монтирования и при смене ширины окна); подвал «Чем закреплено» — нижняя строка сетки карточки, лишняя высота уходит в строку текста (1fr). Раскрытие «Чем закреплено» растит только свою карточку: сетка по-прежнему align-items: start, соседки остаются общей высоты. До 768 px — одна колонка, высота по содержимому.
   Шлифовка Р-802: карточки стоят по своей высоте (align-items: start) — между текстом и «Чем закреплено» провала нет ни на одной ширине, а раскрытие одной карточки не трогает соседнюю. На 769—1100 px колонка узкая для медиаобъекта 96 px: изображение 64 px рядом с заголовком, текст — на всю ширину карточки под ними, как до 480 px. */
.bp-mech{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start}
.bp-mechcard{display:grid;grid-template-columns:96px minmax(0,1fr);grid-template-rows:auto 1fr auto;grid-template-areas:"img head" "img text" "foot foot";column-gap:20px;row-gap:8px;min-height:var(--bp-mech-h,auto)}
.bp-mechimg{grid-area:img;width:96px;height:96px}
.bp-mechhead{grid-area:head;display:flex;flex-direction:row-reverse;align-items:baseline;justify-content:space-between;gap:16px;min-width:0}
.bp-mechtext{grid-area:text}
.bp-mechfoot{grid-area:foot;margin-top:12px}
.bp-mechplus{position:relative;width:28px;height:28px;flex:0 0 28px;border-radius:50%;background:var(--pd-accent-tint);transition:background 180ms cubic-bezier(.2,0,.2,1)}
.bp-mechbtn:hover .bp-mechplus{background:var(--pd-accent-mark)}
@media (min-width:769px) and (max-width:1100px){.bp-mechcard{grid-template-columns:64px minmax(0,1fr);grid-template-rows:auto 1fr auto;grid-template-areas:"img head" "text text" "foot foot";column-gap:16px;row-gap:12px}.bp-mechimg{width:64px;height:64px}.bp-mechhead{align-self:center}}
@media (max-width:480px){.bp-mechcard{grid-template-columns:64px minmax(0,1fr);grid-template-rows:auto auto auto;grid-template-areas:"img head" "text text" "foot foot";column-gap:16px;row-gap:12px;padding:18px 20px 0!important}.bp-mechimg{width:64px;height:64px}.bp-mechhead{align-self:center}}
.bp-proof{animation:bp-proof 200ms cubic-bezier(.2,0,.2,1) both}
@keyframes bp-proof{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.bp-proof{animation:none}}
.bp-cat{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}

/* «Права и конфиденциальность» (Р-803, раскладка — Р-814 по замечанию владельца З-8): шесть пунктов — шесть плиток одной сеткой ul.bp-rights, 3 колонки от 1200 px, 2 на 769—1199 px, одна до 768 px (общее правило страницы); плитки ряда одной высоты (align-items: stretch), пустого поля под плиткой нет. От 1200 px три колонки одной ширины (Р-863, указание владельца 13.11.2026; до этого первая была шире — 1.3fr, Р-814). У всех плиток одно устройство: сверху значок 22 px на плашке 44 px и номер справа, ниже заголовок 17 px и текст 14 px; поля clamp(20px, 2vw, 28px), радиус 14, тень уровня 2, pd-lift (Р-628). Первая — «Исключительные права» — тёмная --pd-accent-deep (тёмная панель на странице одна, Р-608); пять светлых — белые с рамкой --pd-border. Кольца орбиты Р-803 в плитке сняты: в плитке высотой 184—251 px текст идёт на всю ширину, и кольца заходили под абзац. */
.bp-rights{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:stretch;list-style:none;margin:0;padding:0}
@media (max-width:1199px){.bp-rights{grid-template-columns:repeat(2,minmax(0,1fr))}}
.bp-right{display:flex;flex-direction:column;gap:20px;min-width:0;box-sizing:border-box;border-radius:14px;padding:clamp(20px,2vw,28px);box-shadow:0 6px 14px rgba(20,22,28,.06),0 1px 2px rgba(20,22,28,.05)}
.bp-righthead{display:flex;align-items:center;justify-content:space-between;gap:16px}
.bp-rightbody{display:flex;flex-direction:column;gap:8px;min-width:0}
@media (max-width:480px){.bp-right{padding:20px!important;gap:16px!important}}
.bp-faq{display:grid;grid-template-columns:minmax(0,.86fr) minmax(0,1.14fr)}
.bp-req{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr)}
/* Блок заявки (Р-835): форма и «Что будет после отправки» — две колонки одной высоты по содержимому (ячейки сетки тянутся на высоту ряда), «Что прислать для сметы» — полосой на всю ширину под ними: до 768 px изображение сверху, от 769 px — слева на высоту полосы, от 1025 px четыре пункта в две колонки. */
.bp-reqask{grid-column:1 / -1;display:grid;grid-template-columns:minmax(0,1fr)}
.bp-reqart{height:112px;border-bottom:1px solid var(--pd-divider)}
.bp-reqbody{padding:16px 20px 18px}
@media (min-width:769px){.bp-reqask{grid-template-columns:240px minmax(0,1fr)}.bp-reqart{height:auto;min-height:160px;border-bottom:0;border-right:1px solid var(--pd-divider)}.bp-reqbody{padding:20px 24px}}
@media (min-width:1025px){.bp-asklist{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 28px!important}}
/* Шаги «Что будет после отправки» в колонке у формы (Р-835): от 769 px шкала занимает остаток карточки, лишняя высота делится между промежутками шагов — линия связи тянется до следующего узла, под последним шагом пустоты нет. */
@media (min-width:769px){.bp-reqsteps .pd-track-v{flex:1 1 auto}.bp-reqsteps .pd-track-v>li:not(:last-child){flex:1 1 auto}}
/* Шкала шагов «Что будет после отправки» (Р-800) — один компонент на «Студентам» и «Компаниям». Шаги — последовательность, поэтому с номерами: узлы 28 px на общей линии 2 px --pd-edge-neutral, разделителей под шагами нет. Горизонтальная: узел над текстом, линия от узла к узлу соседней колонки (промежуток колонок 24 px), колонки ряда одной высоты. Вертикальная (.pd-track-v): узел слева, линия вниз к следующему узлу. Последний шаг ряда линии не ведёт. */
.pd-track{list-style:none;margin:0;padding:0;gap:28px 24px}
.pd-track>li{position:relative;min-width:0;display:flex;flex-direction:column;gap:14px}
.pd-track>li::after{content:"";position:absolute;top:13px;left:28px;right:-24px;height:2px;border-radius:999px;background:var(--pd-edge-neutral)}
.pd-track>li:last-child::after{display:none}
.pd-track-v{display:flex;flex-direction:column;gap:0}
.pd-track-v>li{display:grid;grid-template-columns:28px minmax(0,1fr);column-gap:14px;padding-bottom:20px}
.pd-track-v>li:last-child{padding-bottom:0}
.pd-track-v>li::after{top:28px;bottom:0;left:13px;right:auto;width:2px;height:auto}
.pd-track-v .pd-track-body{padding-top:4px}
.bp-support{display:grid;grid-template-columns:minmax(0,1fr)}
@media (max-width:1024px){.bp-pack{grid-column:span 3!important}.bp-orbit{position:static;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;aspect-ratio:auto!important;width:100%}.bp-orbit>.bp-ring,.bp-orbit>.bp-dot,.bp-orbit>.bp-core{display:none!important}.bp-orbit>.bp-crew{position:static!important;left:auto!important;top:auto!important;width:auto!important;height:auto!important;min-width:0!important}.bp-cat{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:768px){.bp-hero,.bp-trl,.bp-req,.bp-rights,.bp-support,.bp-team,.bp-faq,.bp-mech{grid-template-columns:minmax(0,1fr)}.bp-pack{grid-column:span 6!important}}
/* Меню разделов уходит под кнопку ниже 1200 px: с пунктами «Стать экспертом» и «Личный кабинет» строка шире (Р-588). */
@media (max-width:1200px){.bp-nav{position:absolute;right:30px;top:78px;flex-direction:column;align-items:stretch;gap:4px;background:var(--pd-ink-inverse);border:1px solid var(--pd-border);border-radius:14px;padding:10px;box-shadow:0 6px 14px rgba(20,22,28,.06),0 1px 2px rgba(20,22,28,.05);min-width:220px}.bp-nav[hidden]{display:none!important}.bp-burger{display:inline-flex}}
/* Подпись раздела на узком экране — под заголовком слева, а не прижатой вправо строкой (Р-250). */
@media (max-width:768px){.bp-sub{text-align:left!important;margin-left:0!important}}
@media (max-width:430px){.bp-head{gap:12px!important}.bp-logo{font-size:22px!important}.bp-cta{padding:12px 16px!important;font-size:12px!important}}
@media (max-width:480px){.bp-hero,.bp-team,.bp-trl,.bp-cat,.bp-rights,.bp-req,.bp-support{grid-template-columns:minmax(0,1fr)!important}.bp-pad{padding-left:20px!important;padding-right:20px!important}.bp-orbit{grid-template-columns:minmax(0,1fr)}}
/* В каталоге на телефоне миниатюра направления уступает место названию —
   иначе «Интеллектуальная собственность» ложилась на счётчик позиций (Р-250). */
@media (max-width:480px){.bp-catart{display:none!important}}
/* Шкала УГТ (Р-801). Девять уровней — последовательность, поэтому номер
   стоит в узле 28 px на общей линии, как у «Шкалы плана» (Р-796):
   пройденный уровень залит --pd-accent, номер белый; текущий — белый узел
   с кольцом 2 px --pd-accent и подпись на подложке --pd-accent-tint;
   будущие — кольцо --pd-border, номер и подпись --pd-ink-muted. Кнопка
   уровня — вся колонка с узлом и подписью, не ниже 44 px; под курсором
   подпись другого уровня — на --pd-surface-quiet. Линия идёт от центра
   первого узла до центра девятого, пройденный участок растёт
   transform: scaleX за 220 мс. Девять колонок по 106 px вмещают
   «Подтверждение» 12 px, от 1200 px подписи 13 px; уже 1014 px шкала
   прокручивается в своей области, текущий уровень при загрузке встаёт в
   её середину (Р-250: подписи не наезжают друг на друга). */
.bp-trlscroll{margin:0 -4px 16px;padding:0 4px;scroll-snap-type:x proximity}
.bp-trlscale{position:relative;min-width:954px;padding:4px 0 6px}
.bp-trlline{position:absolute;left:calc(100% / 18);right:calc(100% / 18);top:17px;height:2px;border-radius:999px;background:var(--pd-border);overflow:hidden}
.bp-trlfill{position:absolute;inset:0;background:var(--pd-accent);transform-origin:left center;transition:transform 220ms cubic-bezier(.2,0,.2,1)}
.bp-trlstep{appearance:none;border:0;background:transparent;cursor:pointer;margin:0;padding:0 2px;min-width:0;min-height:44px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;border-radius:10px;scroll-snap-align:center;font-family:'Inter','Helvetica Neue',Arial,sans-serif}
.bp-trlstep:focus-visible{outline:2px solid var(--pd-accent);outline-offset:2px}
.bp-trlnode{width:28px;height:28px;flex:0 0 28px;box-sizing:border-box;border:2px solid;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;line-height:1.24;font-weight:600;font-variant-numeric:tabular-nums;transition:background 220ms cubic-bezier(.2,0,.2,1),border-color 220ms cubic-bezier(.2,0,.2,1),color 220ms cubic-bezier(.2,0,.2,1)}
.bp-trlchip{display:block;max-width:100%;box-sizing:border-box;padding:4px;border-radius:10px;font-size:12px;line-height:1.4;font-weight:600;transition:background 180ms cubic-bezier(.2,0,.2,1),color 180ms cubic-bezier(.2,0,.2,1)}
.bp-trlstep:hover .bp-trlchip{background:var(--pd-surface-quiet)}
.bp-trlstep[aria-pressed="true"] .bp-trlchip{background:var(--pd-accent-tint)}
@media (min-width:1200px){.bp-trlchip{font-size:13px;padding:4px 8px}}
/* Карточка уровня (Р-801): шапка — метка, тезис и плашка границы
   ответственности; ниже три колонки с одинаковыми шапками на общей линии,
   «Документы на выходе» — таблицей с нормой по правому краю; подвал —
   «Подходящее предложение» со ссылкой к пакету. Высота карточки на
   широком экране — по самому объёмному уровню: иначе при переключении
   страница под блоком прыгает. Смена содержимого проигрывается
   CSS-анимацией; она перезапускается только при смене имени, поэтому два
   одинаковых по эффекту набора кадров чередуются по чётности уровня. */
.bp-trlhead{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start}
.bp-trl{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr) minmax(0,1fr)}
/* Шлифовка Р-801: колонки карточки уровня — подсетка из двух строк (шапка и содержимое): шапки трёх колонок стоят в одной строке сетки и прижаты к её низу, поэтому линии под шапками и последние строки шапок — на одной базовой линии, даже когда «Что делаем на этом уровне» переносится (769—850 px). */
.bp-trlcol{display:grid;grid-row:span 2;grid-template-rows:subgrid;row-gap:12px;align-content:start;min-width:0}
.bp-trlcolhead{align-self:end}
.bp-trlcolhead{font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.4;letter-spacing:.06em;text-transform:uppercase;color:var(--pd-ink-muted);padding-bottom:10px;border-bottom:1px solid var(--pd-border)}
.bp-trllist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.bp-trllist>li{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.5;color:var(--pd-ink-secondary)}
.bp-trldot{width:4px;height:4px;flex:0 0 4px;margin-top:8px;border-radius:50%;background:var(--pd-accent)}
.bp-trldocs{display:flex;flex-direction:column;gap:10px}
.bp-trldocs>[role=row]{display:grid;grid-template-columns:minmax(0,1fr) fit-content(42%);gap:16px;align-items:baseline;padding-bottom:10px;border-bottom:1px solid var(--pd-divider)}
.bp-trldocs>[role=row]:last-child{padding-bottom:0;border-bottom:0}
.bp-trlfoot{background:var(--pd-surface-quiet);transition:background 180ms cubic-bezier(.2,0,.2,1),opacity 180ms cubic-bezier(.2,0,.2,1)}
.bp-trlfoot:hover{background:var(--pd-accent-tint)}
.bp-trlfoot:active{opacity:.82}
.bp-trlfoot:focus-visible{outline-offset:-4px}
.bp-trlgo{flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;min-height:44px;box-sizing:border-box;padding:0 20px;border:1px solid transparent;border-radius:999px;background:var(--pd-ink-inverse);font-size:14px;line-height:1.4;font-weight:600;color:var(--pd-accent);transition:border-color 180ms cubic-bezier(.2,0,.2,1)}
.bp-trlfoot:hover .bp-trlgo{border-color:var(--pd-accent)}
.bp-trlarrow{width:14px;height:14px;flex:0 0 14px;display:block;background:var(--pd-accent);transition:transform 180ms cubic-bezier(.2,0,.2,1)}
.bp-trlfoot:hover .bp-trlarrow{transform:translateX(3px)}
.bp-trlcard{min-height:438px}
@keyframes bp-trl-a{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes bp-trl-b{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.bp-trlbody-a{animation:bp-trl-a 260ms cubic-bezier(.2,0,.2,1) both}
.bp-trlbody-b{animation:bp-trl-b 260ms cubic-bezier(.2,0,.2,1) both}
@media (max-width:1199px){.bp-trlcard{min-height:478px}}
@media (max-width:1024px){.bp-trlcard{min-height:0}}
@media (max-width:768px){.bp-trlhead,.bp-trl{grid-template-columns:minmax(0,1fr)}}
@media (max-width:480px){.bp-trlhead,.bp-trl,.bp-trlfoot{padding-left:20px!important;padding-right:20px!important}.bp-trlgo{padding:0 16px}}
@media (prefers-reduced-motion:reduce){.bp-trlbody-a,.bp-trlbody-b{animation:none}}


/* Отправка идёт — кнопка это показывает. Инлайновый фон сильнее класса,
   поэтому приглушение объявлено важным. */
button[disabled]{opacity:.7!important;cursor:progress!important}
input::placeholder,textarea::placeholder{color:var(--pd-ink-muted);opacity:1}
/* Подтверждение и ошибка появляются плавно, а не возникают рывком.
   Правило срабатывает при вставке элемента, поэтому блоки, которые уже
   на странице, ничего не переигрывают при обновлении содержимого. */
@keyframes pd-appear{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
[role="status"],[role="alert"]{animation:pd-appear 220ms cubic-bezier(.2,0,.2,1)}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
/* Р-627: интерактивный блок под курсором поднимается на 5 px вместо синей рамки; при уменьшенном движении стоит на месте */
.pd-lift{transition:transform 220ms cubic-bezier(.2,0,.2,1),box-shadow 220ms cubic-bezier(.2,0,.2,1),background 180ms cubic-bezier(.2,0,.2,1),color 180ms cubic-bezier(.2,0,.2,1),opacity 460ms cubic-bezier(.2,0,.2,1)!important}
.pd-lift:hover,.pd-lift:focus-visible{transform:translateY(-5px)!important;box-shadow:0 10px 20px rgba(20,22,28,.09)!important}
@media (prefers-reduced-motion:reduce){html .pd-lift{transition:none!important}html .pd-lift:hover,html .pd-lift:focus-visible{transform:none!important}}

/* Фон в движении (Р-624, по указанию владельца; устроено как на «Экспертам»,
   Р-620): кольца с точками покачиваются вокруг центра, пятно света за
   кольцом первого экрана дышит. Размах подобран по каждому кольцу так,
   чтобы точки не заходили под строки текста. Только transform и opacity;
   при уменьшенном движении всё стоит (Р-93). */
@keyframes pd-swing{from{transform:rotate(-12deg)}to{transform:rotate(12deg)}}
@keyframes pd-swing-hero{from{transform:rotate(-24deg)}to{transform:rotate(24deg)}}
@keyframes pd-swing-calm{from{transform:rotate(-3deg)}to{transform:rotate(3deg)}}
@keyframes pd-breathe{from{opacity:.55;transform:scale(.9)}to{opacity:1;transform:scale(1.06)}}
.pd-orb{transform-origin:51.5625% 51.7241%;animation:pd-swing 46s ease-in-out -23s infinite alternate}
.pd-orb-b{animation-duration:58s;animation-delay:-29s;animation-direction:alternate-reverse}
.pd-orb-hero{animation-name:pd-swing-hero;animation-duration:36s;animation-delay:-18s}
.pd-orb-calm{animation-name:pd-swing-calm;animation-duration:30s;animation-delay:-15s}
.pd-glow{animation:pd-breathe 13s ease-in-out infinite alternate}
.bp-crewcard{position:relative;z-index:1}
.bp-crewfig{position:absolute;left:50%;transform:translateX(-50%);top:-166px;height:210px;width:auto;z-index:0;pointer-events:none}
.bp-orbit{margin-top:156px}
@media (max-width:1024px){.bp-orbit{margin-top:0}.bp-crewfig{position:relative;left:auto;top:auto;transform:none;display:block;height:190px;margin:0 auto -42px}}
@media (max-width:480px){.bp-crewfig{height:168px;margin-bottom:-38px}}

/* «Как это выглядит внутри» — кабинет клиента вкладками (С-1, Р-591): тот же
   компонент, что на «Экспертам» (Р-584): pill-кнопки на тихой подложке,
   слева текст, справа снимок экрана в рамке. */
.pd-in-tablist{display:inline-flex;gap:4px;padding:4px;background:var(--pd-surface-quiet);border:1px solid var(--pd-border);border-radius:999px;max-width:100%;overflow-x:auto;scrollbar-width:none}
.pd-in-tablist::-webkit-scrollbar{display:none}
@media (max-width:768px){.pd-in-tablist{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));width:100%;border-radius:14px!important}.pd-in-tablist [role=tab]{justify-content:center;text-align:center;white-space:normal!important;padding:6px 12px!important;border-radius:10px!important}}
.pd-in-body{display:grid;grid-template-columns:minmax(0,.78fr) minmax(0,1.22fr)}
@media (max-width:1024px){.pd-in-body{grid-template-columns:minmax(0,1fr)}}
@media (max-width:768px){.pd-in-sub{text-align:left!important;margin-left:0!important}}

.x1:hover{background:rgba(216,228,243,.62) !important}
.x2:active{background:rgba(216,228,243,.84) !important}
.x3:hover{border-color:var(--pd-accent) !important}
.x4:active{transform:scale(.97) !important}
.x5:hover{color:var(--pd-ink) !important}
.x6:hover{color:var(--pd-ink) !important;border-color:var(--pd-ink) !important}
.x7:hover{background:var(--pd-button-hover) !important;color:var(--pd-ink-inverse) !important}
.x8:hover{background:var(--pd-button-hover) !important}
.x9:hover{background:var(--pd-ink-inverse) !important;color:var(--pd-ink) !important}
.xa:focus-visible{border-color:var(--pd-accent) !important;box-shadow:0 0 0 3px rgba(20,65,122,.16) !important}
.xb:hover{color:var(--pd-accent-press) !important}
.xc:hover{background:var(--pd-accent-hover) !important;border-color:var(--pd-accent-hover) !important}
.xd:active{background:var(--pd-accent-active) !important}
.xe:hover{background:var(--pd-accent-mark) !important}
.xf:active{background:var(--pd-accent-mark) !important}
.xg:hover{background:var(--pd-surface-quiet) !important}
.xh:active{background:var(--pd-surface-quiet) !important}
.xi:hover{border-color:var(--pd-ink) !important}
.xj:hover{box-shadow:inset 3px 0 0 var(--pd-accent) !important}
.xk:active{opacity:.82 !important}
.xl:hover{color:var(--pd-accent) !important}
.xm:hover{background:var(--pd-accent-edge) !important}
.xn:active{transform:scale(.94) !important}
.xo:hover{color:var(--pd-ink-secondary) !important}
.xp:hover{border-color:var(--pd-accent) !important;background:var(--pd-surface-quiet) !important}
`;

class BusinessPageView extends React.Component<any, any> {
/* Проверено по действующим источникам 9 августа 2026:
   — ГОСТ Р 58048-2017 «Трансфер технологий. Методические указания по оценке уровня зрелости
     технологий», введён 01.06.2018, шкала УГТ 1—9 (garant.ru, п. 4.8; docs.cntd.ru).
   — п. 7 ст. 262 НК РФ: расходы на НИОКР по перечню Правительства учитываются с коэффициентом 2
     с 01.01.2025 (ранее 1,5); перечень — постановление Правительства от 24.12.2008 № 988,
     изменения — постановление от 29.10.2024 № 1444 (consultant.ru, rnk.ru, buhexpert8.ru).
   — Государственный учёт НИОКТР: ЕГИСУ НИОКТР, постановление Правительства РФ от 12.04.2013 № 327;
     регистрационная карта (РК) подаётся в 30-дневный срок после начала работ, ИКРБС — после
     завершения; оператор ЦИТИС, портал rosrid.ru (research.hse.ru, etu.ru, citis.ru).
   Годы редакций стандартов сверены 12 сентября 2026 (docs.cntd.ru, base.garant.ru,
   consultant.ru, protect.gost.ru):
   — ГОСТ 7.32-2017 «СИБИД. Отчёт о научно-исследовательской работе. Структура и правила
     оформления», приказ Росстандарта от 24.10.2017 № 1494-ст, взамен ГОСТ 7.32-2001;
   — ГОСТ Р 15.101-2021 «СРПП. Порядок выполнения научно-исследовательских работ», приказ
     Росстандарта от 24.08.2021 № 784-ст, введён 01.11.2021 взамен ГОСТ 15.101-98. Ссылка на
     редакцию 98 года была недействующей;
   — ГОСТ Р 15.011-2024 «Интеллектуальная собственность. Патентные исследования. Содержание и
     порядок проведения», приказ Росстандарта от 13.02.2024 № 208-ст, введён 01.03.2024 взамен
     ГОСТ Р 15.011-96. Стандарт сменил и наименование, и область: с СРПП на интеллектуальную
     собственность;
   — ГОСТ Р 15.301-2016 «СРПП. Продукция производственно-технического назначения. Порядок
     разработки и постановки продукции на производство», приказ Росстандарта от 31.10.2016
     № 1567-ст, действует;
   — ГОСТ Р 58048-2017 замены не имеет, проверено повторно.
   Помечено маркером и НЕ подставлено по памяти:
   — конкретные наименования и условия действующих программ фондов поддержки;
   — сроки ведомственных процедур регистрации охранных документов. */

  state = { inTab: 0, revFormOpen: false, sentReview: false, revAt: 0, trl: 5, open: { 0: true }, allOpen: false, mech: {}, sentTop: false, sentMain: false, contactTop: 0, contactBottom: 0, highlight: null, faqOpen: 0, navOpen: false };
  componentDidMount(){
    // Всплывающее окно закрывается клавишей Esc — иначе с клавиатуры
    // из него не выйти, а закрывающая кнопка может быть прокручена.
    // Окно отзыва модальное (aria-modal): при открытии фокус переходит в
    // него, Tab не выходит за его пределы, при закрытии фокус возвращается
    // на кнопку «Написать отзыв» — иначе клавиатура оставалась под
    // затемнением, а читалка теряла место (Р-250).
    this.openRev = () => {
      this.setState({ revFormOpen: true });
      requestAnimationFrame(() => document.getElementById('bp-revform-title')?.focus());
    };
    this.closeRev = () => {
      this.setState({ revFormOpen: false });
      requestAnimationFrame(() => document.getElementById('bp-revbtn')?.focus());
    };
    this.onRevKey = e => {
      if (!this.state.revFormOpen) return;
      if (e.key === 'Escape') { this.closeRev(); return; }
      if (e.key !== 'Tab') return;
      const box = document.querySelector('#bp-revform [role="dialog"]');
      if (!box) return;
      const items = [...box.querySelectorAll('button, input, textarea, select, a[href]')].filter(x => !x.disabled && x.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1], at = document.activeElement;
      if (e.shiftKey && (at === first || !box.contains(at))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (at === last || !box.contains(at))) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', this.onRevKey);
    // Шкала УГТ уже 1014 px прокручивается в своей области: текущий
    // уровень ставится в её середину, иначе на телефоне видны только
    // первые три уровня, а выбран пятый (Р-801). Страница при этом не
    // прокручивается — сдвигается только сама шкала.
    this.centerTrl = () => {
      const box = document.querySelector('#trl .bp-trlscroll');
      const cur = box && box.querySelector('[aria-pressed="true"]');
      if (!box || !cur || box.scrollWidth <= box.clientWidth) return;
      const a = box.getBoundingClientRect(), b = cur.getBoundingClientRect();
      box.scrollTo({ left: box.scrollLeft + (b.left + b.width / 2) - (a.left + a.width / 2), behavior: 'instant' });
    };
    requestAnimationFrame(this.centerTrl);
    // Шкала встаёт по центру только при смене ширины окна: на телефоне
    // строка адреса при прокрутке меняет высоту окна, и шкала, которую
    // посетитель листает пальцем, возвращалась бы к текущему уровню
    // (шлифовка Р-801).
    this.trlWidth = window.innerWidth;
    this.onResize = () => {
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        this.forceUpdate();
        if (window.innerWidth !== this.trlWidth) { this.trlWidth = window.innerWidth; this.centerTrl(); }
      });
    };
    window.addEventListener('resize', this.onResize);
    // Карточки условий одной высоты (Р-834): общая высота — по самой
    // высокой карточке в закрытом виде (у раскрытой вычитается её
    // пояснение с отступом 18 px), только от 769 px, где карточки в две
    // колонки. Пересчёт — после загрузки шрифтов и при смене ширины окна.
    this.fitMech = () => {
      const grid = document.querySelector('.bp-mech');
      if (!grid) return;
      grid.style.removeProperty('--bp-mech-h');
      if (!window.matchMedia('(min-width:769px)').matches) return;
      const cards = [...grid.querySelectorAll('.bp-mechcard')];
      if (!cards.length) return;
      const h = Math.max(...cards.map(c => { const p = c.querySelector('.bp-proof'); return c.offsetHeight - (p ? p.offsetHeight + 18 : 0); }));
      grid.style.setProperty('--bp-mech-h', h + 'px');
    };
    this.mechWidth = window.innerWidth;
    this.onMechResize = () => { if (window.innerWidth !== this.mechWidth) { this.mechWidth = window.innerWidth; this.fitMech(); } };
    window.addEventListener('resize', this.onMechResize);
    requestAnimationFrame(this.fitMech);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.fitMech());
    // На широком экране меню всегда развёрнуто: иначе атрибут hidden
    // остаётся на видимом <nav>, и программа чтения с экрана его минует.
    this.wide = window.matchMedia('(min-width:1201px)');
    this.syncNav = () => this.setState({ navOpen: this.wide.matches });
    this.syncNav();
    this.wide.addEventListener('change', this.syncNav);
  }
  componentWillUnmount(){
    window.removeEventListener('keydown', this.onRevKey);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('resize', this.onMechResize);
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.wide) this.wide.removeEventListener('change', this.syncNav);
  }
  renderVals(){
    const edges = ['var(--pd-accent)', 'var(--pd-accent)', 'var(--pd-accent)'];
    const inks = ['var(--pd-accent)', 'var(--pd-accent)', 'var(--pd-accent)'];

    const packData = [
      ['pack-1', '01', 'Техзадание и патентная чистота', 'от 3 недель', 4, '17px',
        'Есть идея или лабораторный результат, работы ещё не начаты.',
        'Разбираем задачу с отраслевым экспертом, ведём предварительный патентно-информационный поиск, формулируем техническое задание. Считаем календарный план и смету НИОКР.'],
      ['pack-2', '02', 'НИОКР под сдачу', 'от 2 месяцев', 4, '17px',
        'Работы идут или начинаются, результат нужно сдать заказчику или комиссии.',
        'Ведём работу по этапам, разрабатываем методику и программу испытаний, обрабатываем данные. Готовим отчётность и сопровождаем приёмку.'],
      ['pack-3', '03', 'Заявка на грант или субсидию', 'от 3 недель', 2, '17px',
        'Есть проект и конкурс с дедлайном.',
        'Подбираем программу под стадию и отрасль, готовим заявку по форме конкурса. Считаем бюджет и разбираем с командой вопросы экспертного совета.'],
      ['pack-4', '04', 'Разработка в нематериальный актив', 'от 4 недель', 2, '17px',
        'Результат получен, его нужно защитить и поставить на баланс.',
        'Строим патентный ландшафт, проверяем свободу использования, оформляем заявку на охранный документ. Вводим режим коммерческой тайны и служебные результаты.'],
      ['pack-5', '05', 'Рынок и решение о внедрении', 'от 3 недель', 2, '17px',
        'Нужно решение о внедрении: технология, рынок и экономика.',
        'Считаем объём рынка по вторичным источникам, сравниваем с решениями конкурентов. Разбираем нормативные барьеры и считаем экономику внедрения.']
    ];
    const packSpans = { 'pack-1': 2, 'pack-2': 2, 'pack-3': 2, 'pack-4': 3, 'pack-5': 3 };
    // Пиктограммы пакетов идут в порядке packData: техзадание и патентный
    // поиск, работа по этапам с приёмкой, заявка по форме конкурса, права на
    // разработку, рынок и решение о внедрении. Набор pd-* — решения Р-61, Р-64.
    const packIcons = ['pd-patsearch', 'pd-stages', 'pd-grant', 'pd-asset', 'pd-market'];
    const packs = packData.map(([anchor, num, title, term, span, titleSize, who, what], i) => ({
      anchor, num, title, term, titleSize, who, what,
      // Пять ссылок «Обсудить пакет» ведут в одну форму, поэтому у каждой свой
      // aria-label: без него скринридер читает пять одинаковых ссылок подряд.
      cta: 'Обсудить пакет «' + title + '»',
      art: "url('./assets/art/pack-" + (i + 1) + ".webp')",
      icon: "url('./assets/icons/" + packIcons[i] + ".svg') center/contain no-repeat",
      span: packSpans[anchor] || span,
      edge: edges[i % 3], ink: inks[i % 3],
      border: this.state.highlight === anchor ? 'var(--pd-accent-mark)' : 'var(--pd-border)'
    }));

    // Девять уровней готовности технологии по ГОСТ Р 58048-2017. Поля названы,
    // а не разложены по индексам кортежа: у уровня девять характеристик, и
    // обращение вида cur[7] читать невозможно.
    const trlData = [
      {
        num: 1, short: 'Идея',
        title: 'Сформулирован физический принцип, публикаций и расчётов пока нет.',
        note: 'Инструменты поддержки внедрения и налоговый учёт НИОКР на этом уровне недоступны: сначала нужно подтвердить принцип и зафиксировать результат документом.', noteKind: 'early',
        can: ['Формулируем научную задачу и проверяем принципиальную осуществимость.', 'Ищем аналоги в научной литературе и патентных базах.'],
        docs: [['Аналитический обзор литературы', 'по теме'], ['Предварительный патентный поиск', 'ГОСТ Р 15.011-2024']],
        money: ['Собственные средства компании.', 'Гранты на поисковые исследования.'],
        pack: 'pack-1', packLabel: '01 · Техзадание и патентная чистота'
      },
      {
        num: 2, short: 'Концепция',
        title: 'Сформулирована концепция применения, расчёты предварительные.',
        note: 'Для внедренческих программ рано: нет экспериментального подтверждения. Раньше нужно получить лабораторные данные.', noteKind: 'early',
        can: ['Описываем область применения и ограничения технологии.', 'Проводим патентный поиск по направлению.'],
        docs: [['Концепция технического решения', 'внутренний документ'], ['Отчёт о патентном поиске', 'ГОСТ Р 15.011-2024']],
        money: ['Собственные средства компании.', 'Посевные программы фондов.'],
        pack: 'pack-1', packLabel: '01 · Техзадание и патентная чистота'
      },
      {
        num: 3, short: 'Подтверждение',
        title: 'Получено лабораторное подтверждение ключевых функций.',
        note: 'Документацию этого уровня ведём полностью — от технического задания до приёмки этапов.', noteKind: 'full',
        can: ['Формулируем техническое задание на НИОКР.', 'Планируем эксперимент и разрабатываем методику исследования.'],
        docs: [['Техническое задание на НИОКР', 'ГОСТ Р 15.101-2021'], ['Методика исследования', 'внутренний документ'], ['Календарный план и смета', 'приложение к договору']],
        money: ['Гранты на прикладные исследования.', 'Повышающий коэффициент к расходам на НИОКР из перечня, п. 7 ст. 262 НК РФ.'],
        pack: 'pack-1', packLabel: '01 · Техзадание и патентная чистота'
      },
      {
        num: 4, short: 'Макет',
        title: 'Работает лабораторный макет, компоненты проверены по отдельности.',
        note: 'Документацию этого уровня ведём полностью — от технического задания до приёмки этапов.', noteKind: 'full',
        can: ['Ведём НИОКР по этапам с промежуточной приёмкой.', 'Обрабатываем экспериментальные данные и строим расчётное обоснование.'],
        docs: [['Отчёт о научно-исследовательской работе', 'ГОСТ 7.32-2017'], ['Акты сдачи-приёмки этапов', 'по договору'], ['Регистрационная карта НИОКТР', 'ПП РФ № 327']],
        money: ['Гранты на разработку.', 'Учёт расходов на НИОКР с коэффициентом 2, п. 7 ст. 262 НК РФ.'],
        pack: 'pack-2', packLabel: '02 · НИОКР под сдачу'
      },
      {
        num: 5, short: 'Испытания',
        title: 'Макет проверен в условиях, приближенных к рабочим.',
        note: 'Документацию этого уровня ведём полностью — от программы испытаний до заявки на охранный документ.', noteKind: 'full',
        can: ['Разрабатываем программу и методику испытаний.', 'Оформляем заявку на охранный документ по полученному результату.'],
        docs: [['Программа и методика испытаний', 'ГОСТ Р 15.301-2016'], ['Протоколы испытаний', 'по программе'], ['Заявка на изобретение или полезную модель', 'гл. 72 ГК РФ']],
        money: ['Программы поддержки разработки.', 'Учёт расходов на НИОКР с коэффициентом 2, п. 7 ст. 262 НК РФ.'],
        pack: 'pack-2', packLabel: '02 · НИОКР под сдачу'
      },
      {
        num: 6, short: 'Прототип',
        title: 'Испытан прототип в реальных условиях эксплуатации.',
        note: 'Документацию этого уровня ведём полностью — от заявки в фонд до отчётности по гранту.', noteKind: 'full',
        can: ['Оформляем заявку на грант или субсидию под требования конкурса.', 'Считаем бюджет и финансово-экономическое обоснование.'],
        docs: [['Заявка по форме конкурса', ''], ['Финансово-экономическое обоснование', 'по форме конкурса'], ['Дорожная карта проекта', 'по форме конкурса']],
        money: ['Конкурсы на коммерциализацию.', 'Субсидии на внедрение.'],
        pack: 'pack-3', packLabel: '03 · Заявка на грант или субсидию'
      },
      {
        num: 7, short: 'Демонстрация',
        title: 'Опытный образец продемонстрирован заказчику или на площадке.',
        note: 'Документацию этого уровня ведём полностью — от заявки на охранный документ до постановки прав на баланс.', noteKind: 'full',
        can: ['Оформляем права: патент, программа для ЭВМ, коммерческая тайна.', 'Собираем документы для постановки прав на баланс.'],
        docs: [['Заявка на охранный документ', 'гл. 72 ГК РФ'], ['Свидетельство на программу для ЭВМ', 'ст. 1262 ГК РФ'], ['Документы по коммерческой тайне', '98-ФЗ'], ['Документы для учёта НМА', 'ФСБУ 14/2022']],
        money: ['Программы масштабирования.', 'Постановка НМА на баланс как источник капитализации.'],
        pack: 'pack-4', packLabel: '04 · Разработка в нематериальный актив'
      },
      {
        num: 8, short: 'Опытный образец',
        title: 'Образец испытан и подтверждён в составе системы. Документацию этого уровня ведёт предприятие.',
        note: 'Конструкторскую и технологическую документацию ведёт предприятие. За нами — обоснование, права и рынок.', noteKind: 'plant',
        can: ['Считаем экономику внедрения и сравниваем с решениями конкурентов.', 'Конструкторскую и технологическую документацию на этом уровне готовит предприятие.'],
        docs: [['Технико-экономическое обоснование', 'расчёт эффекта'], ['Обзор нормативных барьеров', 'действующие требования'], ['Технологический бенчмаркинг', 'открытые данные']],
        money: ['Инвестиционное финансирование по обоснованию.', 'Программы поддержки серийного освоения.'],
        pack: 'pack-5', packLabel: '05 · Рынок и решение о внедрении'
      },
      {
        num: 9, short: 'Серия',
        title: 'Технология освоена в серийном производстве. Серийную документацию ведёт предприятие.',
        note: 'Серийную документацию ведёт предприятие. За нами — оценка эффекта, сопровождение публикаций и развитие продукта.', noteKind: 'plant',
        can: ['Оцениваем объём рынка и собираем данные для решения о масштабировании.', 'Сопровождаем подготовку статьи и доклада по результатам работ: структура, требования журнала, экспертиза рукописи авторов.'],
        docs: [['Аналитический отчёт по рынку', 'вторичные источники'], ['Оценка экономического эффекта', 'расчёт'], ['Заключение по рукописи статьи', 'требования журнала']],
        money: ['Собственные средства и инвестиции.', 'Учёт расходов на развитие продукта, п. 7 ст. 262 НК РФ.'],
        pack: 'pack-5', packLabel: '05 · Рынок и решение о внедрении'
      }
    ];
    const sel = this.state.trl;
    const trlScale = trlData.map(({ num, short }) => ({
      num: '0' + num, short,
      // Имя начинается с видимой надписи «01 Идея»: голосовое управление и
      // программа экранного доступа находят кнопку по тому, что на экране
      // (Р-781, axe label-content-name-mismatch).
      aria: '0' + num + ' ' + short + ' — уровень готовности технологии',
      pressed: num === sel ? 'true' : 'false',
      // Узел уровня (Р-801, как «Шкала плана» Р-796): пройденный залит
      // акцентом с белым номером, текущий — белый с кольцом акцента,
      // будущие — белые с кольцом --pd-border и приглушённым номером.
      nodeBg: num < sel ? 'var(--pd-accent)' : 'var(--pd-ink-inverse)',
      nodeRing: num <= sel ? 'var(--pd-accent)' : 'var(--pd-border)',
      numColor: num < sel ? 'var(--pd-ink-inverse)' : num === sel ? 'var(--pd-accent)' : 'var(--pd-ink-muted)',
      titleColor: num === sel ? 'var(--pd-ink)' : 'var(--pd-ink-muted)',
      pick: () => this.setState({ trl: num })
    }));
    // Пройденный участок линии: она идёт от центра первого узла до центра
    // девятого, восемь промежутков; заливка растёт transform: scaleX до
    // центра выбранного узла.
    const trlFill = ((sel - 1) / (trlData.length - 1)).toFixed(4);
    const cur = trlData[sel - 1];
    const goPack = anchor => () => {
      this.setState({ highlight: anchor });
      const el = document.getElementById(anchor);
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.pageYOffset - 24);
    };
    const trl = {
      num: '0' + cur.num, short: cur.short, title: cur.title,
      note: cur.note,
      // Три вида строки статуса: предупреждение на уровнях 1—2, граница
      // ответственности в нашу сторону на 3—7 и в сторону предприятия на 8—9.
      noteLabel: cur.noteKind === 'early' ? 'Для инструментов внедрения рано'
        : cur.noteKind === 'plant' ? 'Дальше документацию ведёт предприятие'
        : 'Документацию этого уровня ведём мы',
      noteBg: cur.noteKind === 'early' ? 'var(--pd-err-bg)' : 'var(--pd-surface-quiet)',
      noteBorder: cur.noteKind === 'early' ? 'var(--pd-err-border)' : 'var(--pd-border)',
      noteInk: cur.noteKind === 'early' ? 'var(--pd-err-ink)' : 'var(--pd-accent)',
      noteText: cur.noteKind === 'early' ? 'var(--pd-err-ink)' : 'var(--pd-ink-secondary)',
      can: cur.can.map(text => ({ text })),
      docs: cur.docs.map(([name, norm]) => ({ name, norm })),
      money: cur.money.map(text => ({ text })),
      packLabel: cur.packLabel,
      goPack: goPack(cur.pack),
      // CSS-анимация перезапускается только при смене имени, поэтому два
      // одинаковых по эффекту ключевых кадра чередуются по чётности уровня.
      bodyClass: sel % 2 ? 'bp-trlbody bp-trlbody-a' : 'bp-trlbody bp-trlbody-b'
    };

    const catalogMeta = [
      ['Ведём работу по этапам и готовим отчётность под требования заказчика и налогового учёта.', 'Комиссия заказчика, налоговый орган', 'ГОСТ Р 15.101-2021 · ГОСТ Р 15.301-2016 · ПП РФ № 327'],
      ['Оформляем права на результат и готовим документы для постановки актива на баланс.', 'Роспатент, бухгалтерия компании', 'гл. 72 ГК РФ · ст. 1262 ГК РФ · 98-ФЗ'],
      ['Упаковываем проект под требования конкретного конкурса и репетируем защиту с командой.', 'Фонд, ведомство, экспертный совет', 'по форме конкурса'],
      ['Считаем экономику проекта и собираем обоснование для инвестора или банка.', 'Инвестор, банк, налоговый орган', 'п. 7 ст. 262 НК РФ'],
      ['Собираем данные для решения о внедрении: рынок, конкуренты, барьеры.', 'Совет директоров, инвестиционный комитет', 'ГОСТ Р 58048-2017'],
      ['Сопровождаем статью и доклад сотрудников по результатам работ: структура, требования издания, экспертиза рукописи.', 'Редакция журнала, оргкомитет конференции', 'требования издания'],
      ['Ставим внутренний процесс НИОКР и сопровождаем научную функцию компании.', 'Руководство компании', 'внутренние регламенты']
    ];
    const catalogData = [
      ['НИОКР и прикладные исследования', ['Постановка задачи и техническое задание на НИОКР', 'Календарный план и смета научно-исследовательских работ', 'Предварительный патентно-информационный поиск до начала работ', 'Аналитический обзор научно-технической литературы по теме', 'Разработка методики исследования', 'Программа и методика испытаний', 'Планирование эксперимента', 'Обработка и статистический анализ экспериментальных данных', 'Математическое моделирование и расчётное обоснование', 'Отчёт о научно-исследовательской работе по действующему стандарту', 'Пояснительная записка и отчётность по опытно-конструкторской работе', 'Акты сдачи-приёмки этапов и закрывающая документация', 'Регистрационная и информационная карта для государственного учёта НИОКТР', 'Научно-техническая экспертиза и рецензирование чужого отчёта', 'Сопровождение приёмки работ комиссией заказчика']],
      ['Интеллектуальная собственность', ['Патентный ландшафт по технологии или отрасли', 'Проверка патентной чистоты и свободы использования', 'Заявка на изобретение', 'Заявка на полезную модель', 'Заявка на промышленный образец', 'Регистрация программы для ЭВМ', 'Регистрация базы данных', 'Оформление ноу-хау и режима коммерческой тайны', 'Оформление служебных результатов: положение, уведомления, приказы', 'Ответы на запросы экспертизы по заявке', 'Документы для постановки прав на баланс как нематериального актива', 'Договоры о распоряжении правами: лицензионный, отчуждения, договор НИОКР']],
      ['Гранты, субсидии и господдержка', ['Подбор программы поддержки под стадию проекта и отрасль', 'Заявка в фонд поддержки инноваций по форме конкурса', 'Финансово-экономическое обоснование проекта', 'Бюджет проекта под требования конкурса', 'Дорожная карта проекта и план коммерциализации', 'Промежуточная и итоговая отчётность по гранту', 'Подготовка команды к защите заявки перед экспертным советом', 'Техническая часть заявки на конкурс по государственным закупкам']],
      ['Бизнес-планирование и инвестиции', ['Бизнес-план по методике конкретного получателя', 'Финансовая модель проекта со сценариями', 'Технико-экономическое обоснование внедрения', 'Инвестиционный меморандум', 'Презентация проекта для инвестора и разбор вопросов', 'Оценка экономического эффекта от внедрения', 'Документальное обоснование расходов на НИОКР для налогового учёта']],
      ['Исследования рынка и технологий', ['Оценка объёма рынка по вторичным источникам', 'Конкурентный и технологический бенчмаркинг', 'Технологический скаутинг под задачу компании', 'Внешняя оценка уровня готовности технологии с обоснованием', 'Технологическая дорожная карта и прогноз развития', 'Обзор нормативных требований и барьеров внедрения']],
      ['Публикации и научная репутация компании', ['Сопровождение статьи сотрудников до подачи в рецензируемый журнал', 'Экспертиза рукописи и доклада', 'Перевод и адаптация рукописи авторов для англоязычного издания']],
      ['Научная функция внутри компании', ['Постановка процесса НИОКР: регламенты, шаблоны технического задания и отчёта, чек-листы приёмки, обучение команды, внешний научный руководитель проекта']]
    ];
    const catalog = catalogData.map(([title, items], gi) => {
      const open = this.state.allOpen || !!this.state.open[gi];
      // Нумерация идёт внутри направления, а не сквозная по каталогу:
      // раскрытая вторая группа начиналась с шестнадцатого номера, хотя
      // в её заголовке написано «12 позиций».
      const rows = items.map((text, i) => ({ num: String(i + 1).padStart(2, '0'), text }));
      const meta = catalogMeta[gi] || ['', '', ''];
      return {
        title, num: '0' + (gi + 1), open, expanded: open ? 'true' : 'false',
        // Направление 07 ведёт сопровождение диссертаций сотрудников на
        // «Аспирантам» (Р-772): ссылка вместо позиции каталога.
        postgrad: gi === 6,
        lead: meta[0], receiver: meta[1], norm: meta[2],
        art: "url('./assets/art/cat-" + (gi + 1) + ".webp')",
        // Семь ссылок ведут в одну форму: без названия направления список
        // ссылок страницы читается как семь одинаковых строк.
        cta: 'Обсудить это направление «' + title + '»',
        plusV: open ? 'none' : 'block',
        headBg: open ? 'var(--pd-accent-tint)' : 'var(--pd-ink-inverse)',
        count: items.length + ' поз.',
        items: rows.map(r => ({ ...r, numColor: 'var(--pd-accent)' })),
        toggle: () => this.setState(s => ({ allOpen: false, open: { ...s.open, [gi]: !(s.allOpen || s.open[gi]) } }))
      };
    });

    // Карусель отзывов. Карточка со смещением 0 — впереди и резкая, ±1
    // приглушены и размыты, ±2 уходят за край сцены. Смещение считается по
    // кругу, поэтому список листается бесконечно в обе стороны.
    // Тексты — настоящие отзывы клиентов с Авито, приведены дословно вместе
    // с авторской пунктуацией и опечатками: отредактированный отзыв
    // перестаёт быть отзывом. Публикуются имя и дата, фамилии и фотографии
    // с площадки — нет. Отбор описан в решении Р-113: четыре отзыва из
    // двенадцати не опубликованы, потому что называют предметом работу,
    // выполненную за клиента.
    // Фото автора (Р-590, Р-617): поле photo ставится, только если автор
    // сам прислал снимок и письменно согласился на его публикацию; рядом —
    // consent, дата согласия. Файл — 112×112 WebP в design/assets/reviews/
    // и app/public/assets/reviews/. Без photo у карточки заглушка-силуэт (Р-827).
    // Сгенерированные и чужие лица не ставятся.
    const REVIEWS = [
      // Отзывы, где речь об оценке и преподавателях, — студенческие: на «Компаниям» их нет (Р-605).
      { role: 'Роман', field: 'Авито · 30 сентября 2024',
        text: 'Работа была выполнена качественно. Все договоренности проработали, цена была объявлена сразу. Человек компетентный и опытный, довериться можно)' },
      { role: 'Олег', field: 'Авито · 1 ноября 2024',
        text: 'Спасибо за работу, выполнено профессионально не смотря на сложную тему, однозначно буду обращаться ещё)' },
      { role: 'Ирина', field: 'Авито · 12 июля 2024',
        text: 'Цена соответствует качеству работы, все было выполнено даже раньше срока, в полном объёме. Быстрые ответы, вежливое общение, пояснения по всем вопросам)' },
      { role: 'Ян', field: 'Авито · 2 ноября 2024',
        text: 'Цена оправдана. Срок и требования были идеально выполнены, я очень благодарен таким людям!' },
      { role: 'Велина', field: 'Авито · 3 ноября 2024',
        text: 'Работа выполнена качественно, в соответствии с заявленным объявлением, максимально быстро, без технических и иных проблем! Благодарю Вас!' },
      { role: 'Александра', field: 'Авито · 30 июня 2024',
        text: 'вежливый, все сделал быстро и оперативно, как и просила, рекомендую!!! еще раз спасибо за оперативность и качество работы' },
    ];
    const revN = REVIEWS.length;
    const revAt = this.state.revAt;
    const reviews = REVIEWS.map((r, i) => {
      let d = i - revAt;
      if (d > revN / 2) d -= revN;
      if (d < -revN / 2) d += revN;
      const a = Math.abs(d);
      return {
        ...r,
        hasPhoto: Boolean(r.photo),
        noPhoto: !r.photo,
        // Смещение подобрано так, чтобы дальняя карточка заходила за край
        // сцены, но оставалась видимой примерно на две трети.
        tf: 'translateX(' + (d < 0 ? -1 : 1) * (a === 0 ? 0 : a === 1 ? 62 : 112) + '%) '
            + 'scale(' + (a === 0 ? 1 : a === 1 ? 0.88 : 0.76) + ')',
        fl: a === 0 ? 'none' : a === 1 ? 'blur(2.5px)' : 'blur(5px)',
        op: '1',
        z: String(3 - a),
        pe: a === 0 ? 'auto' : 'none',
        hidden: a === 0 ? undefined : 'true'
      };
    });
    // «Как это выглядит внутри» — кабинет клиента вкладками (С-1, Р-591).
    // Тексты сверены с экранами кабинета клиента; суммы на снимке оплат
    // размыты: цены на сайте не публикуются (Р-03).
    const IN_TABS = [
      { label: 'Карточка работы', title: 'Карточка работы', text: 'План этапов, ход работы и то, что ждут от вас, — на одной карточке. Рядом — переписка с менеджером.',
        points: ['Что нужно от вас — первой строкой, со сроком', 'Пройденные этапы отмечены на шкале', 'Переписка ведётся в кабинете и остаётся при работе'],
        img: './assets/art/cl-tab-card.webp', alt: 'Карточка работы в кабинете клиента: этап на согласовании, план работ и переписка с менеджером. Данные вымышленные.',
        caption: 'Карточка работы. На снимке вымышленные данные.' },
      { label: 'Согласование этапа', title: 'Согласование этапа', text: 'Когда этап готов, менеджер публикует итог: что сделано и что дальше. Вы согласуете этап или возвращаете его с замечаниями.',
        points: ['Итог этапа и последние версии материалов — на одной странице', 'Срок согласования виден заранее', 'Этап можно вернуть с замечаниями'],
        img: './assets/art/cl-tab-stage.webp', alt: 'Страница этапа в кабинете клиента: итог этапа, срок согласования, кнопки «Согласовать этап» и «Вернуть с замечаниями». Данные вымышленные.',
        caption: 'Этап на согласовании. На снимке вымышленные данные.' },
      { label: 'Материалы и версии', title: 'Материалы и версии', text: 'Материалы хранятся версиями: каждая загрузка — отдельная версия, прежние остаются доступными.',
        points: ['Версии одного материала — по порядку, с датой и автором', 'Замечание оставляется к конкретной версии', 'Свои файлы вы прикладываете здесь же'],
        img: './assets/art/cl-tab-materials.webp', alt: 'Материалы работы в кабинете клиента: две версии главы и загрузка новой. Данные вымышленные.',
        caption: 'Материалы работы. На снимке вымышленные данные.' },
      { label: 'Оплаты и документы', title: 'Оплаты и документы', text: 'Договор, платежи по нему и документы — на одном экране: что оплачено, что ожидается и каким документом закрыт платёж.',
        points: ['Номер и дата договора', 'Платежи со сроками и состоянием', 'Счета и акты приложены к платежам'],
        img: './assets/art/cl-tab-payments.webp', alt: 'Оплаты и документы в кабинете клиента: договор, доля оплаченного и платежи; суммы скрыты. Данные вымышленные.',
        caption: 'Оплаты и документы. Суммы на снимке скрыты: смета считается для каждой работы.' },
    ];
    const inTab = IN_TABS[this.state.inTab];
    return {
      inTabs: IN_TABS.map((t, i) => ({
        label: t.label, id: 'pd-in-tab-' + i,
        active: i === this.state.inTab, inactive: i !== this.state.inTab,
        pick: () => this.setState({ inTab: i }),
      })),
      // Стрелки, Home и End переводят вкладку и фокус (WAI-ARIA, вкладки).
      inTabKey: e => {
        const n = IN_TABS.length;
        let i = this.state.inTab;
        if (e.key === 'ArrowRight') i = (i + 1) % n;
        else if (e.key === 'ArrowLeft') i = (i - 1 + n) % n;
        else if (e.key === 'Home') i = 0;
        else if (e.key === 'End') i = n - 1;
        else return;
        e.preventDefault();
        this.setState({ inTab: i }, () => { const el = document.getElementById('pd-in-tab-' + i); if (el) el.focus(); });
      },
      inTabLabelledBy: 'pd-in-tab-' + this.state.inTab,
      inTitle: inTab.title, inText: inTab.text, inCaption: inTab.caption,
      inPoints: inTab.points.map(text => ({ text })),
      // Р-881: снимки всех вкладок в разметке сразу; подпись alt — только у снимка
      // выбранной вкладки, прочие прозрачны и скрыты от читалки.
      inShots: IN_TABS.map((t, i) => {
        const on = i === this.state.inTab;
        return { src: t.img, alt: on ? t.alt : '', hidden: on ? undefined : 'true', op: on ? '1' : '0', loading: i === 0 ? undefined : 'lazy' };
      }),
      inCheckMask: "url('./assets/icons/check.svg') center/contain no-repeat",
      // Форма отзыва: раскрывается по кнопке, чтобы не занимать место у тех,
      // кто пришёл читать. Контакт обязателен — не для связи ради связи, а
      // потому что опубликовать отзыв без разрешения автора нельзя, и
      // спросить это разрешение больше негде.
      revFormOpen: this.state.revFormOpen,
      revFormDisplay: this.state.revFormOpen ? 'flex' : 'none',
      revFormOpenAttr: this.state.revFormOpen ? 'true' : 'false',
      revFormLabel: this.state.revFormOpen ? 'Свернуть форму' : 'Написать отзыв',
      revWhoHint: 'Например: руководитель НИОКР, приборостроение',
      toggleRevForm: () => (this.state.revFormOpen ? this.closeRev() : this.openRev()),
      // Окно закрывается щелчком по затемнению, но не по самому окну
      closeRevFormOnBackdrop: e => { if (e.target === e.currentTarget) this.closeRev(); },
      stopInside: e => e.stopPropagation(),
      sentReview: this.state.sentReview,
      submitReview: e => { e.preventDefault(); this.setState({ sentReview: true }, () => { const el = document.querySelector('[data-sent="review"]'); if (el) el.focus(); }); },
      reviews, revCounter: 'Отзыв: ' + REVIEWS[revAt].role + ', ' + REVIEWS[revAt].field,
      revPrev: () => this.setState(s => ({ revAt: (s.revAt - 1 + revN) % revN })),
      revNext: () => this.setState(s => ({ revAt: (s.revAt + 1) % revN })),
      navHidden: this.state.navOpen ? undefined : true,
      navOpenAttr: this.state.navOpen ? 'true' : 'false',
      toggleNav: () => this.setState(s => ({ navOpen: !s.navOpen })),
      needs: ['Ещё не определились', 'Техзадание и патентная чистота', 'НИОКР под сдачу', 'Заявка на грант или субсидию', 'Разработка в нематериальный актив', 'Рынок и решение о внедрении', 'Патентный поиск и охранные документы', 'Обоснование расходов на НИОКР'].map(label => ({ label })),
      crewMask: "url('./assets/icons/users.svg') center/contain no-repeat",
      expertMask: "url('./assets/icons/award.svg') center/contain no-repeat",
      methodMask: "url('./assets/icons/flask-conical.svg') center/contain no-repeat",
      editorMask: "url('./assets/icons/pencil-line.svg') center/contain no-repeat",
      arrowRight: "url('./assets/icons/arrow-right.svg') center/contain no-repeat",
      ...(() => {
        const t = (key, sel) => ['E-mail', 'Телефон'].map((label, i) => ({
          label, active: i === sel, inactive: i !== sel,
          pick: () => this.setState({ [key]: i })
        }));
        const a = this.state.contactTop || 0, b = this.state.contactBottom || 0;
        return {
          contactTabsTop: t('contactTop', a), contactTabsBottom: t('contactBottom', b),
          contactTypeTop: a === 0 ? 'email' : 'tel', contactTypeBottom: b === 0 ? 'email' : 'tel',
          contactAutoTop: a === 0 ? 'email' : 'tel', contactAutoBottom: b === 0 ? 'email' : 'tel',
          contactPlaceholderTop: a === 0 ? 'Ваш e-mail' : 'Ваш телефон',
          contactPlaceholderBottom: b === 0 ? 'Ваш e-mail' : 'Ваш телефон'
        };
      })(),
      trlScale, trl, trlFill, packs, catalog,
      catalogToggleLabel: this.state.allOpen ? 'Свернуть каталог' : 'Показать весь каталог',
      toggleAll: () => this.setState(s => ({ allOpen: !s.allOpen, open: s.allOpen ? { 0: true } : {} })),
      reasons: [
        ['01', 'Получатель документа фиксируется до старта', 'До согласования Задания определяем, кто принимает результат: фонд, банк, налоговая, комиссия заказчика или ведомство. Его требования становятся критерием готовности.', 'чек-лист требований получателя прикладывается к техническому заданию и к акту сдачи этапа.'],
        ['02', 'Патентный поиск идёт до утверждения техзадания', 'Сначала выясняем, свободна ли ниша, затем считаем смету на работы.', 'отчёт о патентном поиске — отдельный первый этап с собственным актом.'],
        ['03', 'Исключительные права принадлежат заказчику', 'Всё, что создано в проекте, переходит вам.', 'пункт договора об отчуждении прав, NDA с каждым исполнителем, акт передачи материалов.'],
        ['04', 'Работу ведёт отраслевой эксперт со степенью', 'Кандидат или доктор наук в вашей области с публикациями по теме проекта.', 'профиль куратора — степень, специальность, стаж и публикации по категориям журналов — вы видите до согласования Задания.'],
        ['05', 'Следующий этап оплачивается после приёмки предыдущего', 'Этап не сдан в срок — оплата за него возвращается по заявлению.', 'календарный план с датами, акт по каждому этапу, порядок возврата в договоре.'],
        ['06', 'Предмет договора — соответствие требованиям', 'Решение принимают фонд, ведомство и налоговый орган, и мы его не обещаем. Отвечаем за соответствие документа требованиям на дату подачи.', 'формулировка предмета договора и чек-лист требований получателя.']
      ].map(([num, title, text, proof], i) => {
        const open = !!this.state.mech[i];
        return {
          num, title, text, proof,
          // Изображение условия — натюрморт 150 × 150 из набора страницы
          // (Р-78), показ 96 px (до 480 px — 64 px) тегом img: ленивая
          // загрузка и чёткий масштаб вместо фона карточки (Р-802).
          img: './assets/art/mech-' + (i + 1) + '.webp',
          proofOpen: open, proofClosed: !open,
          proofExpanded: open ? 'true' : 'false',
          plusV: open ? 'none' : 'block',
          // Кнопка одна на карточку, поэтому подпись называет механизм —
          // иначе шесть кнопок «Чем закреплено» неразличимы на слух. Имя
          // начинается с видимой надписи (Р-781); раскрыто или нет, говорит
          // aria-expanded.
          proofAria: 'Чем закреплено: механизм «' + title + '»',
          proofToggle: () => this.setState(st => ({ mech: { ...st.mech, [i]: !st.mech[i] } }))
        };
      }),
      faq: [
        ['С чего начинается работа?',
         'С заявки: менеджер отвечает в течение рабочего дня и присылает NDA и проект договора — задачу обсуждаем только после подписания NDA. Затем менеджер открывает вам личный кабинет, где вы прикладываете материалы по перечню «Что подготовить». На созвоне знакомства до 20 минут менеджер и куратор — отраслевой эксперт со степенью — разбирают разработку, её стадию и получателя документа: фонд, комиссию заказчика, ведомство или налоговый орган. По итогам консультации готовим Задание: состав работ, календарный план и стоимость по этапам; вы согласуете его в кабинете, до этого работы не начинаются.'],
        ['Как заключается договор и что в нём фиксируется?',
         'С организацией заключаем договор по форме, согласованной юристом; проект договора и NDA присылаем после заявки. Реквизиты исполнителя и общие условия — в публичной оферте. В Задании к договору фиксируются состав работ, требования получателя документа, календарный план и стоимость по этапам. Изменение объёма, сроков или стоимости оформляется дополнительным соглашением.'],
        ['Что будет, если документ не примут?',
         'Предмет договора — соответствие документа требованиям получателя на дату подачи. Само решение принимают фонд, комиссия или ведомство по своему усмотрению, и его мы не обещаем. Замечания в пределах согласованного объёма отрабатываем без доплаты. Если этап не сдан в срок, оплата за него возвращается по вашему заявлению.'],
        ['Кому принадлежат права на результат?',
         'Исключительные права на всё, что создано в проекте, переходят вашей компании с подписанием акта по этапу. Заявителем и правообладателем по заявкам на охранные документы выступаете вы: мы готовим документы и сопровождаем подачу, не становясь правообладателем. Материалы проекта не используются в других работах и не публикуются как примеры.'],
        ['Как считается смета и когда платить?',
         'Стоимость складывается из состава работ и стадии готовности разработки, поэтому считается после разбора материалов — цен на сайте нет. Оплата идёт по этапам: следующий оплачивается после приёмки предыдущего. Вперёд за всю работу платить не нужно.'],
        ['Подойдут ли документы для учёта расходов на НИОКР?',
         'Комплект под учёт собираем: отчёт по ГОСТ 7.32-2017, акты сдачи-приёмки этапов, регистрационную и информационную карту НИОКТР. Решение о применении коэффициента по п. 7 ст. 262 НК РФ принимает налоговый орган; мы отвечаем за состав и оформление документов.']
      ].map(([q, a], i) => ({
        q, a,
        open: this.state.faqOpen === i,
        closed: this.state.faqOpen !== i,
        toggle: () => this.setState(s => ({ faqOpen: s.faqOpen === i ? -1 : i }))
      })),
      // Права и конфиденциальность (Р-803, раскладка — Р-814): шесть плиток
      // сеткой 3 × 2; первая — тёмная плитка «Исключительные права», остальные
      // пять — светлые; порядок, тексты, значки и номера 01—06 прежние.
      ...(() => {
        const rights = [
          ['Исключительные права', 'Права на результаты интеллектуальной деятельности переходят заказчику. Условие закреплено пунктом договора об отчуждении прав.', 'pd-asset'],
          ['Кто подписывает NDA', 'Соглашение о неразглашении подписывает каждый участник проектной команды до получения доступа к материалам.', 'pd-nda'],
          ['Материалы после проекта', 'По акту передаём материалы и удаляем рабочие копии. Срок хранения и порядок удаления записаны в договоре.', 'pd-contract'],
          ['На кого оформляется охранный документ', 'Заявитель и правообладатель — ваша компания. Мы готовим документы и сопровождаем подачу, не выступая правообладателем.', 'award'],
          ['Повторное использование', 'Материалы проекта не используются в других работах и не показываются как пример. Публичных кейсов у нас нет.', 'shield'],
          ['Служебные результаты', 'Помогаем оформить положение о служебных результатах, уведомления авторов и приказы внутри вашей компании.', 'pd-team']
        ].map(([label, text, icon], i) => ({
          label, text, num: '0' + (i + 1),
          icon: "url('./assets/icons/" + icon + ".svg') center/contain no-repeat"
        }));
        return { rightsLead: rights[0], rightsRest: rights.slice(1) };
      })(),
      afterSteps: [
        ['01', 'Заявка и ответ менеджера', 'Менеджер отвечает в течение рабочего дня, Пн⁠—⁠Пт 10:00⁠—⁠19:00, присылает NDA и проект договора; задачу обсуждаем после подписания NDA.'],
        ['02', 'Личный кабинет', 'Менеджер открывает доступ после подписания NDA, вы прикладываете материалы по перечню «Что подготовить».'],
        ['03', 'Куратор и созвон знакомства', 'Куратор — отраслевой эксперт со степенью. На созвоне знакомства до 20 минут менеджер и куратор разбирают разработку, стадию и получателя документа.'],
        ['04', 'Итог консультации и Задание', 'Состав работ, календарный план и стоимость по этапам — в Задании к договору; Задание вы согласуете в кабинете.'],
        ['05', 'Этапы с приёмкой', 'Следующий этап оплачивается после приёмки предыдущего.']
      ].map(([num, title, text]) => ({ num, title, text })),
      askFor: [
        'Описание разработки и решаемой задачи.',
        'Стадию готовности: лабораторные данные, макет, прототип, образец.',
        'Требования получателя документа: конкурс, заказчик, налоговый учёт.',
        'Имеющиеся материалы: отчёты, протоколы, патенты, черновики.'
      ].map(text => ({ text })),
      sentTop: this.state.sentTop,
      sentMain: this.state.sentMain,
      submitTop: e => { e.preventDefault(); this.setState({ sentTop: true }, () => { const el = document.querySelector('[data-sent="top"]'); if (el) el.focus(); }); },
      submitMain: e => { e.preventDefault(); this.setState({ sentMain: true }, () => { const el = document.querySelector('[data-sent="main"]'); if (el) el.focus(); }); }
    };
  }

  /**
   * Обработчик отправки из макета только поднимал флаг «отправлено».
   * Здесь он оборачивается: заявка уходит на сервер, и только успешный
   * ответ переводит форму в состояние успеха.
   */
  private wrapSubmit(key: string, original: any) {
    return async (e: any) => {
      const form: HTMLFormElement = e.currentTarget;
      const errKey = 'error' + key.slice('submit'.length);
      this.setState((s: any) => ({ __ui: { ...(s.__ui ?? {}), [errKey]: null, pending: true } }));
      const outcome = await submitLead(e, "business", key.slice('submit'.length).toLowerCase() || 'request');
      if (outcome.ok) {
        this.setState((s: any) => ({ __ui: { ...(s.__ui ?? {}), pending: false } }));
        // Заявка: благодарность всплывает поверх страницы, форма уже
        // очищена (components/LeadThanks.tsx, Р-406). Прочее — как в макете.
        const thanks = LEAD_THANKS[key];
        if (thanks && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('pd:lead-sent', { detail: { text: thanks, form } }));
          return;
        }
        if (typeof original === 'function') original({ preventDefault() {}, currentTarget: form });
        return;
      }
      this.setState((s: any) => ({
        __ui: { ...(s.__ui ?? {}), pending: false, [errKey]: outcome.message || null },
      }));
    };
  }

  render() {
    const base: any = this.renderVals ? this.renderVals() : {};
    // состояния отправки живут рядом со значениями макета, а не внутри него
    const v: any = { ...base, ...(this.state?.__ui ?? {}) };
    for (const k of Object.keys(base)) {
      if (k.startsWith('submit') && typeof base[k] === 'function') v[k] = this.wrapSubmit(k, base[k]);
    }
    // До оживления страницы обработчика отправки ещё нет: кнопка выключена,
    // и Enter форму не отправляет — заявка не уходит мимо сервера (Р-508).
    if (this.state?.__live !== true) v.pending = true;
    const {
      afterSteps,
      arrowRight,
      askFor,
      catalog,
      catalogToggleLabel,
      closeRevFormOnBackdrop,
      contactAutoBottom,
      contactAutoTop,
      contactPlaceholderBottom,
      contactPlaceholderTop,
      contactTabsBottom,
      contactTabsTop,
      contactTypeBottom,
      contactTypeTop,
      crewMask,
      editorMask,
      errorMain,
      errorReview,
      errorTop,
      expertMask,
      faq,
      inCaption,
      inCheckMask,
      inPoints,
      inShots,
      inTabKey,
      inTabLabelledBy,
      inTabs,
      inText,
      inTitle,
      methodMask,
      navHidden,
      navOpenAttr,
      needs,
      packs,
      pending,
      reasons,
      revCounter,
      revFormDisplay,
      revFormLabel,
      revFormOpenAttr,
      revNext,
      revPrev,
      reviews,
      rightsLead,
      rightsRest,
      sentMain,
      sentReview,
      sentTop,
      stopInside,
      submitMain,
      submitReview,
      submitTop,
      toggleAll,
      toggleNav,
      toggleRevForm,
      trl,
      trlFill,
      trlScale,
    } = v;
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <div style={{ position: "relative", background: "var(--pd-ink-inverse)", color: "var(--pd-ink)", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", WebkitFontSmoothing: "antialiased", overflowX: "clip" }}><div aria-hidden="true" style={{ position: "absolute", inset: "0", zIndex: "0", pointerEvents: "none", overflow: "hidden" }}><div className="pd-glow" style={{ position: "absolute", left: "calc(50% - 113px)", top: "-8px", width: "722px", height: "722px", borderRadius: "50%", background: "radial-gradient(closest-side,rgba(216,228,243,0.42),rgba(216,228,243,0))" }}></div><svg className="pd-orb pd-orb-hero" viewBox="0 0 640 580" width="1180" height="1069" fill="none" style={{ position: "absolute", right: "calc(50% - 610px - 210px)", top: "-200px" }}><g stroke="#D9E1EC" strokeWidth="1"><ellipse cx="330" cy="300" rx="120" ry="120"></ellipse><ellipse cx="330" cy="300" rx="196" ry="196"></ellipse></g><ellipse cx="330" cy="300" rx="262" ry="262" stroke="#EDF2F8" strokeWidth="1"></ellipse><circle cx="450" cy="300" r="6" fill="#D8E4F3"></circle><circle cx="330" cy="104" r="4" fill="#14417A"></circle></svg><div style={{ position: "absolute", left: "0", right: "0", top: "0", height: "1100px", backgroundImage: "radial-gradient(var(--pd-art-dot) 1px,transparent 1.2px)", backgroundSize: "34px 34px", opacity: ".4", WebkitMaskImage: "linear-gradient(180deg,#000 0%,rgba(0,0,0,.35) 46%,transparent 100%)", maskImage: "linear-gradient(180deg,#000 0%,rgba(0,0,0,.35) 46%,transparent 100%)" }}></div><div className="pd-glow" style={{ position: "absolute", left: "calc(50% - 1020px)", top: "1070px", width: "680px", height: "680px", borderRadius: "50%", background: "radial-gradient(closest-side,rgba(216,228,243,0.45),rgba(216,228,243,0))" }}></div><svg className="pd-orb" viewBox="0 0 640 580" width="896" height="812" fill="none" style={{ position: "absolute", left: "calc(50% - 1142px)", top: "1000px" }}><g stroke="#E3E9F1" strokeWidth="1"><ellipse cx="330" cy="300" rx="120" ry="120"></ellipse><ellipse cx="330" cy="300" rx="196" ry="196"></ellipse></g><ellipse cx="330" cy="300" rx="262" ry="262" stroke="#EFF1F4" strokeWidth="1" strokeDasharray="4 6"></ellipse><circle cx="480" cy="300" r="5" fill="#D3DEEC"></circle><circle cx="330" cy="64" r="4" fill="#B4C9E5"></circle></svg><div className="pd-glow" style={{ position: "absolute", left: "calc(50% + 360px)", top: "2120px", width: "680px", height: "680px", borderRadius: "50%", background: "radial-gradient(closest-side,rgba(216,228,243,0.45),rgba(216,228,243,0))" }}></div><svg className="pd-orb pd-orb-b" viewBox="0 0 640 580" width="896" height="812" fill="none" style={{ position: "absolute", left: "calc(50% + 238px)", top: "2050px" }}><g stroke="#E3E9F1" strokeWidth="1"><ellipse cx="330" cy="300" rx="120" ry="120"></ellipse><ellipse cx="330" cy="300" rx="196" ry="196"></ellipse></g><ellipse cx="330" cy="300" rx="262" ry="262" stroke="#EFF1F4" strokeWidth="1" strokeDasharray="4 6"></ellipse><circle cx="480" cy="300" r="5" fill="#D3DEEC"></circle><circle cx="330" cy="64" r="4" fill="#B4C9E5"></circle></svg><div className="pd-glow" style={{ position: "absolute", left: "calc(50% - 1020px)", top: "3170px", width: "680px", height: "680px", borderRadius: "50%", background: "radial-gradient(closest-side,rgba(216,228,243,0.45),rgba(216,228,243,0))" }}></div><svg className="pd-orb" viewBox="0 0 640 580" width="896" height="812" fill="none" style={{ position: "absolute", left: "calc(50% - 1142px)", top: "3100px" }}><g stroke="#E3E9F1" strokeWidth="1"><ellipse cx="330" cy="300" rx="120" ry="120"></ellipse><ellipse cx="330" cy="300" rx="196" ry="196"></ellipse></g><ellipse cx="330" cy="300" rx="262" ry="262" stroke="#EFF1F4" strokeWidth="1" strokeDasharray="4 6"></ellipse><circle cx="480" cy="300" r="5" fill="#D3DEEC"></circle><circle cx="330" cy="64" r="4" fill="#B4C9E5"></circle></svg><div className="pd-glow" style={{ position: "absolute", left: "calc(50% + 360px)", top: "4220px", width: "680px", height: "680px", borderRadius: "50%", background: "radial-gradient(closest-side,rgba(216,228,243,0.45),rgba(216,228,243,0))" }}></div><svg className="pd-orb pd-orb-b" viewBox="0 0 640 580" width="896" height="812" fill="none" style={{ position: "absolute", left: "calc(50% + 238px)", top: "4150px" }}><g stroke="#E3E9F1" strokeWidth="1"><ellipse cx="330" cy="300" rx="120" ry="120"></ellipse><ellipse cx="330" cy="300" rx="196" ry="196"></ellipse></g><ellipse cx="330" cy="300" rx="262" ry="262" stroke="#EFF1F4" strokeWidth="1" strokeDasharray="4 6"></ellipse><circle cx="480" cy="300" r="5" fill="#D3DEEC"></circle><circle cx="330" cy="64" r="4" fill="#B4C9E5"></circle></svg><div className="pd-glow" style={{ position: "absolute", left: "calc(50% - 1020px)", top: "5270px", width: "680px", height: "680px", borderRadius: "50%", background: "radial-gradient(closest-side,rgba(216,228,243,0.45),rgba(216,228,243,0))" }}></div><svg className="pd-orb" viewBox="0 0 640 580" width="896" height="812" fill="none" style={{ position: "absolute", left: "calc(50% - 1142px)", top: "5200px" }}><g stroke="#E3E9F1" strokeWidth="1"><ellipse cx="330" cy="300" rx="120" ry="120"></ellipse><ellipse cx="330" cy="300" rx="196" ry="196"></ellipse></g><ellipse cx="330" cy="300" rx="262" ry="262" stroke="#EFF1F4" strokeWidth="1" strokeDasharray="4 6"></ellipse><circle cx="480" cy="300" r="5" fill="#D3DEEC"></circle><circle cx="330" cy="64" r="4" fill="#B4C9E5"></circle></svg><div className="pd-glow" style={{ position: "absolute", left: "calc(50% + 360px)", top: "6320px", width: "680px", height: "680px", borderRadius: "50%", background: "radial-gradient(closest-side,rgba(216,228,243,0.45),rgba(216,228,243,0))" }}></div><svg className="pd-orb pd-orb-b" viewBox="0 0 640 580" width="896" height="812" fill="none" style={{ position: "absolute", left: "calc(50% + 238px)", top: "6250px" }}><g stroke="#E3E9F1" strokeWidth="1"><ellipse cx="330" cy="300" rx="120" ry="120"></ellipse><ellipse cx="330" cy="300" rx="196" ry="196"></ellipse></g><ellipse cx="330" cy="300" rx="262" ry="262" stroke="#EFF1F4" strokeWidth="1" strokeDasharray="4 6"></ellipse><circle cx="480" cy="300" r="5" fill="#D3DEEC"></circle><circle cx="330" cy="64" r="4" fill="#B4C9E5"></circle></svg><div className="pd-glow" style={{ position: "absolute", left: "calc(50% - 1020px)", top: "7370px", width: "680px", height: "680px", borderRadius: "50%", background: "radial-gradient(closest-side,rgba(216,228,243,0.45),rgba(216,228,243,0))" }}></div><svg className="pd-orb" viewBox="0 0 640 580" width="896" height="812" fill="none" style={{ position: "absolute", left: "calc(50% - 1142px)", top: "7300px" }}><g stroke="#E3E9F1" strokeWidth="1"><ellipse cx="330" cy="300" rx="120" ry="120"></ellipse><ellipse cx="330" cy="300" rx="196" ry="196"></ellipse></g><ellipse cx="330" cy="300" rx="262" ry="262" stroke="#EFF1F4" strokeWidth="1" strokeDasharray="4 6"></ellipse><circle cx="480" cy="300" r="5" fill="#D3DEEC"></circle><circle cx="330" cy="64" r="4" fill="#B4C9E5"></circle></svg><div className="pd-glow" style={{ position: "absolute", left: "calc(50% + 360px)", top: "8420px", width: "680px", height: "680px", borderRadius: "50%", background: "radial-gradient(closest-side,rgba(216,228,243,0.45),rgba(216,228,243,0))" }}></div><svg className="pd-orb pd-orb-b" viewBox="0 0 640 580" width="896" height="812" fill="none" style={{ position: "absolute", left: "calc(50% + 238px)", top: "8350px" }}><g stroke="#E3E9F1" strokeWidth="1"><ellipse cx="330" cy="300" rx="120" ry="120"></ellipse><ellipse cx="330" cy="300" rx="196" ry="196"></ellipse></g><ellipse cx="330" cy="300" rx="262" ry="262" stroke="#EFF1F4" strokeWidth="1" strokeDasharray="4 6"></ellipse><circle cx="480" cy="300" r="5" fill="#D3DEEC"></circle><circle cx="330" cy="64" r="4" fill="#B4C9E5"></circle></svg><div className="pd-glow" style={{ position: "absolute", left: "calc(50% - 1020px)", top: "9470px", width: "680px", height: "680px", borderRadius: "50%", background: "radial-gradient(closest-side,rgba(216,228,243,0.45),rgba(216,228,243,0))" }}></div><svg className="pd-orb" viewBox="0 0 640 580" width="896" height="812" fill="none" style={{ position: "absolute", left: "calc(50% - 1142px)", top: "9400px" }}><g stroke="#E3E9F1" strokeWidth="1"><ellipse cx="330" cy="300" rx="120" ry="120"></ellipse><ellipse cx="330" cy="300" rx="196" ry="196"></ellipse></g><ellipse cx="330" cy="300" rx="262" ry="262" stroke="#EFF1F4" strokeWidth="1" strokeDasharray="4 6"></ellipse><circle cx="480" cy="300" r="5" fill="#D3DEEC"></circle><circle cx="330" cy="64" r="4" fill="#B4C9E5"></circle></svg></div><a className="pd-skip" href="#main">Перейти к содержанию</a><header className="bp-pad bp-head" data-pd-stick={true} style={{ position: "relative", zIndex: "5", maxWidth: "1220px", margin: "0 auto", padding: "24px 30px 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "24px" }}><a className="bp-logo x1 x2" href="/" aria-label="ProDisser — на главную" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", flex: "0 0 auto", padding: "6px 10px", margin: "-6px -10px", borderRadius: "10px", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "27px", lineHeight: "1.24", fontWeight: "600", letterSpacing: ".005em", transition: "background 180ms cubic-bezier(.2,0,.2,1)" }}><span style={{ color: "var(--pd-accent)" }}>PRO</span><span style={{ color: "var(--pd-ink)" }}>DISSER</span></a><div className="bp-head" style={{ display: "flex", alignItems: "center", gap: "24px" }}><button className="bp-burger x3 x4" type="button" aria-expanded={navOpenAttr} aria-controls="bp-nav" aria-label="Меню разделов" onClick={toggleNav} style={{ appearance: "none", cursor: "pointer", flex: "0 0 44px", width: "44px", height: "44px", border: "1px solid var(--pd-border)", borderRadius: "10px", background: "var(--pd-ink-inverse)", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "4px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}><span aria-hidden="true" style={{ display: "block", width: "18px", height: "2px", borderRadius: "999px", background: "var(--pd-ink)" }}></span><span aria-hidden="true" style={{ display: "block", width: "18px", height: "2px", borderRadius: "999px", background: "var(--pd-ink)" }}></span><span aria-hidden="true" style={{ display: "block", width: "18px", height: "2px", borderRadius: "999px", background: "var(--pd-ink)" }}></span></button><nav className="bp-nav" id="bp-nav" hidden={navHidden} aria-label="Разделы страницы"><a className="x5" href="#trl" style={{ display: "inline-flex", alignItems: "center", height: "44px", boxSizing: "border-box", padding: "0 10px", border: "1px solid transparent", borderRadius: "999px", fontSize: "13px", lineHeight: "1.4", fontWeight: "500", color: "var(--pd-ink-secondary)", whiteSpace: "nowrap", transition: "color 180ms cubic-bezier(.2,0,.2,1),border-color 180ms cubic-bezier(.2,0,.2,1)" }}>Уровень готовности</a><a className="x5" href="#packs" style={{ display: "inline-flex", alignItems: "center", height: "44px", boxSizing: "border-box", padding: "0 10px", border: "1px solid transparent", borderRadius: "999px", fontSize: "13px", lineHeight: "1.4", fontWeight: "500", color: "var(--pd-ink-secondary)", whiteSpace: "nowrap", transition: "color 180ms cubic-bezier(.2,0,.2,1),border-color 180ms cubic-bezier(.2,0,.2,1)" }}>Пять пакетов</a><a className="x5" href="#catalog" style={{ display: "inline-flex", alignItems: "center", height: "44px", boxSizing: "border-box", padding: "0 10px", border: "1px solid transparent", borderRadius: "999px", fontSize: "13px", lineHeight: "1.4", fontWeight: "500", color: "var(--pd-ink-secondary)", whiteSpace: "nowrap", transition: "color 180ms cubic-bezier(.2,0,.2,1),border-color 180ms cubic-bezier(.2,0,.2,1)" }}>Каталог работ</a><a className="x5" href="#rights" style={{ display: "inline-flex", alignItems: "center", height: "44px", boxSizing: "border-box", padding: "0 10px", border: "1px solid transparent", borderRadius: "999px", fontSize: "13px", lineHeight: "1.4", fontWeight: "500", color: "var(--pd-ink-secondary)", whiteSpace: "nowrap", transition: "color 180ms cubic-bezier(.2,0,.2,1),border-color 180ms cubic-bezier(.2,0,.2,1)" }}>Права на результат</a><a className="x6" href="/experts" style={{ display: "inline-flex", alignItems: "center", height: "44px", boxSizing: "border-box", padding: "0 10px", border: "1px solid transparent", borderRadius: "999px", fontSize: "13px", lineHeight: "1.4", fontWeight: "500", color: "var(--pd-ink-secondary)", whiteSpace: "nowrap", transition: "color 180ms cubic-bezier(.2,0,.2,1),border-color 180ms cubic-bezier(.2,0,.2,1)" }}>Стать экспертом</a><a className="x6" href="/cabinet" style={{ display: "inline-flex", alignItems: "center", height: "44px", boxSizing: "border-box", padding: "0 10px", border: "1px solid transparent", borderRadius: "999px", fontSize: "13px", lineHeight: "1.4", fontWeight: "500", color: "var(--pd-ink-secondary)", whiteSpace: "nowrap", transition: "color 180ms cubic-bezier(.2,0,.2,1),border-color 180ms cubic-bezier(.2,0,.2,1)" }}>Личный кабинет</a></nav><a className="bp-cta x7 x4" data-pd-stick-cta={true} href="#request" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", background: "var(--pd-ink)", color: "var(--pd-ink-inverse)", fontSize: "13px", fontWeight: "600", padding: "12px 24px", borderRadius: "999px", transition: "background 180ms cubic-bezier(.2,0,.2,1),color 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>Оставить заявку</a></div></header><main id="main"><section className="bp-pad" style={{ position: "relative", zIndex: "1", maxWidth: "1220px", margin: "0 auto", padding: "64px 30px clamp(56px,5vw,72px)" }}><div className="bp-hero" style={{ gap: "44px", alignItems: "start" }}><div style={{ minWidth: "0" }}><span style={{ display: "inline-block", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)", marginBottom: "24px" }}>Бизнесу и стартап-командам</span><h1 style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "clamp(28px,3vw,40px)", lineHeight: "1.4", fontWeight: "500", letterSpacing: "-.015em", color: "var(--pd-ink)", maxWidth: "22ch", textWrap: "balance" }}><span style={{ display: "block" }}>Оформить разработку по требованиям</span><span style={{ background: "var(--pd-accent-mark)", borderRadius: "6px", boxShadow: "-10px 0 0 var(--pd-accent-mark),10px 0 0 var(--pd-accent-mark)", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>приёмки, гранта и патента</span></h1><p style={{ margin: "24px 0 0", fontSize: "16px", lineHeight: "1.6", color: "var(--pd-ink-secondary)", maxWidth: "52ch" }}>Техническое задание, отчётность по НИОКР, заявки на патенты и гранты, постановка прав на баланс — по действующим ГОСТ и требованиям получателя документа.</p><form onSubmit={submitTop} style={{ margin: "36px 0 0", maxWidth: "520px", display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "12px" }} method="post"><input type="text" name="company_website" tabIndex="-1" autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", opacity: "0", pointerEvents: "none" }} /><div role="group" aria-label="Способ связи для заявки" style={{ display: "inline-flex", gap: "4px", padding: "4px", background: "var(--pd-surface-quiet)", border: "1px solid var(--pd-border)", borderRadius: "999px", alignSelf: "flex-start", justifySelf: "start", flex: "0 0 auto", gridColumn: "span 2" }}>{(contactTabsTop ?? []).map((c: any, _i0: number) => (<React.Fragment key={_i0}>{c.active ? (<><button className="x8 x4" type="button" aria-pressed="true" onClick={c.pick} style={{ appearance: "none", border: "0", cursor: "pointer", background: "var(--pd-ink)", color: "var(--pd-ink-inverse)", borderRadius: "999px", padding: "0 20px", minHeight: "44px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.4", fontWeight: "600", transition: "background 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>{c.label}</button></>) : null}{c.inactive ? (<><button className="x9 x4" type="button" aria-pressed="false" onClick={c.pick} style={{ appearance: "none", border: "0", cursor: "pointer", background: "transparent", color: "var(--pd-ink-muted)", borderRadius: "999px", padding: "0 20px", minHeight: "44px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.4", fontWeight: "600", transition: "background 180ms cubic-bezier(.2,0,.2,1),color 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>{c.label}</button></>) : null}</React.Fragment>))}</div><input className="xa" name="name" type="text" autoComplete="name" required={true} placeholder="ФИО" aria-label="ФИО" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /><input className="xa" name="contact" type={contactTypeTop} autoComplete={contactAutoTop} required={true} placeholder={contactPlaceholderTop} aria-label={contactPlaceholderTop} style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /><select className="xa" name="need" aria-label="Что нужно" style={{ gridColumn: "span 2", height: "48px", boxSizing: "border-box", padding: "0 12px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }}>{(needs ?? []).map((n: any, _i0: number) => (<React.Fragment key={_i0}><option value={n.label}>{n.label}</option></React.Fragment>))}</select><div className="pd-agree" style={{ display: "flex", flexDirection: "column", gap: "0", gridColumn: "span 2" }}><label htmlFor="bp-consent-top" style={{ display: "flex", minHeight: "32px", alignItems: "center", gap: "8px", fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-muted)", cursor: "pointer" }}><input id="bp-consent-top" name="consent" type="checkbox" required={true} style={{ width: "16px", height: "16px", flex: "0 0 16px", margin: "0", cursor: "pointer" }} /><span>Даю <a className="xb" href="/consent" target="_blank" rel="noopener" style={{ color: "var(--pd-accent)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>согласие на обработку персональных данных</a></span></label><label htmlFor="bp-terms-top" style={{ display: "flex", minHeight: "32px", alignItems: "center", gap: "8px", fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-muted)", cursor: "pointer" }}><input id="bp-terms-top" name="terms" type="checkbox" required={true} style={{ width: "16px", height: "16px", flex: "0 0 16px", margin: "0", cursor: "pointer" }} /><span>Принимаю <a className="xb" href="/offer" target="_blank" rel="noopener" style={{ color: "var(--pd-accent)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>оферту</a> и <a className="xb" href="/privacy" target="_blank" rel="noopener" style={{ color: "var(--pd-accent)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>политику</a></span></label></div><button className="x8 x4" type="submit" disabled={pending} style={{ gridColumn: "span 2", justifySelf: "start", appearance: "none", border: "0", cursor: "pointer", background: "var(--pd-ink)", color: "var(--pd-ink-inverse)", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "14px", fontWeight: "600", padding: "14px 32px", borderRadius: "999px", transition: "background 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>Оставить заявку</button>{sentTop ? (<><div role="status" tabIndex={-1} data-sent="top" style={{ gridColumn: "span 2", display: "flex", gap: "8px", alignItems: "flex-start", background: "var(--pd-ok-bg)", border: "1px solid var(--pd-ok-border)", borderRadius: "10px", padding: "12px 16px" }}><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ok-ink)" }}>Заявка принята. Ответим в рабочее время, Пн—Пт 10:00—19:00.</span></div><div data-next="top" style={{ marginTop: "12px", gridColumn: "span 2", border: "1px solid var(--pd-border)", borderRadius: "10px", background: "var(--pd-surface-quiet)", padding: "12px 16px" }}><span style={{ display: "block", fontSize: "14px", lineHeight: "1.4", fontWeight: "600", color: "var(--pd-ink)", marginBottom: "8px" }}>Что будет дальше</span><ol style={{ margin: "0", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px", fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-secondary)" }}><li>Менеджер разберёт заявку и ответит в течение рабочего дня</li><li>Свяжемся удобным вам способом, чтобы уточнить задачу</li><li>Менеджер откроет вам личный кабинет — ссылка придёт на почту; там вы приложите материалы по перечню «Что подготовить»</li></ol></div></>) : null}{errorTop ? (<><div role="alert" style={{ gridColumn: "span 2", display: "flex", gap: "8px", alignItems: "flex-start", background: "var(--pd-err-bg)", border: "1px solid var(--pd-err-border)", borderRadius: "10px", padding: "12px 16px" }}><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-err-ink)" }}>{errorTop}</span></div></>) : null}</form></div><div style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "24px" }}><div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "20px", paddingTop: "8px" }}><div style={{ display: "flex", flexDirection: "column", gap: "2px", maxWidth: "178px", marginTop: "-10px", alignItems: "center", textAlign: "center" }}><span style={{ width: "178px", height: "178px", borderRadius: "50%", background: "var(--pd-accent-mark)", overflow: "hidden", display: "block" }}><PhotoSlot slotId="bp-photo-1" shape="circle" fit="cover" alt="Куратор — отраслевой эксперт со степенью" placeholder="Фото: куратор" priority={ABOVE_THE_FOLD.has("bp-photo-1")} style={{ width: "178px", height: "178px" }} /></span><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-muted)" }}>Куратор — отраслевой эксперт со&nbsp;степенью</span></div><div style={{ display: "flex", flexDirection: "column", gap: "2px", maxWidth: "122px", paddingTop: "96px", alignItems: "center", textAlign: "center" }}><span style={{ width: "122px", height: "122px", borderRadius: "50%", background: "var(--pd-accent-mark)", overflow: "hidden", display: "block" }}><PhotoSlot slotId="bp-photo-2" shape="circle" fit="cover" alt="Менеджер проекта ведёт приёмку этапов" placeholder="Фото: менеджер" priority={ABOVE_THE_FOLD.has("bp-photo-2")} style={{ width: "122px", height: "122px" }} /></span><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-muted)" }}>Менеджер проекта</span></div></div><div className="bp-support" style={{ gap: "12px", paddingTop: "8px" }}><a className="pd-lift xc xd" href="#catalog" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "10px", boxSizing: "border-box", background: "var(--pd-accent-deep)", border: "1px solid var(--pd-accent-deep)", borderRadius: "14px", padding: "16px", minHeight: "116px", textDecoration: "none", transition: "background 180ms cubic-bezier(.2,0,.2,1),border-color 180ms cubic-bezier(.2,0,.2,1)" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "22px", lineHeight: "1.24", fontWeight: "500", letterSpacing: "-.01em", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: "var(--pd-ink-inverse)" }}>52 позиции</span><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-accent-edge)" }}>в семи направлениях — каталог открыт целиком, без заявки</span><span style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-accent-edge)" }}>Каталог работ<span aria-hidden="true" style={{ width: "14px", height: "14px", flex: "0 0 14px", display: "block", background: "var(--pd-accent-edge)", WebkitMask: "url('./assets/icons/arrow-right.svg') center/contain no-repeat", mask: "url('./assets/icons/arrow-right.svg') center/contain no-repeat" }}></span></span></a><a className="pd-lift xe xf" href="#trl" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "10px", boxSizing: "border-box", background: "var(--pd-accent-tint)", border: "1px solid var(--pd-accent-mark)", borderRadius: "14px", padding: "16px", minHeight: "116px", textDecoration: "none", transition: "background 180ms cubic-bezier(.2,0,.2,1),border-color 180ms cubic-bezier(.2,0,.2,1)" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "22px", lineHeight: "1.24", fontWeight: "500", letterSpacing: "-.01em", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: "var(--pd-ink)" }}>9 уровней</span><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-secondary)" }}>готовности технологии по <span style={{ whiteSpace: "nowrap" }}>ГОСТ Р 58048-2017</span></span><span style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-accent)" }}>Шкала УГТ<span aria-hidden="true" style={{ width: "14px", height: "14px", flex: "0 0 14px", display: "block", background: "var(--pd-accent)", WebkitMask: "url('./assets/icons/arrow-right.svg') center/contain no-repeat", mask: "url('./assets/icons/arrow-right.svg') center/contain no-repeat" }}></span></span></a><a className="pd-lift xg xh" href="#packs" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "10px", boxSizing: "border-box", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "14px", padding: "16px", minHeight: "116px", textDecoration: "none", boxShadow: "0 1px 2px rgba(20,22,28,.05)", transition: "background 180ms cubic-bezier(.2,0,.2,1),border-color 180ms cubic-bezier(.2,0,.2,1)" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "22px", lineHeight: "1.24", fontWeight: "500", letterSpacing: "-.01em", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: "var(--pd-ink)" }}>5 пакетов</span><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-secondary)" }}>от техзадания до постановки прав на баланс</span><span style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-accent)" }}>Предложения и сроки<span aria-hidden="true" style={{ width: "14px", height: "14px", flex: "0 0 14px", display: "block", background: "var(--pd-accent)", WebkitMask: "url('./assets/icons/arrow-right.svg') center/contain no-repeat", mask: "url('./assets/icons/arrow-right.svg') center/contain no-repeat" }}></span></span></a></div></div></div></section><section className="bp-pad" style={{ position: "relative", zIndex: "1", maxWidth: "1220px", margin: "clamp(72px,7vw,112px) auto 0", padding: "0 30px" }}><div className="bp-team" style={{ gap: "40px", alignItems: "start" }}><div style={{ display: "flex", flexDirection: "column", gap: "24px" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Команда</span><h2 style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "clamp(26px,2.4vw,34px)", lineHeight: "1.24", fontWeight: "500", letterSpacing: "-.012em", color: "var(--pd-ink)", maxWidth: "24ch", textWrap: "pretty" }}>Кто работает над проектом</h2><p style={{ margin: "0", fontSize: "16px", lineHeight: "1.6", color: "var(--pd-ink-secondary)", maxWidth: "40ch" }}>За проектом закреплены четверо: менеджер, отраслевой эксперт, методолог и научный редактор. Каждый отвечает за свой участок.</p><div style={{ display: "flex", flexDirection: "column", gap: "12px" }}><div style={{ display: "flex", alignItems: "baseline", gap: "14px" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.5", letterSpacing: ".06em", color: "var(--pd-accent)", flex: "0 0 auto" }}>С 2016</span><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-secondary)" }}>научный коллектив ведёт НИОКР и заявки по всей России</span></div><div style={{ display: "flex", alignItems: "baseline", gap: "14px" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.5", letterSpacing: ".06em", color: "var(--pd-accent)", flex: "0 0 auto" }}>04</span><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-secondary)" }}>специалиста закрепляем за проектом до сдачи результата</span></div></div><div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}><span style={{ background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "999px", padding: "8px 14px", fontSize: "12px", lineHeight: "1.4", fontWeight: "500", color: "var(--pd-ink)" }}>НИОКР и отчётность</span><span style={{ background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "999px", padding: "8px 14px", fontSize: "12px", lineHeight: "1.4", fontWeight: "500", color: "var(--pd-ink)" }}>Патентный поиск</span><span style={{ background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "999px", padding: "8px 14px", fontSize: "12px", lineHeight: "1.4", fontWeight: "500", color: "var(--pd-ink)" }}>Оформление прав</span><span style={{ background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "999px", padding: "8px 14px", fontSize: "12px", lineHeight: "1.4", fontWeight: "500", color: "var(--pd-ink)" }}>Гранты и субсидии</span><span style={{ background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "999px", padding: "8px 14px", fontSize: "12px", lineHeight: "1.4", fontWeight: "500", color: "var(--pd-ink)" }}>Приёмка этапов</span><span style={{ background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "999px", padding: "8px 14px", fontSize: "12px", lineHeight: "1.4", fontWeight: "500", color: "var(--pd-ink)" }}>Обоснование внедрения</span></div><a className="x7 x4" href="#request" style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "12px", background: "var(--pd-ink)", color: "var(--pd-ink-inverse)", fontSize: "15px", fontWeight: "600", padding: "14px 32px", borderRadius: "999px", transition: "background 180ms cubic-bezier(.2,0,.2,1),color 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>Обсудить проект<span aria-hidden="true" style={{ width: "15px", height: "15px", display: "block", background: "var(--pd-ink-inverse)", WebkitMask: arrowRight, mask: arrowRight }}></span></a></div><div className="bp-orbit" style={{ justifySelf: "stretch", position: "relative", width: "100%", aspectRatio: "648.388 / 650" }}><div style={{ position: "absolute", left: "0", top: "0", width: "98.482%", height: "100%", borderRadius: "50%", background: "radial-gradient(circle,rgba(216,228,243,.62) 0%,rgba(180,201,229,.16) 58%,rgba(255,255,255,0) 74%)" }}></div><div className="bp-ring" style={{ position: "absolute", left: "18.969%", top: "19.385%", width: "60.547%", height: "61.231%", borderRadius: "50%", border: "1px dashed var(--pd-accent-mark)", boxSizing: "border-box" }}></div><div className="bp-ring" style={{ position: "absolute", left: "12.747%", top: "13.077%", width: "73.142%", height: "74.000%", borderRadius: "50%", border: "1px dashed var(--pd-art-mark)", boxSizing: "border-box" }}></div><div className="bp-ring" style={{ position: "absolute", left: "7.284%", top: "7.385%", width: "84.067%", height: "85.231%", borderRadius: "50%", border: "1px dashed var(--pd-border)", boxSizing: "border-box" }}></div><div className="bp-core" style={{ position: "absolute", left: "34.559%", top: "35.026%", width: "29.531%", height: "30.101%", borderRadius: "50%", background: "var(--pd-accent-mark)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: "76%", display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-accent)" }}>Заказчик</span><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "26px", lineHeight: "1.24", fontWeight: "500", letterSpacing: "-.02em", textAlign: "center", color: "var(--pd-ink)" }}>Вы</span><span style={{ alignSelf: "stretch", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.5", textAlign: "center", color: "var(--pd-ink-secondary)" }}>Ставите задачу и принимаете этапы</span></div></div><div className="bp-crew" style={{ position: "absolute", left: "4.396%", top: "14.154%", width: "31.26%", minWidth: "186px", display: "flex", flexDirection: "column", alignItems: "stretch" }}><img className="bp-crewfig" src="./assets/crew/manager.webp" alt="" aria-hidden="true" width="260" height="440" loading="lazy" decoding="async" /><div className="bp-crewcard pd-lift" style={{ minHeight: "138px", boxSizing: "border-box", border: "1px solid var(--pd-border)", borderRadius: "14px", background: "var(--pd-ink-inverse)", boxShadow: "0 6px 14px rgba(20,22,28,.06),0 1px 2px rgba(20,22,28,.05)", display: "flex", flexDirection: "column", gap: "10px", padding: "16px 18px 18px", alignItems: "flex-start", transition: "box-shadow 200ms cubic-bezier(.2,0,.2,1),border-color 200ms cubic-bezier(.2,0,.2,1)" }}><div style={{ display: "flex", flexDirection: "row", gap: "10px", alignItems: "center", alignSelf: "stretch" }}><span aria-hidden="true" style={{ width: "26px", height: "26px", flex: "0 0 26px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--pd-accent)" }}><span style={{ width: "14px", height: "14px", display: "block", background: "var(--pd-ink-inverse)", WebkitMask: crewMask, mask: crewMask }}></span></span><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.5", fontWeight: "600", color: "var(--pd-ink)" }}>Менеджер</span><span style={{ marginLeft: "auto", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", color: "var(--pd-ink-muted)" }}>01</span></div><span style={{ alignSelf: "stretch", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.5", color: "var(--pd-ink-secondary)" }}>Держит календарный план и ведёт приёмку этапов.</span></div></div><div className="bp-crew" style={{ position: "absolute", left: "55.677%", top: "7.077%", width: "31.26%", minWidth: "186px", display: "flex", flexDirection: "column", alignItems: "stretch" }}><img className="bp-crewfig" src="./assets/crew/method.webp" alt="" aria-hidden="true" width="218" height="440" loading="lazy" decoding="async" /><div className="bp-crewcard pd-lift" style={{ minHeight: "138px", boxSizing: "border-box", border: "1px solid var(--pd-border)", borderRadius: "14px", background: "var(--pd-ink-inverse)", boxShadow: "0 6px 14px rgba(20,22,28,.06),0 1px 2px rgba(20,22,28,.05)", display: "flex", flexDirection: "column", gap: "10px", padding: "16px 18px 18px", alignItems: "flex-start", transition: "box-shadow 200ms cubic-bezier(.2,0,.2,1),border-color 200ms cubic-bezier(.2,0,.2,1)" }}><div style={{ display: "flex", flexDirection: "row", gap: "10px", alignItems: "center", alignSelf: "stretch" }}><span aria-hidden="true" style={{ width: "26px", height: "26px", flex: "0 0 26px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--pd-accent)" }}><span style={{ width: "14px", height: "14px", display: "block", background: "var(--pd-ink-inverse)", WebkitMask: methodMask, mask: methodMask }}></span></span><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.5", fontWeight: "600", color: "var(--pd-ink)" }}>Методолог</span><span style={{ marginLeft: "auto", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", color: "var(--pd-ink-muted)" }}>02</span></div><span style={{ alignSelf: "stretch", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.5", color: "var(--pd-ink-secondary)" }}>Выстраивает структуру исследования и программу испытаний.</span></div></div><div className="bp-crew" style={{ position: "absolute", left: "0.617%", top: "63.385%", width: "31.26%", minWidth: "186px", display: "flex", flexDirection: "column", alignItems: "stretch" }}><img className="bp-crewfig" src="./assets/crew/editor.webp" alt="" aria-hidden="true" width="212" height="440" loading="lazy" decoding="async" /><div className="bp-crewcard pd-lift" style={{ minHeight: "138px", boxSizing: "border-box", border: "1px solid var(--pd-border)", borderRadius: "14px", background: "var(--pd-ink-inverse)", boxShadow: "0 6px 14px rgba(20,22,28,.06),0 1px 2px rgba(20,22,28,.05)", display: "flex", flexDirection: "column", gap: "10px", padding: "16px 18px 18px", alignItems: "flex-start", transition: "box-shadow 200ms cubic-bezier(.2,0,.2,1),border-color 200ms cubic-bezier(.2,0,.2,1)" }}><div style={{ display: "flex", flexDirection: "row", gap: "10px", alignItems: "center", alignSelf: "stretch" }}><span aria-hidden="true" style={{ width: "26px", height: "26px", flex: "0 0 26px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--pd-accent)" }}><span style={{ width: "14px", height: "14px", display: "block", background: "var(--pd-ink-inverse)", WebkitMask: editorMask, mask: editorMask }}></span></span><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.5", fontWeight: "600", color: "var(--pd-ink)" }}>Научный редактор</span><span style={{ marginLeft: "auto", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", color: "var(--pd-ink-muted)" }}>03</span></div><span style={{ alignSelf: "stretch", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.5", color: "var(--pd-ink-secondary)" }}>Проверяет логику, оформление и соответствие требованиям получателя.</span></div></div><div className="bp-crew" style={{ position: "absolute", left: "55.677%", top: "68.923%", width: "31.26%", minWidth: "186px", display: "flex", flexDirection: "column", alignItems: "stretch" }}><img className="bp-crewfig" src="./assets/crew/expert.webp" alt="" aria-hidden="true" width="226" height="440" loading="lazy" decoding="async" /><div className="bp-crewcard pd-lift" style={{ minHeight: "138px", boxSizing: "border-box", border: "1px solid var(--pd-border)", borderRadius: "14px", background: "var(--pd-ink-inverse)", boxShadow: "0 6px 14px rgba(20,22,28,.06),0 1px 2px rgba(20,22,28,.05)", display: "flex", flexDirection: "column", gap: "10px", padding: "16px 18px 18px", alignItems: "flex-start", transition: "box-shadow 200ms cubic-bezier(.2,0,.2,1),border-color 200ms cubic-bezier(.2,0,.2,1)" }}><div style={{ display: "flex", flexDirection: "row", gap: "10px", alignItems: "center", alignSelf: "stretch" }}><span aria-hidden="true" style={{ width: "26px", height: "26px", flex: "0 0 26px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--pd-accent)" }}><span style={{ width: "14px", height: "14px", display: "block", background: "var(--pd-ink-inverse)", WebkitMask: expertMask, mask: expertMask }}></span></span><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.5", fontWeight: "600", color: "var(--pd-ink)" }}>Эксперт по специальности</span><span style={{ marginLeft: "auto", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", color: "var(--pd-ink-muted)" }}>04</span></div><span style={{ alignSelf: "stretch", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.5", color: "var(--pd-ink-secondary)" }}>Ведёт содержательную часть: расчёты, эксперимент, обоснование.</span></div></div><div className="bp-dot" style={{ position: "absolute", left: "23.307%", top: "31.308%", width: "15px", height: "15px", borderRadius: "50%", background: "var(--pd-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ width: "4.4px", height: "4.4px", borderRadius: "50%", background: "var(--pd-ink-inverse)", display: "block" }}></span></div><div className="bp-dot" style={{ position: "absolute", left: "70.887%", top: "28.462%", width: "15px", height: "15px", borderRadius: "50%", background: "var(--pd-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ width: "4.4px", height: "4.4px", borderRadius: "50%", background: "var(--pd-ink-inverse)", display: "block" }}></span></div><div className="bp-dot" style={{ position: "absolute", left: "22.536%", top: "64.769%", width: "15px", height: "15px", borderRadius: "50%", background: "var(--pd-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ width: "4.4px", height: "4.4px", borderRadius: "50%", background: "var(--pd-ink-inverse)", display: "block" }}></span></div><div className="bp-dot" style={{ position: "absolute", left: "71.581%", top: "68.000%", width: "15px", height: "15px", borderRadius: "50%", background: "var(--pd-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ width: "4.4px", height: "4.4px", borderRadius: "50%", background: "var(--pd-ink-inverse)", display: "block" }}></span></div></div></div></section><section className="bp-pad" id="trl" style={{ position: "relative", zIndex: "1", maxWidth: "1220px", margin: "clamp(72px,7vw,112px) auto 0", padding: "0 30px", scrollMarginTop: "24px" }}><div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "24px", flexWrap: "wrap", marginBottom: "28px" }}><div style={{ display: "flex", flexDirection: "column", gap: "8px" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Уровень готовности технологии</span><h2 style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "clamp(26px,2.4vw,34px)", lineHeight: "1.24", fontWeight: "500", letterSpacing: "-.012em", color: "var(--pd-ink)", maxWidth: "38ch", textWrap: "balance" }}>На каком уровне разработка и какие документы получаются на выходе</h2></div><span className="bp-sub" style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-muted)", textAlign: "right", marginLeft: "auto", paddingBottom: "6px", borderBottom: "1px solid var(--pd-border)" }}>Состав работ и документов для каждого уровня</span></div><div className="bp-scroll bp-trlscroll"><div className="bp-trlscale" role="group" aria-label="Уровень готовности технологии"><span className="bp-trlline" aria-hidden="true"><span className="bp-trlfill" style={{ transform: `scaleX(${trlFill})` }}></span></span><div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(9,minmax(0,1fr))" }}>{(trlScale ?? []).map((t: any, _i0: number) => (<React.Fragment key={_i0}><button className="bp-trlstep" type="button" aria-pressed={t.pressed} aria-label={t.aria} onClick={t.pick}><span className="bp-trlnode" style={{ background: t.nodeBg, borderColor: t.nodeRing, color: t.numColor }}>{t.num}</span> <span className="bp-trlchip" style={{ color: t.titleColor }}>{t.short}</span></button></React.Fragment>))}</div></div></div><div className="bp-trlcard" style={{ border: "1px solid var(--pd-border)", borderRadius: "14px", background: "var(--pd-ink-inverse)", boxShadow: "0 6px 14px rgba(20,22,28,.06),0 1px 2px rgba(20,22,28,.05)", overflow: "hidden", display: "flex", flexDirection: "column" }}><div className="{{ trl.bodyClass }}" style={{ display: "flex", flexDirection: "column", flex: "1 1 auto" }}><div className="bp-trlhead" style={{ gap: "16px 32px", padding: "22px 24px 20px", borderBottom: "1px solid var(--pd-border)" }}><div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "0" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-accent)", fontVariantNumeric: "tabular-nums" }}>УГТ {trl.num} · {trl.short}</span><h3 style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "17px", lineHeight: "1.4", fontWeight: "600", color: "var(--pd-ink)", maxWidth: "44ch" }}>{trl.title}</h3></div><div role="status" style={{ alignSelf: "start", border: `1px solid ${trl.noteBorder}`, background: trl.noteBg, borderRadius: "10px", padding: "12px 16px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "4px" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.4", fontWeight: "600", color: trl.noteInk }}>{trl.noteLabel}</span><span style={{ fontSize: "14px", lineHeight: "1.5", color: trl.noteText, maxWidth: "72ch" }}>{trl.note}</span></div></div><div className="bp-trl" style={{ gap: "24px 32px", padding: "20px 24px 24px", flex: "1 1 auto", alignContent: "start" }}><div className="bp-trlcol"><span className="bp-trlcolhead">Что делаем на этом уровне</span><ul className="bp-trllist" role="list">{(trl.can ?? []).map((c: any, _i0: number) => (<React.Fragment key={_i0}><li><span className="bp-trldot" aria-hidden="true"></span><span>{c.text}</span></li></React.Fragment>))}</ul></div><div className="bp-trlcol"><span className="bp-trlcolhead" id="bp-trl-docs">Документы на выходе</span><div className="bp-trldocs" role="table" aria-labelledby="bp-trl-docs">{(trl.docs ?? []).map((d: any, _i0: number) => (<React.Fragment key={_i0}><div role="row"><span role="cell" style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink)", minWidth: "0" }}>{d.name}</span><span role="cell" style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.5", color: "var(--pd-ink-muted)", textAlign: "right", textWrap: "balance" }}>{d.norm}</span></div></React.Fragment>))}</div></div><div className="bp-trlcol"><span className="bp-trlcolhead">Финансирование</span><ul className="bp-trllist" role="list">{(trl.money ?? []).map((m: any, _i0: number) => (<React.Fragment key={_i0}><li><span className="bp-trldot" aria-hidden="true"></span><span>{m.text}</span></li></React.Fragment>))}</ul></div></div><button className="bp-trlfoot" type="button" onClick={trl.goPack} style={{ appearance: "none", cursor: "pointer", width: "100%", margin: "auto 0 0", textAlign: "left", border: "0", borderTop: "1px solid var(--pd-border)", padding: "12px 24px", minHeight: "68px", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", color: "var(--pd-ink)" }}><span style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "0" }}><span style={{ fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-accent)" }}>Подходящее предложение</span><span style={{ fontSize: "15px", lineHeight: "1.4", fontWeight: "600", color: "var(--pd-ink)" }}>{trl.packLabel}</span></span><span className="bp-trlgo">Перейти к пакету<span className="bp-trlarrow" aria-hidden="true" style={{ WebkitMask: arrowRight, mask: arrowRight }}></span></span></button></div></div></section><section className="bp-pad" id="packs" style={{ position: "relative", zIndex: "1", maxWidth: "1220px", margin: "clamp(72px,7vw,112px) auto 0", padding: "0 30px", scrollMarginTop: "24px" }}><div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "24px", flexWrap: "wrap", marginBottom: "28px" }}><div style={{ display: "flex", flexDirection: "column", gap: "8px" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Предложения</span><h2 style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "clamp(26px,2.4vw,34px)", lineHeight: "1.24", fontWeight: "500", letterSpacing: "-.012em", color: "var(--pd-ink)", maxWidth: "30ch", textWrap: "balance" }}><span style={{ display: "block" }}>Пять пакетов: от техзадания</span><span style={{ background: "var(--pd-accent-mark)", borderRadius: "6px", padding: "2px 0", boxShadow: "-10px 0 0 var(--pd-accent-mark),10px 0 0 var(--pd-accent-mark)", mixBlendMode: "multiply", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>до постановки прав на баланс</span></h2></div><span className="bp-sub" style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-muted)", textAlign: "right", marginLeft: "auto", paddingBottom: "6px", borderBottom: "1px solid var(--pd-border)" }}>Сроки и смета фиксируются календарным планом после разбора материала</span></div><div style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: "16px" }}>{(packs ?? []).map((p: any, _i0: number) => (<React.Fragment key={_i0}><article className="bp-pack" id={p.anchor} style={{ gridColumn: `span ${p.span}`, scrollMarginTop: "24px", border: `1px solid ${p.border}`, borderRadius: "14px", background: "var(--pd-ink-inverse)", boxShadow: `inset 0 -3px 0 ${p.edge},0 1px 2px rgba(20,22,28,.05)`, display: "flex", flexDirection: "column", overflow: "hidden" }}><span aria-hidden="true" style={{ display: "block", height: "96px", flex: "0 0 96px", borderBottom: "1px solid var(--pd-divider)", background: `var(--pd-surface-quiet) ${p.art}`, backgroundSize: "cover", backgroundPosition: "center" }}></span><div style={{ padding: "18px 22px 20px", display: "flex", flexDirection: "column", gap: "14px", flex: "1 1 auto" }}><div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}><span style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "0" }}><span style={{ display: "flex", alignItems: "center", gap: "10px" }}><span aria-hidden="true" style={{ width: "20px", height: "20px", flex: "0 0 20px", display: "block", background: p.ink, WebkitMask: p.icon, mask: p.icon }}></span><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", color: p.ink }}>{p.num}</span></span><h3 style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: p.titleSize, lineHeight: "1.4", fontWeight: "600", color: "var(--pd-ink)" }}>{p.title}</h3></span><span style={{ flex: "0 0 auto", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".04em", color: "var(--pd-ink-muted)", textAlign: "right" }}>{p.term}</span></div><div style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".05em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Для кого</span><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink)" }}>{p.who}</span></div><div style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".05em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Что делаем</span><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-secondary)" }}>{p.what}</span></div><div style={{ margin: "auto 0 0", paddingTop: "12px", borderTop: "1px solid var(--pd-divider)", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "4px" }}><a className="xb" href="#request" aria-label={p.cta} style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", minHeight: "44px", gap: "8px", fontSize: "13px", lineHeight: "1.4", fontWeight: "600", color: "var(--pd-accent)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>Обсудить пакет<span aria-hidden="true" style={{ width: "14px", height: "14px", display: "block", background: "var(--pd-accent)", WebkitMask: arrowRight, mask: arrowRight }}></span></a></div></div></article></React.Fragment>))}</div></section><section className="bp-pad" id="catalog" style={{ position: "relative", zIndex: "1", maxWidth: "1220px", margin: "clamp(72px,7vw,112px) auto 0", padding: "0 30px", scrollMarginTop: "24px" }}><div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "24px", flexWrap: "wrap", marginBottom: "28px" }}><div style={{ display: "flex", flexDirection: "column", gap: "8px" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Каталог работ</span><h2 style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "clamp(26px,2.4vw,34px)", lineHeight: "1.24", fontWeight: "500", letterSpacing: "-.012em", color: "var(--pd-ink)", maxWidth: "38ch", textWrap: "balance" }}>Полный каталог: семь направлений, 52 позиции</h2></div><button className="xi x4" type="button" onClick={toggleAll} style={{ appearance: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", minHeight: "44px", border: "1px solid transparent", background: "var(--pd-ink-inverse)", borderRadius: "999px", padding: "10px 20px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.4", fontWeight: "600", color: "var(--pd-ink)", marginLeft: "auto", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>{catalogToggleLabel}</button></div><div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>{(catalog ?? []).map((g: any, _i0: number) => (<React.Fragment key={_i0}><div style={{ border: "1px solid var(--pd-border)", borderRadius: "14px", background: "var(--pd-ink-inverse)", boxShadow: "0 1px 2px rgba(20,22,28,.05)", overflow: "hidden" }}><button className="xj xk" type="button" aria-expanded={g.expanded} onClick={g.toggle} style={{ appearance: "none", cursor: "pointer", width: "100%", textAlign: "left", border: "0", background: g.headBg, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", transition: "box-shadow 180ms cubic-bezier(.2,0,.2,1),opacity 180ms cubic-bezier(.2,0,.2,1)" }}><span style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: "0" }}><span className="bp-catart" aria-hidden="true" style={{ width: "44px", height: "44px", flex: "0 0 44px", borderRadius: "10px", border: "1px solid var(--pd-border)", background: `var(--pd-surface-quiet) ${g.art}`, backgroundSize: "cover", backgroundPosition: "center", display: "block" }}></span><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", color: "var(--pd-accent)", flex: "0 0 auto" }}>{g.num}</span><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "15px", lineHeight: "1.4", fontWeight: "600", color: "var(--pd-ink)" }}>{g.title}</span></span><span style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "14px" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", color: "var(--pd-ink-muted)", fontVariantNumeric: "tabular-nums" }}>{g.count}</span><span aria-hidden="true" style={{ position: "relative", width: "14px", height: "14px", display: "block" }}><span style={{ position: "absolute", left: "0", top: "6px", width: "14px", height: "2px", background: "var(--pd-accent)", borderRadius: "999px" }}></span><span style={{ position: "absolute", left: "6px", top: "0", width: "2px", height: "14px", background: "var(--pd-accent)", borderRadius: "999px", display: g.plusV }}></span></span></span></button>{g.open ? (<><div className="bp-catbody" style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: "16px" }}><div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" }}><span style={{ fontSize: "14px", lineHeight: "1.6", color: "var(--pd-ink-secondary)", maxWidth: "66ch" }}>{g.lead}</span><span style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-end", textAlign: "right" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".05em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Получатель документа</span><span style={{ fontSize: "14px", lineHeight: "1.5", fontWeight: "600", color: "var(--pd-ink)" }}>{g.receiver}</span></span></div><div className="bp-cat" style={{ gap: "0 32px", alignContent: "start", flex: "1 1 auto" }}>{(g.items ?? []).map((i: any, _i1: number) => (<React.Fragment key={_i1}><span style={{ display: "flex", alignItems: "baseline", gap: "12px", padding: "10px 0", borderBottom: "1px solid var(--pd-divider)" }}><span style={{ flex: "0 0 auto", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", color: i.numColor, fontVariantNumeric: "tabular-nums" }}>{i.num}</span><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink)", minWidth: "0" }}>{i.text}</span></span></React.Fragment>))}</div>{g.postgrad ? (<><a className="xb" href="/main#services" style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", minHeight: "44px", gap: "8px", fontSize: "14px", lineHeight: "1.5", fontWeight: "600", color: "var(--pd-accent)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>Сопровождение диссертаций сотрудников — на&nbsp;странице «Аспирантам»<span aria-hidden="true" style={{ width: "14px", height: "14px", flex: "0 0 14px", display: "block", background: "var(--pd-accent)", WebkitMask: arrowRight, mask: arrowRight }}></span></a></>) : null}<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", paddingTop: "14px", borderTop: "1px solid var(--pd-border)" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".05em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>{g.norm}</span><a className="xb" href="#request" aria-label={g.cta} style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", gap: "8px", fontSize: "13px", lineHeight: "1.4", fontWeight: "600", color: "var(--pd-accent)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>Обсудить это направление<span aria-hidden="true" style={{ width: "14px", height: "14px", display: "block", background: "var(--pd-accent)", WebkitMask: arrowRight, mask: arrowRight }}></span></a></div></div></>) : null}</div></React.Fragment>))}</div></section><section className="bp-pad" style={{ position: "relative", zIndex: "1", maxWidth: "1220px", margin: "clamp(72px,7vw,112px) auto 0", padding: "0 30px" }}><div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "24px", flexWrap: "wrap", marginBottom: "28px" }}><div style={{ display: "flex", flexDirection: "column", gap: "8px" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Как устроена работа</span><h2 style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "clamp(26px,2.4vw,34px)", lineHeight: "1.24", fontWeight: "500", letterSpacing: "-.012em", color: "var(--pd-ink)", maxWidth: "38ch", textWrap: "balance" }}>Условия, закреплённые договором и приёмкой</h2></div><span className="bp-sub" style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-muted)", textAlign: "right", marginLeft: "auto", paddingBottom: "6px", borderBottom: "1px solid var(--pd-border)" }}>Для каждого условия указан документ</span></div><div className="bp-mech" style={{ gap: "16px" }}>{(reasons ?? []).map((r: any, _i0: number) => (<React.Fragment key={_i0}><article className="bp-mechcard pd-lift" style={{ border: "1px solid var(--pd-border)", borderRadius: "14px", background: "var(--pd-ink-inverse)", boxShadow: "0 6px 14px rgba(20,22,28,.06),0 1px 2px rgba(20,22,28,.05)", padding: "20px 22px 0", boxSizing: "border-box", minWidth: "0" }}><img className="bp-mechimg" src={r.img} alt="" aria-hidden="true" width="96" height="96" loading="lazy" decoding="async" style={{ display: "block", boxSizing: "border-box", borderRadius: "10px", border: "1px solid var(--pd-border)", background: "var(--pd-surface-quiet)", objectFit: "cover" }} /><div className="bp-mechhead"><span style={{ flex: "0 0 auto", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.4", fontWeight: "600", color: "var(--pd-ink-muted)", fontVariantNumeric: "tabular-nums" }}>{r.num}</span><h3 style={{ margin: "0", minWidth: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "15px", lineHeight: "1.4", fontWeight: "600", color: "var(--pd-ink)" }}>{r.title}</h3></div><p className="bp-mechtext" style={{ margin: "0", fontSize: "14px", lineHeight: "1.6", color: "var(--pd-ink-secondary)" }}>{r.text}</p><div className="bp-mechfoot" style={{ borderTop: "1px solid var(--pd-divider)" }}><button className="bp-mechbtn xb" type="button" aria-expanded={r.proofExpanded} aria-label={r.proofAria} onClick={r.proofToggle} style={{ appearance: "none", border: "0", background: "transparent", cursor: "pointer", padding: "0 8px", margin: "0 -8px", width: "calc(100% + 16px)", boxSizing: "border-box", minHeight: "52px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", textAlign: "left", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".05em", textTransform: "uppercase", color: "var(--pd-accent)", borderRadius: "10px" }}><span>Чем закреплено</span><span className="bp-mechplus" aria-hidden="true"><span style={{ position: "absolute", left: "8px", top: "13px", width: "12px", height: "2px", background: "var(--pd-accent)", borderRadius: "999px" }}></span><span style={{ position: "absolute", left: "13px", top: "8px", width: "2px", height: "12px", background: "var(--pd-accent)", borderRadius: "999px", display: r.plusV }}></span></span></button>{r.proofOpen ? (<><p className="bp-proof" style={{ margin: "0 0 18px", paddingLeft: "12px", borderLeft: "2px solid var(--pd-accent-mark)", fontSize: "13px", lineHeight: "1.6", color: "var(--pd-ink-muted)" }}>{r.proof}</p></>) : null}</div></article></React.Fragment>))}</div></section><section className="bp-pad" id="inside" aria-labelledby="pd-in-title" style={{ position: "relative", zIndex: "1", maxWidth: "1220px", margin: "clamp(72px,7vw,112px) auto 0", padding: "0 30px", scrollMarginTop: "24px" }}><div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "24px", flexWrap: "wrap", marginBottom: "24px" }}><div style={{ display: "flex", flexDirection: "column", gap: "10px" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Личный кабинет</span><h2 id="pd-in-title" style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "clamp(26px,2.4vw,34px)", lineHeight: "1.24", fontWeight: "500", letterSpacing: "-.012em", color: "var(--pd-ink)", maxWidth: "34ch", textWrap: "balance" }}>Как это выглядит внутри</h2></div><span className="pd-in-sub" style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-muted)", textAlign: "right", marginLeft: "auto", paddingBottom: "6px", borderBottom: "1px solid var(--pd-border)", maxWidth: "44ch" }}>Экраны кабинета клиента на вымышленных данных</span></div><div className="pd-in-tablist" role="tablist" aria-label="Экраны кабинета клиента" onKeyDown={inTabKey}>{(inTabs ?? []).map((t: any, _i0: number) => (<React.Fragment key={_i0}>{t.active ? (<><button className="x8 x4" type="button" role="tab" id={t.id} aria-selected="true" aria-controls="pd-in-panel" tabIndex={0} onClick={t.pick} style={{ appearance: "none", border: "0", cursor: "pointer", background: "var(--pd-ink)", color: "var(--pd-ink-inverse)", borderRadius: "999px", padding: "0 20px", minHeight: "44px", display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "14px", lineHeight: "1.4", fontWeight: "600", transition: "background 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>{t.label}</button></>) : null}{t.inactive ? (<><button className="x9 x4" type="button" role="tab" id={t.id} aria-selected="false" aria-controls="pd-in-panel" tabIndex={-1} onClick={t.pick} style={{ appearance: "none", border: "0", cursor: "pointer", background: "transparent", color: "var(--pd-ink-muted)", borderRadius: "999px", padding: "0 20px", minHeight: "44px", display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "14px", lineHeight: "1.4", fontWeight: "600", transition: "background 180ms cubic-bezier(.2,0,.2,1),color 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>{t.label}</button></>) : null}</React.Fragment>))}</div><div className="pd-in-body" id="pd-in-panel" role="tabpanel" aria-labelledby={inTabLabelledBy} style={{ gap: "32px", alignItems: "center", marginTop: "24px" }}><div style={{ display: "flex", flexDirection: "column", gap: "14px" }}><h3 style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "17px", lineHeight: "1.4", fontWeight: "600", color: "var(--pd-ink)" }}>{inTitle}</h3><p style={{ margin: "0", fontSize: "15px", lineHeight: "1.6", color: "var(--pd-ink-secondary)", maxWidth: "44ch" }}>{inText}</p><ul style={{ margin: "4px 0 0", padding: "0", listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>{(inPoints ?? []).map((p: any, _i0: number) => (<React.Fragment key={_i0}><li style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink)" }}><span aria-hidden="true" style={{ width: "22px", height: "22px", flex: "0 0 22px", borderRadius: "50%", background: "var(--pd-accent-tint)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "-1px" }}><span style={{ width: "12px", height: "12px", display: "block", background: "var(--pd-accent)", WebkitMask: inCheckMask, mask: inCheckMask }}></span></span><span>{p.text}</span></li></React.Fragment>))}</ul><div style={{ marginTop: "12px" }}><a className="x7 x4" href="#request" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", background: "var(--pd-ink)", color: "var(--pd-ink-inverse)", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "15px", fontWeight: "600", padding: "12px 32px", borderRadius: "999px", textDecoration: "none", transition: "background 180ms cubic-bezier(.2,0,.2,1),color 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>Оставить заявку</a></div></div><figure style={{ margin: "0", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "14px", boxShadow: "0 6px 14px rgba(20,22,28,.06),0 1px 2px rgba(20,22,28,.05)", padding: "10px" }}><div className="pd-in-shots" style={{ display: "grid", width: "100%", borderRadius: "10px", background: "var(--pd-surface-quiet)" }}>{(inShots ?? []).map((shot: any, _i0: number) => (<React.Fragment key={_i0}><img src={shot.src} alt={shot.alt} aria-hidden={shot.hidden} width="1440" height="900" loading={shot.loading} decoding="async" style={{ gridArea: "1/1", display: "block", width: "100%", height: "auto", borderRadius: "10px", border: "1px solid var(--pd-divider)", opacity: shot.op, transition: "opacity 220ms cubic-bezier(.2,0,.2,1)" }} /></React.Fragment>))}</div><figcaption style={{ padding: "10px 6px 2px", fontSize: "13px", lineHeight: "1.5", color: "var(--pd-ink-muted)" }}>{inCaption}</figcaption></figure></div></section><section className="bp-pad" id="rights" style={{ position: "relative", zIndex: "1", maxWidth: "1220px", margin: "clamp(72px,7vw,112px) auto 0", padding: "0 30px", scrollMarginTop: "24px" }}><div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "24px", flexWrap: "wrap", marginBottom: "28px" }}><div style={{ display: "flex", flexDirection: "column", gap: "8px" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Права и конфиденциальность</span><h2 style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "clamp(26px,2.4vw,34px)", lineHeight: "1.24", fontWeight: "500", letterSpacing: "-.012em", color: "var(--pd-ink)", maxWidth: "38ch", textWrap: "balance" }}>Кому принадлежит результат и что происходит с материалами</h2></div><span className="bp-sub" style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-muted)", textAlign: "right", marginLeft: "auto", paddingBottom: "6px", borderBottom: "1px solid var(--pd-border)" }}>Права на результат остаются у вашей компании</span></div><ul className="bp-rights" role="list" style={{ gap: "16px" }}><li className="bp-right bp-right-lead pd-lift" style={{ background: "var(--pd-accent-deep)", border: "1px solid var(--pd-accent-deep)" }}><div className="bp-righthead"><span aria-hidden="true" style={{ width: "44px", height: "44px", flex: "0 0 44px", borderRadius: "10px", background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.24)", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ width: "22px", height: "22px", display: "block", background: "var(--pd-ink-inverse)", WebkitMask: rightsLead.icon, mask: rightsLead.icon }}></span></span><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.4", fontWeight: "600", fontVariantNumeric: "tabular-nums", color: "var(--pd-accent-edge)" }}>{rightsLead.num}</span></div><div className="bp-rightbody"><h3 style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "17px", lineHeight: "1.4", fontWeight: "600", color: "var(--pd-ink-inverse)" }}>{rightsLead.label}</h3><p style={{ margin: "0", fontSize: "14px", lineHeight: "1.6", color: "var(--pd-accent-mark)" }}>{rightsLead.text}</p></div></li>{(rightsRest ?? []).map((r: any, _i0: number) => (<React.Fragment key={_i0}><li className="bp-right pd-lift" style={{ background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)" }}><div className="bp-righthead"><span aria-hidden="true" style={{ width: "44px", height: "44px", flex: "0 0 44px", borderRadius: "10px", background: "var(--pd-accent-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ width: "22px", height: "22px", display: "block", background: "var(--pd-accent)", WebkitMask: r.icon, mask: r.icon }}></span></span><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.4", fontWeight: "600", fontVariantNumeric: "tabular-nums", color: "var(--pd-ink-muted)" }}>{r.num}</span></div><div className="bp-rightbody"><h3 style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "17px", lineHeight: "1.4", fontWeight: "600", color: "var(--pd-ink)" }}>{r.label}</h3><p style={{ margin: "0", fontSize: "14px", lineHeight: "1.6", color: "var(--pd-ink-secondary)" }}>{r.text}</p></div></li></React.Fragment>))}</ul></section><section className="bp-pad" id="faq" style={{ position: "relative", zIndex: "1", maxWidth: "1220px", margin: "clamp(72px,7vw,112px) auto 0", padding: "0 30px", scrollMarginTop: "24px" }}><div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "24px", flexWrap: "wrap", marginBottom: "28px" }}><div style={{ display: "flex", flexDirection: "column", gap: "8px" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Вопросы</span><h2 style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "clamp(26px,2.4vw,34px)", lineHeight: "1.24", fontWeight: "500", letterSpacing: "-.012em", color: "var(--pd-ink)", maxWidth: "38ch", textWrap: "balance" }}>Вопросы о договоре, приёмке и правах на результат</h2></div><span className="bp-sub" style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-muted)", textAlign: "right", marginLeft: "auto", paddingBottom: "6px", borderBottom: "1px solid var(--pd-border)" }}>Те же вопросы разбираем на созвоне знакомства</span></div><div className="bp-faq" style={{ gap: "40px", alignItems: "stretch" }}><div style={{ flex: "1 1 auto", minHeight: "340px", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "14px", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 6px 14px rgba(20,22,28,.06),0 1px 2px rgba(20,22,28,.05)" }}><div style={{ position: "relative", flex: "1 1 auto", minHeight: "288px", background: "var(--pd-surface-quiet)" }}><PhotoSlot slotId="bp-faq-photo" shape="rect" fit="cover" alt="Руководитель проекта с чертежами и документами у рабочего стола" placeholder="Фото: чертежи на столе" priority={ABOVE_THE_FOLD.has("bp-faq-photo")} style={{ position: "absolute", inset: "0", width: "100%", height: "100%" }} /></div><div style={{ padding: "18px 24px 22px", borderTop: "1px solid var(--pd-divider)", display: "flex", flexDirection: "column", gap: "10px" }}><h3 style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "15px", lineHeight: "1.4", fontWeight: "600", color: "var(--pd-ink)" }}>Вопрос не из списка?</h3><p style={{ margin: "0", fontSize: "14px", lineHeight: "1.6", color: "var(--pd-ink-secondary)", maxWidth: "44ch" }}>Напишите или позвоните.</p><div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "2px" }}><a className="xl" href="tel:+74954564323" style={{ display: "flex", alignItems: "center", minHeight: "44px", gap: "10px", fontSize: "15px", lineHeight: "1.4", fontWeight: "600", color: "var(--pd-ink)", textDecoration: "none", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}><span aria-hidden="true" style={{ width: "18px", height: "18px", flex: "0 0 18px", display: "block", background: "var(--pd-accent)", WebkitMask: "url('./assets/icons/phone.svg') center/contain no-repeat", mask: "url('./assets/icons/phone.svg') center/contain no-repeat" }}></span> +7 495 456 43 23</a><a className="xl" href="mailto:info.prodisser@gmail.com" style={{ display: "flex", minHeight: "44px", alignItems: "center", gap: "10px", fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-secondary)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}><span aria-hidden="true" style={{ width: "18px", height: "18px", flex: "0 0 18px", display: "block", background: "var(--pd-accent)", WebkitMask: "url('./assets/icons/mail.svg') center/contain no-repeat", mask: "url('./assets/icons/mail.svg') center/contain no-repeat" }}></span>info.prodisser@gmail.com</a></div></div></div><div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>{(faq ?? []).map((f: any, _i0: number) => (<React.Fragment key={_i0}>{f.open ? (<><div style={{ background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-accent-mark)", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 2px rgba(20,22,28,.05)" }}><button className="xm xk" type="button" onClick={f.toggle} aria-expanded="true" style={{ appearance: "none", border: "0", background: "var(--pd-accent-mark)", cursor: "pointer", width: "100%", textAlign: "left", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "14px", lineHeight: "1.4", fontWeight: "600", color: "var(--pd-ink)", transition: "background 180ms cubic-bezier(.2,0,.2,1),opacity 180ms cubic-bezier(.2,0,.2,1)" }}><span>{f.q}</span><span aria-hidden="true" style={{ width: "16px", height: "2px", flex: "0 0 16px", background: "var(--pd-ink)", borderRadius: "999px" }}></span></button><p style={{ margin: "0", padding: "14px 20px 18px", fontSize: "14px", lineHeight: "1.6", color: "var(--pd-ink-secondary)" }}>{f.a}</p></div></>) : null}{f.closed ? (<><button className="pd-lift xk" type="button" onClick={f.toggle} aria-expanded="false" style={{ appearance: "none", border: "1px solid var(--pd-border)", background: "var(--pd-ink-inverse)", cursor: "pointer", width: "100%", textAlign: "left", padding: "16px 20px", borderRadius: "14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "14px", lineHeight: "1.4", fontWeight: "600", color: "var(--pd-ink)", boxShadow: "0 1px 2px rgba(20,22,28,.05)", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),opacity 180ms cubic-bezier(.2,0,.2,1)" }}><span>{f.q}</span><span aria-hidden="true" style={{ position: "relative", width: "16px", height: "16px", flex: "0 0 16px" }}><span style={{ position: "absolute", left: "0", top: "8px", width: "16px", height: "2px", background: "var(--pd-ink-muted)", borderRadius: "999px" }}></span><span style={{ position: "absolute", left: "8px", top: "0", width: "2px", height: "16px", background: "var(--pd-ink-muted)", borderRadius: "999px" }}></span></span></button></>) : null}</React.Fragment>))}</div></div></section><section className="bp-pad" id="request" style={{ position: "relative", zIndex: "1", maxWidth: "1220px", margin: "clamp(72px,7vw,112px) auto 0", padding: "0 30px", scrollMarginTop: "24px" }}><div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "24px", flexWrap: "wrap", marginBottom: "28px" }}><div style={{ display: "flex", flexDirection: "column", gap: "8px" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Заявка</span><h2 style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "clamp(26px,2.4vw,34px)", lineHeight: "1.24", fontWeight: "500", letterSpacing: "-.012em", color: "var(--pd-ink)", maxWidth: "38ch", textWrap: "balance" }}>Опишите разработку&nbsp;— разберём задачу и посчитаем смету</h2></div><span className="bp-sub" style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-muted)", textAlign: "right", marginLeft: "auto", paddingBottom: "6px", borderBottom: "1px solid var(--pd-border)" }}>Ответим в рабочий день и пришлём NDA</span></div><div className="bp-req" style={{ gap: "16px", alignItems: "stretch" }}><form onSubmit={submitMain} style={{ border: "1px solid var(--pd-border)", borderRadius: "14px", padding: "20px 22px", background: "var(--pd-ink-inverse)", boxShadow: "0 1px 2px rgba(20,22,28,.05)", display: "flex", flexDirection: "column", gap: "12px" }} method="post"><input type="text" name="company_website" tabIndex="-1" autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", opacity: "0", pointerEvents: "none" }} /><label htmlFor="bp-org" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Организация
        <input className="xa" id="bp-org" name="organization" type="text" autoComplete="organization" required={true} placeholder="Название компании" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label htmlFor="bp-person" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Контактное лицо
        <input className="xa" id="bp-person" name="name" type="text" autoComplete="name" required={true} placeholder="Имя и должность" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><div role="group" aria-label="Способ связи для сметы" style={{ display: "inline-flex", gap: "4px", padding: "4px", background: "var(--pd-surface-quiet)", border: "1px solid var(--pd-border)", borderRadius: "999px", alignSelf: "flex-start", flex: "0 0 auto" }}>{(contactTabsBottom ?? []).map((c: any, _i0: number) => (<React.Fragment key={_i0}>{c.active ? (<><button className="x8 x4" type="button" aria-pressed="true" onClick={c.pick} style={{ appearance: "none", border: "0", cursor: "pointer", background: "var(--pd-ink)", color: "var(--pd-ink-inverse)", borderRadius: "999px", padding: "0 20px", minHeight: "44px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.4", fontWeight: "600", transition: "background 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>{c.label}</button></>) : null}{c.inactive ? (<><button className="x9 x4" type="button" aria-pressed="false" onClick={c.pick} style={{ appearance: "none", border: "0", cursor: "pointer", background: "transparent", color: "var(--pd-ink-muted)", borderRadius: "999px", padding: "0 20px", minHeight: "44px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.4", fontWeight: "600", transition: "background 180ms cubic-bezier(.2,0,.2,1),color 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>{c.label}</button></>) : null}</React.Fragment>))}</div><label htmlFor="bp-contact" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Контакт для связи
        <input className="xa" id="bp-contact" name="contact" type={contactTypeBottom} autoComplete={contactAutoBottom} required={true} placeholder={contactPlaceholderBottom} style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label htmlFor="bp-need" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Что нужно
        <select className="xa" id="bp-need" name="need" style={{ height: "48px", boxSizing: "border-box", padding: "0 12px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }}>{(needs ?? []).map((n: any, _i0: number) => (<React.Fragment key={_i0}><option value={n.label}>{n.label}</option></React.Fragment>))}</select></label><label htmlFor="bp-term" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Срок или дедлайн конкурса
        <input className="xa" id="bp-term" name="deadline" type="text" autoComplete="off" placeholder="Например: подача до 30 ноября" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><div className="pd-agree" style={{ display: "flex", flexDirection: "column", gap: "0" }}><label htmlFor="bp-consent" style={{ display: "flex", minHeight: "32px", alignItems: "center", gap: "8px", fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-muted)", cursor: "pointer" }}><input id="bp-consent" name="consent" type="checkbox" required={true} style={{ width: "16px", height: "16px", flex: "0 0 16px", margin: "0", cursor: "pointer" }} /><span>Даю <a className="xb" href="/consent" target="_blank" rel="noopener" style={{ color: "var(--pd-accent)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>согласие на обработку персональных данных</a></span></label><label htmlFor="bp-terms" style={{ display: "flex", minHeight: "32px", alignItems: "center", gap: "8px", fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-muted)", cursor: "pointer" }}><input id="bp-terms" name="terms" type="checkbox" required={true} style={{ width: "16px", height: "16px", flex: "0 0 16px", margin: "0", cursor: "pointer" }} /><span>Принимаю <a className="xb" href="/offer" target="_blank" rel="noopener" style={{ color: "var(--pd-accent)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>оферту</a> и <a className="xb" href="/privacy" target="_blank" rel="noopener" style={{ color: "var(--pd-accent)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>политику</a></span></label></div><button className="x8 x4" type="submit" disabled={pending} style={{ appearance: "none", border: "0", cursor: "pointer", alignSelf: "flex-start", marginTop: "10px", background: "var(--pd-ink)", color: "var(--pd-ink-inverse)", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "14px", fontWeight: "600", padding: "14px 32px", borderRadius: "999px", transition: "background 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>Отправить заявку</button>{sentMain ? (<><div role="status" tabIndex="-1" data-sent="main" style={{ display: "flex", gap: "8px", alignItems: "flex-start", background: "var(--pd-ok-bg)", border: "1px solid var(--pd-ok-border)", borderRadius: "10px", padding: "12px 16px" }}><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ok-ink)" }}>Заявка принята. Менеджер ответит в течение рабочего дня и пришлёт NDA.</span></div><div data-next="main" style={{ marginTop: "12px", border: "1px solid var(--pd-border)", borderRadius: "10px", background: "var(--pd-surface-quiet)", padding: "12px 16px" }}><span style={{ display: "block", fontSize: "14px", lineHeight: "1.4", fontWeight: "600", color: "var(--pd-ink)", marginBottom: "8px" }}>Что будет дальше</span><ol style={{ margin: "0", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px", fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-secondary)" }}><li>Менеджер разберёт заявку и ответит в течение рабочего дня</li><li>Свяжемся удобным вам способом, чтобы уточнить задачу</li><li>Менеджер откроет вам личный кабинет — ссылка придёт на почту; там вы приложите материалы по перечню «Что подготовить»</li></ol></div></>) : null}{errorMain ? (<><div role="alert" style={{ display: "flex", gap: "8px", alignItems: "flex-start", background: "var(--pd-err-bg)", border: "1px solid var(--pd-err-border)", borderRadius: "10px", padding: "12px 16px" }}><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-err-ink)" }}>{errorMain}</span></div></>) : null}</form><div className="bp-reqsteps" style={{ border: "1px solid var(--pd-border)", borderRadius: "14px", background: "var(--pd-surface-quiet)", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px", minWidth: "0" }}><h3 style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "15px", lineHeight: "1.4", fontWeight: "600", color: "var(--pd-ink)" }}>Что будет после отправки</h3><ol className="pd-track pd-track-v" role="list">{(afterSteps ?? []).map((s: any, _i0: number) => (<React.Fragment key={_i0}><li><span className="pd-track-node" style={{ position: "relative", zIndex: "1", width: "28px", height: "28px", boxSizing: "border-box", borderRadius: "50%", border: "2px solid var(--pd-accent)", background: "var(--pd-ink-inverse)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1", fontWeight: "600", color: "var(--pd-accent)", fontVariantNumeric: "tabular-nums" }}>{s.num}</span><span className="pd-track-body" style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "0" }}><span style={{ fontSize: "15px", lineHeight: "1.4", fontWeight: "600", color: "var(--pd-ink)" }}>{s.title}</span><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-secondary)" }}>{s.text}</span></span></li></React.Fragment>))}</ol></div><div className="bp-reqask" style={{ border: "1px solid var(--pd-border)", borderRadius: "14px", background: "var(--pd-ink-inverse)", boxShadow: "0 1px 2px rgba(20,22,28,.05)", overflow: "hidden", minWidth: "0" }}><span className="bp-reqart" aria-hidden="true" style={{ display: "block", background: "var(--pd-surface-quiet) url('./assets/art/svc-grants.webp')", backgroundSize: "cover", backgroundPosition: "center" }}></span><div className="bp-reqbody" style={{ display: "flex", flexDirection: "column", gap: "10px", minWidth: "0" }}><h3 style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "15px", lineHeight: "1.4", fontWeight: "600", color: "var(--pd-ink)" }}>Что прислать для сметы</h3><div className="bp-asklist" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>{(askFor ?? []).map((a: any, _i0: number) => (<React.Fragment key={_i0}><span style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}><span aria-hidden="true" style={{ width: "4px", height: "4px", flex: "0 0 4px", marginTop: "8px", borderRadius: "50%", background: "var(--pd-accent)" }}></span><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-secondary)" }}>{a.text}</span></span></React.Fragment>))}</div><p style={{ margin: "2px 0 0", paddingTop: "10px", borderTop: "1px solid var(--pd-divider)", fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-muted)" }}>Материалы загружаете в&nbsp;личный кабинет после подписания NDA&nbsp;— доступ откроет менеджер.</p></div></div></div></section><section className="bp-pad" id="reviews" style={{ position: "relative", zIndex: "20", maxWidth: "1220px", margin: "clamp(72px,7vw,112px) auto 0", padding: "0 30px", scrollMarginTop: "24px" }}><div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "24px", flexWrap: "wrap" }}><div><span style={{ display: "block", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Отзывы</span><h2 style={{ margin: "10px 0 0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "clamp(26px,2.4vw,34px)", lineHeight: "1.24", fontWeight: "500", letterSpacing: "-.012em", color: "var(--pd-ink)" }}>Что говорят клиенты</h2></div></div><div className="pd-revstage" role="group" aria-roledescription="карусель" aria-label="Отзывы клиентов" style={{ position: "relative", height: "268px", marginTop: "28px" }}>{(reviews ?? []).map((r: any, _i0: number) => (<React.Fragment key={_i0}><article aria-hidden={r.hidden} style={{ position: "absolute", left: "50%", top: "8px", width: "min(430px,84vw)", height: "236px", marginLeft: "calc(min(430px,84vw) / -2)", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "14px", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "14px", padding: "20px 22px", boxShadow: "0 6px 14px rgba(20,22,28,.06),0 1px 2px rgba(20,22,28,.05)", transition: "transform 420ms cubic-bezier(.2,0,.2,1),filter 420ms cubic-bezier(.2,0,.2,1),opacity 420ms cubic-bezier(.2,0,.2,1)", transform: r.tf, filter: r.fl, opacity: r.op, zIndex: r.z, pointerEvents: r.pe }}><div style={{ display: "flex", alignItems: "center", gap: "12px" }}>{r.hasPhoto ? (<><img src={r.photo} alt="" aria-hidden="true" width="56" height="56" loading="lazy" decoding="async" style={{ display: "block", width: "56px", height: "56px", flex: "0 0 56px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--pd-accent-mark)", background: "var(--pd-accent-tint)", objectFit: "cover" }} /></>) : null}{r.noPhoto ? (<><img src="./assets/reviews/placeholder.svg" alt="" aria-hidden="true" width="56" height="56" decoding="async" style={{ display: "block", width: "56px", height: "56px", flex: "0 0 56px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--pd-accent-mark)", background: "var(--pd-accent-tint)" }} /></>) : null}<span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}><span style={{ fontSize: "14px", lineHeight: "1.5", fontWeight: "600", color: "var(--pd-ink)" }}>{r.role}</span><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>{r.field}</span></span></div><p style={{ margin: "0", fontSize: "15px", lineHeight: "1.5", color: "var(--pd-ink-secondary)" }}>{r.text}</p></article></React.Fragment>))}</div><div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "14px", marginTop: "20px" }}><button className="x3 xn" type="button" onClick={revPrev} aria-label="Предыдущий отзыв" style={{ appearance: "none", cursor: "pointer", width: "44px", height: "44px", flex: "0 0 44px", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "999px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}><span aria-hidden="true" style={{ width: "16px", height: "16px", display: "block", background: "var(--pd-ink)", WebkitMask: "url('./assets/icons/arrow-left.svg') center/contain no-repeat", mask: "url('./assets/icons/arrow-left.svg') center/contain no-repeat" }}></span></button><span aria-live="polite" style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", overflow: "hidden" }}>{revCounter}</span><button className="x3 xn" type="button" onClick={revNext} aria-label="Следующий отзыв" style={{ appearance: "none", cursor: "pointer", width: "44px", height: "44px", flex: "0 0 44px", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "999px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}><span aria-hidden="true" style={{ width: "16px", height: "16px", display: "block", background: "var(--pd-ink)", WebkitMask: "url('./assets/icons/arrow-right.svg') center/contain no-repeat", mask: "url('./assets/icons/arrow-right.svg') center/contain no-repeat" }}></span></button></div><div style={{ display: "flex", justifyContent: "center", marginTop: "20px" }}><button className="xi x4" type="button" onClick={toggleRevForm} aria-expanded={revFormOpenAttr} aria-controls="bp-revform" id="bp-revbtn" style={{ appearance: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "10px", minHeight: "44px", background: "transparent", border: "1px solid transparent", color: "var(--pd-ink)", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "15px", fontWeight: "600", padding: "0 22px", borderRadius: "999px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>{revFormLabel}</button></div><div id="bp-revform" onClick={closeRevFormOnBackdrop} style={{ position: "fixed", inset: "0", zIndex: "40", display: revFormDisplay, alignItems: "center", justifyContent: "center", padding: "20px", background: "rgba(20,22,28,.55)" }}><div role="dialog" aria-modal="true" aria-labelledby="bp-revform-title" onClick={stopInside} style={{ width: "100%", maxWidth: "440px", maxHeight: "calc(100vh - 40px)", overflowY: "auto", boxSizing: "border-box", background: "var(--pd-ink-inverse)", borderRadius: "14px", padding: "24px", boxShadow: "0 10px 20px rgba(20,22,28,.09)" }}><div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}><h3 id="bp-revform-title" tabIndex="-1" style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "20px", lineHeight: "1.4", fontWeight: "500", letterSpacing: "-.015em", color: "var(--pd-ink)" }}>Написать отзыв</h3><button className="xg" type="button" onClick={toggleRevForm} aria-label="Закрыть окно" style={{ appearance: "none", cursor: "pointer", width: "44px", height: "44px", flex: "0 0 44px", margin: "-10px -10px 0 0", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "0", borderRadius: "999px", transition: "background 180ms cubic-bezier(.2,0,.2,1)" }}><span aria-hidden="true" style={{ width: "16px", height: "16px", display: "block", background: "var(--pd-ink-muted)", WebkitMask: "url('./assets/icons/x-circle.svg') center/contain no-repeat", mask: "url('./assets/icons/x-circle.svg') center/contain no-repeat" }}></span></button></div><form onSubmit={submitReview} style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "18px" }} method="post"><input type="text" name="company_website" tabIndex="-1" autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", opacity: "0", pointerEvents: "none" }} /><label htmlFor="bp-rev-who" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Кто вы
        <input className="xa" id="bp-rev-who" name="name" type="text" autoComplete="off" required={true} placeholder="Например: руководитель НИОКР, приборостроение" style={{ width: "100%", boxSizing: "border-box", padding: "0 16px", height: "48px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", lineHeight: "1.5", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><span style={{ fontSize: "13px", lineHeight: "1.5", color: "var(--pd-ink-muted)", marginTop: "-6px" }}>Имя указывать не нужно — только роль и направление.</span><label htmlFor="bp-rev-text" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Отзыв
        <textarea className="xa" id="bp-rev-text" name="message" required={true} rows={4} placeholder="Что было сделано и что из этого вышло" style={{ width: "100%", boxSizing: "border-box", padding: "12px 16px", minHeight: "112px", resize: "vertical", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", lineHeight: "1.5", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }}></textarea></label><label htmlFor="bp-rev-pub" style={{ margin: "2px 0 0", display: "flex", minHeight: "44px", alignItems: "center", gap: "8px", fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-muted)", cursor: "pointer" }}><input id="bp-rev-pub" name="publish" type="checkbox" style={{ width: "16px", height: "16px", flex: "0 0 16px", margin: "0", cursor: "pointer" }} /><span>Разрешаю опубликовать отзыв на сайте без указания имени</span></label><button className="x8 x4" type="submit" disabled={pending} style={{ appearance: "none", border: "0", cursor: "pointer", alignSelf: "flex-start", background: "var(--pd-ink)", color: "var(--pd-ink-inverse)", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "15px", fontWeight: "600", minHeight: "44px", padding: "0 26px", borderRadius: "999px", transition: "background 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>Отправить отзыв</button>{sentReview ? (<><div role="status" tabIndex={-1} data-sent="review" style={{ display: "flex", gap: "8px", alignItems: "flex-start", background: "var(--pd-ok-bg)", border: "1px solid var(--pd-ok-border)", borderRadius: "10px", padding: "12px 16px" }}><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ok-ink)" }}>Спасибо, отзыв отправлен.</span></div></>) : null}{errorReview ? (<><div role="alert" style={{ display: "flex", gap: "8px", alignItems: "flex-start", background: "var(--pd-err-bg)", border: "1px solid var(--pd-err-border)", borderRadius: "10px", padding: "12px 16px" }}><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-err-ink)" }}>{errorReview}</span></div></>) : null}</form></div></div></section></main><footer className="bp-pad" id="contacts" style={{ position: "relative", zIndex: "1", maxWidth: "1220px", margin: "clamp(88px,8vw,128px) auto 0", padding: "48px 30px 24px", scrollMarginTop: "24px" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", flexWrap: "wrap", paddingBottom: "12px", borderBottom: "1px solid var(--pd-divider)" }}><span style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap", minWidth: "0" }}><a className="x1 x2" href="/" aria-label="ProDisser — на главную" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", flex: "0 0 auto", padding: "6px 10px", margin: "0 -10px", borderRadius: "10px", textDecoration: "none", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "21px", lineHeight: "1.24", fontWeight: "600", letterSpacing: ".005em", transition: "background 180ms cubic-bezier(.2,0,.2,1)" }}><span style={{ color: "var(--pd-accent)" }}>PRO</span><span style={{ color: "var(--pd-ink)" }}>DISSER</span></a><a className="xl" href="tel:+74954564323" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", fontSize: "15px", fontWeight: "500", color: "var(--pd-ink)", textDecoration: "none", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>+7 495 456 43 23</a><a className="xo" href="mailto:info.prodisser@gmail.com" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-muted)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>info.prodisser@gmail.com</a></span><span style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: "0" }}><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-muted)" }}>Пишите в Telegram — отвечаем в рабочее время</span><a className="xp xn" href="https://t.me/prodisser" target="_blank" rel="noopener noreferrer" aria-label="Telegram ProDisser" title="Telegram" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "44px", height: "44px", flex: "0 0 44px", border: "1px solid var(--pd-border)", borderRadius: "10px", background: "var(--pd-ink-inverse)", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),background 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}><span aria-hidden="true" style={{ width: "20px", height: "20px", display: "block", background: "var(--pd-accent)", WebkitMask: "url('./assets/icons/send.svg') center/contain no-repeat", mask: "url('./assets/icons/send.svg') center/contain no-repeat" }}></span></a><a className="xp xn" href="https://vk.ru/cmnrut" target="_blank" rel="noopener noreferrer" aria-label="VK — сообщество ProDisser во ВКонтакте" title="ВКонтакте" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "44px", height: "44px", flex: "0 0 44px", border: "1px solid var(--pd-border)", borderRadius: "10px", background: "var(--pd-ink-inverse)", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),background 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}><span aria-hidden="true" style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "14px", lineHeight: "1", fontWeight: "600", letterSpacing: ".02em", color: "var(--pd-accent)" }}>VK</span></a></span></div><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" }}><span style={{ display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap", minWidth: "0" }}><a className="xl" href="/offer" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-muted)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>Публичная оферта</a><a className="xl" href="/privacy" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-muted)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>Политика конфиденциальности</a><a className="xl" href="/consent" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-muted)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>Обработка персональных данных</a><a className="xl" href="/privacy#cookies" data-pd-cookies={true} style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-muted)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>Настройки cookies</a></span></div><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", flexWrap: "wrap", paddingTop: "8px" }}><span style={{ fontSize: "14px", lineHeight: "1.6", color: "var(--pd-ink-muted)" }}>© 2016—2026 ProDisser — научный консалтинг. Работаем по всей России</span></div></footer></div>
      </>
    );
  }
}

/** Страница ожила: обработчики подключены, кнопки отправки включаются (Р-508). */
export default class BusinessPage extends BusinessPageView {
  componentDidMount() {
    super.componentDidMount?.();
    this.setState({ __live: true });
  }
}

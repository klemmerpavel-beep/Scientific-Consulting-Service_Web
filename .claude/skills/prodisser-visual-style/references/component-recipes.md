# Рецепты компонентов и синтаксис макетов

Фрагменты взяты из действующих макетов после выпусков Р-607…Р-617. Перед
вставкой сверить с текущим макетом: значения могли уточниться позже, а
источник правды — макет и `docs/DESIGN-SYSTEM.md`, а не этот файл.

## Содержание

1. Синтаксис `.dc.html`
2. Заголовок раздела (Р-607)
3. Подсветка в заголовке (Р-32, Р-614)
4. Кнопка действия и вторичное действие (Р-610, Р-616, Р-959, Р-960)
5. Закреплённая полоса (Р-609, Р-612)
6. Вкладки экранов на телефоне (Р-613)
7. Карточка отзыва: фото или инициал (Р-590, Р-617)
8. Тёмная панель и вторая панель (Р-608)
9. Снимки в слотах `image-slot`
10. Новый тест-ограничитель

## 1. Синтаксис `.dc.html`

Макет — HTML с подстановками и классом логики `DCLogic` (это
`React.Component` без `render`). Конвертер `tools/dc-to-tsx.mjs` переносит
логику дословно и переводит шаблон:

| В макете | В компоненте |
|---|---|
| `{{ path }}` | `{path}` |
| `<sc-for list="{{ xs }}" as="x" hint-placeholder-count="4">` | `{xs.map((x, i) => (…))}` |
| `<sc-if value="{{ c }}" hint-placeholder-val="{{ true }}">` | `{c ? (<>…</>) : null}` |
| `style="a:b;c:d"` | `style={{ a: "b", c: "d" }}` |
| `style-hover`, `style-focus`, `style-active` | класс в общей таблице стилей |
| `class`, `for`, `onClick="{{ fn }}"` | `className`, `htmlFor`, `onClick={fn}` |
| `./main.html` | `/main` |

Правила, проверенные на практике:

- Отрицания в `sc-if` нет: в `renderVals` заводятся два флага
  (`hasPhoto: Boolean(r.photo)`, `noPhoto: !r.photo`) и два блока.
- Сгенерированные компоненты начинаются с `// @ts-nocheck`: необязательное
  поле в данных проверку типов не ломает, но и не проверяется — опечатку
  в имени поля ловит только тест.
- Медиа-правила для узких экранов пишутся в `<style>` макета с
  `!important`, если перекрывают встроенный `style`.
- Всё, что конвертер не разобрал, он перечисляет при запуске; молча
  пропускать такие места нельзя.

## 2. Заголовок раздела (Р-607)

```html
<h2 style="margin:0;font-family:'Literata',Georgia,'Times New Roman',serif;font-size:clamp(26px,2.4vw,34px);line-height:1.24;font-weight:500;letter-spacing:-.012em;color:var(--pd-ink);max-width:34ch;text-wrap:pretty">…</h2>
```

- 22 px / 1.4 остаются у h2 правовых страниц и у заголовка формы первого
  экрана главной.
- Заголовок — до 52 знаков и не больше трёх строк на 360 px.

## 3. Подсветка в заголовке (Р-32, Р-614)

```html
<span style="background:var(--pd-accent-mark);border-radius:6px;padding:2px 0;box-shadow:-8px 0 0 var(--pd-accent-mark),8px 0 0 var(--pd-accent-mark);mix-blend-mode:multiply;box-decoration-break:clone;-webkit-box-decoration-break:clone">ключевые слова</span>
```

- Одна на страницу, кроме h1.
- Боковые поля — тенью, а не `padding`: поле сдвигало вторую строку на
  8 px. `multiply` оставляет видимыми буквы строки выше, которые фон
  второй строки закрывал при интерлиньяже 1.24.

## 4. Кнопка действия и вторичное действие (Р-610, Р-616, Р-959, Р-960)

Исполнений тёмной кнопки два, одно на весь сайт (Р-960); текст всегда
Inter 15 px / 600, без верхнего регистра и разрядки.

**Кнопка раздела** — тёмная кнопка в разделе, ведущая к форме заявки или
анкете: исполнение кнопки «Географии» (Р-882) — поля `14px 32px` (47 px),
стрелка 15 px справа через 12 px, без `min-height`:

```html
<a href="#request" style="align-self:flex-start;display:inline-flex;align-items:center;gap:12px;background:var(--pd-ink);color:var(--pd-ink-inverse);font-size:15px;font-weight:600;padding:14px 32px;border-radius:999px;transition:background 180ms cubic-bezier(.2,0,.2,1),color 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" style-hover="background:var(--pd-button-hover);color:var(--pd-ink-inverse)" style-active="transform:scale(.97)">Оставить заявку<span aria-hidden="true" style="width:15px;height:15px;display:block;background:var(--pd-ink-inverse);-webkit-mask:url('./assets/icons/arrow-right.svg') center/contain no-repeat;mask:url('./assets/icons/arrow-right.svg') center/contain no-repeat"></span></a>
```

На тёмной панели — белая того же размера (`background:var(--pd-ink-inverse);
color:var(--pd-ink)`), стрелка цвета `--pd-ink`.

**Кнопка отправки формы** — первый экран, заявка, отзыв, анкета,
«Добавить в список» в «Инструментах»: `min-height: 52px`, поля `0 34px`,
текст по центру, без стрелки:

```html
<button type="submit" disabled="{{ pending }}" style="appearance:none;border:0;cursor:pointer;background:var(--pd-ink);color:var(--pd-ink-inverse);font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:600;padding:0 34px;min-height:52px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;transition:background 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" style-hover="background:var(--pd-button-hover)" style-active="transform:scale(.97)">Отправить заявку</button>
```

«Дальше» в анкете «Экспертам» — той же высоты и полей, со стрелкой
направления. Кнопки шапки и закреплённой полосы живут по своим правилам
(Р-588, Р-609) и этим рецептом не меняются; на первом экране без формы
(«Экспертам») кнопка-ссылка крупная — 52 px, поля `0 34px`, 15 px.
Охраняет тест `site-cta-look-r960`.

- Подпись всех тёмных кнопок к форме заявки — «Оставить заявку» (Р-959),
  у отправки нижней формы — «Отправить заявку», на «Экспертам» —
  «Заполнить анкету». Исключение одно — «Получить смету» в «Подборе
  сметы» «Студентам»: кнопка переносит выбранный срок в форму (Р-886).
  Прежние контекстные подписи «Обсудить проект», «Обсудить мой срок»,
  «Обсудить работу» сняты (Р-959, тест `site-cta-label-r959`); ссылки
  внутри карточек («Обсудить пакет», «Разобрать…») — не кнопки, а переходы
  по смыслу карточки (Р-847).
- Ссылка `#request` в разделе ведёт к форме внизу страницы; та же ссылка в
  шапке или полосе раскрывает окно заявки (Р-484).
- Под пунктами вкладок «Как это выглядит внутри» кнопка стоит после
  списка галочек: раздел в середине длинной страницы.
- Вторичная кнопка («Написать отзыв», «Как устроена работа», «Назад») —
  pill без заливки: рамка 1 px в покое прозрачная, при наведении —
  `--pd-ink` (Р-627); в паре с крупной кнопкой — той же высоты 52 px.
  Раскрытие списка («Полный список услуг») — светлая карточка-ссылка
  (Р-616). Вторая тёмная кнопка рядом не ставится: две тёмные кнопки
  спорят.

### Подъём блока при наведении (Р-628)

Интерактивный блок (карточка-ссылка, карточка направления, плитка)
получает класс `pd-lift`; правило лежит в `<style>` макета:

```css
.pd-lift{transition:transform 220ms cubic-bezier(.2,0,.2,1),box-shadow 220ms cubic-bezier(.2,0,.2,1)}
.pd-lift:hover,.pd-lift:focus-visible{transform:translateY(-5px)!important;box-shadow:0 10px 20px rgba(20,22,28,.09)!important}
@media (prefers-reduced-motion:reduce){html .pd-lift{transition:none!important}html .pd-lift:hover,html .pd-lift:focus-visible{transform:none!important}}
```

Синяя рамка при наведении на блоки больше не используется. Точное правило
сверять с действующим макетом: в нём может быть ещё переход фона.

## 5. Закреплённая полоса (Р-609, Р-612)

В макете длинной страницы (больше семи экранов) — две метки:

```html
<header data-pd-stick class="…" style="…">
  …
  <a data-pd-stick-cta href="#request" …>Оставить заявку</a>
</header>
```

`StickyBar.tsx` (монтируется из `RequestDialog.tsx`):

- находит `header[data-pd-stick]`, клонирует вордмарк (`a[aria-label]`) и
  `a[data-pd-stick-cta]` без `id` в `div.pd-stick`;
- показывает полосу, когда низ первого `main > section` ушёл выше экрана;
- полоса 64 px, белая, нижняя рамка `#E3E7EC`, `z-index: 20`,
  `transform` 180 мс; в печати скрыта;
- `scroll-margin-top: 80px !important` всем якорям: разделы макетов несут
  встроенные 24 px, и без `!important` начало раздела вставало под полосу
  (Р-623);
- `.pd-stick-row>a{display:inline-flex!important}` — иначе правило макета,
  прячущее кнопку шапки на узком экране, спрячет и копию.

Метка `data-pd-stick-cta` — ровно одна, на главной кнопке шапки
(`request-dialog.test.ts`); кнопки разделов её не получают. Правило для
главной: она короче семи экранов, меток на ней нет.
`layout.tsx` и `globals.css` полоса не трогает (Р-214).

## 6. Вкладки экранов на телефоне (Р-613)

```css
@media (max-width:768px){.pd-in-tablist{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));width:100%;border-radius:14px!important}.pd-in-tablist [role=tab]{justify-content:center;text-align:center;white-space:normal!important;padding:6px 12px!important;border-radius:10px!important}}
```

На «Экспертам» класс списка — `.ex-tablist`. В один ряд на телефоне
помещались две вкладки из четырёх.

## 7. Карточка отзыва: фото или инициал (Р-590, Р-617)

Данные (`REVIEWS` в логике макета):

```js
{ role: 'Анастасия', field: 'Авито · 14 ноября 2024', text: '…',
  photo: './assets/reviews/anastasia.webp', consent: '17.10.2026' },
```

`photo` и `consent` ставятся только вместе и только по присланному автором
снимку и письменному согласию. В `renderVals`: `hasPhoto: Boolean(r.photo),
noPhoto: !r.photo`. Разметка:

```html
<sc-if value="{{ r.hasPhoto }}" hint-placeholder-val="{{ false }}">
<img src="{{ r.photo }}" alt="" aria-hidden="true" width="56" height="56" loading="lazy" decoding="async" style="display:block;width:56px;height:56px;flex:0 0 56px;box-sizing:border-box;border-radius:50%;border:1px solid var(--pd-accent-mark);background:var(--pd-accent-tint);object-fit:cover">
</sc-if>
<sc-if value="{{ r.noPhoto }}" hint-placeholder-val="{{ true }}">
<span aria-hidden="true" style="…круг 56 px, Literata 22 px, --pd-accent на --pd-accent-tint…">{{ r.initial }}</span>
</sc-if>
```

Файл — 112×112 WebP в `design/assets/reviews/` и
`app/public/assets/reviews/`. Тест `review-photos.test.ts` не пропускает
фото без даты согласия, вне `assets/reviews/` и без файла в обеих папках.

## 8. Тёмная панель и вторая панель (Р-608)

- Фон `--pd-accent-deep`, радиус 14, поля `clamp(28px, 4vw, 56px)`;
  текст белый, второстепенный — `--pd-accent-mark`, метки —
  `--pd-accent-edge`; абзацы до трёх строк.
- Одна на страницу. На странице длиннее семи экранов вторая — только блок
  заявки в конце; между панелями не меньше двух светлых разделов.
- `landing-audit.mjs` считает тёмные панели в профиле страницы. Тёмные
  карточки-ссылки (Р-598) панелями не считаются, но Р-618 сделал их
  светлыми в покое — сверить перед новым тёмным элементом.

## 9. Снимки в слотах `image-slot`

`<image-slot id="mp-photo-1" shape="circle" data-alt="…" placeholder="…">`
в макете заполняется по таблице `app/src/components/photos.ts` (слот →
файл и точка кадрирования). Синтезированные снимки подписываются ролью
(Р-53), снимки кабинета — «На снимке вымышленные данные» (Р-205).
Изображения — в обе папки ассетов; `sync-check.sh` сверяет их.

## 10. Новый тест-ограничитель

Образец — `app/tests/review-photos.test.ts`:

- читает макет из `design/` и перенесённый компонент из
  `app/src/components/pages/`, чтобы проверка шла и по источнику, и по
  тому, что уходит в сеть;
- разбирает данные независимо от порядка полей;
- сообщения ошибок называют, что исправить.

Перед коммитом ограничитель проверяется пробой, которая должна его
уронить (поле без парного, файл в одной папке), и проба снимается.

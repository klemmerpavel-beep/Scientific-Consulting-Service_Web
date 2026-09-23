/**
 * Кладёт артборды кабинета в витрину.
 *
 * Кабинет в статическую витрину не собирается — он весь серверный (решение
 * Р-126). Но облик кабинета снят с работающих экранов: тринадцать артбордов
 * `design/cabinet/*.dc.html` — снимки, сделанные с базы с вымышленными
 * людьми (Р-137). Снимок самодостаточен: ни шрифтов, ни картинок, ни
 * скриптов снаружи, всё оформление инлайновым `<style>`. Поэтому его можно
 * отдать статикой как есть и показать раздел по ссылке, не поднимая сервер.
 *
 * Исходники в `design/cabinet/` не правятся: они пересобираются снимком и
 * обязаны совпадать побайтно. Правится только копия в `out`.
 *
 * Вызывается из `build-preview.mjs` до `prefixInternalLinks()`: ссылки на
 * страницы сайта (`/`, `/offer`, `/privacy`) внутри артбордов получают
 * префикс подпапки наравне с остальными.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SOURCE = path.join('..', 'design', 'cabinet');
const TARGET = path.join('out', 'cabinet', 'artboards');
const PROTOTYPE = path.join('..', 'design', 'cabinet-prototype');

/**
 * Прототип кабинета: связанный обход экранов.
 *
 * Артборд показывает композицию одного экрана, и по набору артбордов
 * сценарий не пройти. Прототип снят тем же способом, но обходом по
 * ссылкам: переходы между экранами сохранены, дерево разложено по ролям.
 * Собирается `node tools/cabinet-prototype.mjs` и лежит в репозитории
 * готовым — у сборки витрины нет ни базы, ни браузера (решение Р-139).
 */
export function writeCabinetPrototype() {
  cpSync(PROTOTYPE, path.join('out', 'cabinet'), { recursive: true });
  const screens = readdirSync(PROTOTYPE, { recursive: true }).filter(
    (name) => String(name).endsWith('index.html'),
  ).length;
  console.log(`Прототип кабинета в витрине: ${screens} экранов`);
}

/**
 * Перечень артбордов — тот же, что в `design/HANDOFF.md`, раздел 12.
 * Держать его здесь, а не вычитывать из HANDOFF, надёжнее: разбор таблицы
 * в размеченном тексте ломается от любой правки оформления.
 */
const BOARDS = [
  ['01-enter', 'Вход', 'Запрос одноразовой ссылки. Ответ одинаков для любого исхода: существование учётной записи по форме не выясняется.'],
  ['02-projects', 'Мои работы', 'Блок «сейчас от вас требуется» — композиционный центр экрана; ниже перечень работ с состоянием и сроком.'],
  ['03-project', 'Проект', 'Трекер этапов, лента событий, участники работы. Контактов клиента нет в разметке ни у кого, кроме менеджера и руководителя.'],
  ['04-stage', 'Этап и материалы', 'Версии с автором, размером и датой; замечания; согласование этапа клиентом.'],
  ['05-materials', 'Материалы работы', 'Все материалы в одном перечне, включая не привязанные к этапу.'],
  ['06-messages', 'Переписка', 'Единственный канал — клиент и менеджер. Сообщение с телефоном или адресом помечается, но не блокируется.'],
  ['07-payments', 'Счета и документы', 'Договор, транши, закрывающие документы. Ни маржи, ни начислений эксперту клиент не видит.'],
  ['08-request', 'Новая заявка', 'Форма из кабинета. Состав полей тот же, что на сайте, и заморожен.'],
  ['09-states', 'Состояния', '«Работа не найдена»: причина и следующий шаг вместо пустого экрана.'],
  ['10-queue', 'Очередь заявок', 'Модерация заявок и светофор по срокам у менеджера.'],
  ['11-import', 'Перенос книги заказов', 'Отчёт предпросмотра: классы ошибок с номерами строк, расхождения «цвет против текста», группы однофамильцев.'],
  ['12-analytics', 'Аналитика практики', 'Плитки, автоматические выводы и графики на шкале синего из таблицы токенов. Библиотека графиков не подключалась.'],
  ['13-audit', 'Журнал действий', 'Фильтры по исполнителю, действию и сроку; выгрузка в таблицу.'],
];

/**
 * Куда ведут ссылки кабинета внутри снимка.
 *
 * Снимок сделан с работающего приложения, и в нём живут настоящие маршруты
 * вида `/cabinet/projects/PD-2026-001`. На витрине таких адресов нет.
 * Перечень переписывает их на относительные ссылки внутри набора: где
 * соответствующий артборд есть — на него, где нет — на перечень. Иначе
 * половина переходов вела бы на «страница не найдена» самого GitHub.
 *
 * Порядок значим: длинные образцы идут первыми, иначе `/cabinet/projects`
 * перехватил бы `/cabinet/projects/PD-2026-001/payments`.
 */
const ROUTES = [
  [/^\/cabinet\/projects\/[^/]+\/materials$/u, '05-materials'],
  [/^\/cabinet\/projects\/[^/]+\/messages$/u, '06-messages'],
  [/^\/cabinet\/projects\/[^/]+\/payments$/u, '07-payments'],
  [/^\/cabinet\/projects\/[^/]+$/u, '03-project'],
  [/^\/cabinet\/projects$/u, '02-projects'],
  [/^\/cabinet\/stages\/[^/]+$/u, '04-stage'],
  [/^\/cabinet\/request$/u, '08-request'],
  [/^\/cabinet\/manage\/analytics(\/.*)?$/u, '12-analytics'],
  [/^\/cabinet\/manage\/audit(\/.*)?$/u, '13-audit'],
  [/^\/cabinet\/manage\/import(\/.*)?$/u, '11-import'],
  [/^\/cabinet\/manage$/u, '10-queue'],
  [/^\/cabinet\/enter(\/.*)?$/u, '01-enter'],
  [/^\/cabinet$/u, '01-enter'],
];

export function writeCabinetArtboards() {
  const files = readdirSync(SOURCE).filter((name) => name.endsWith('.dc.html')).sort();
  if (files.length === 0) throw new Error(`Артбордов нет в ${SOURCE}`);

  mkdirSync(TARGET, { recursive: true });

  for (const file of files) {
    const slug = file.replace(/\.dc\.html$/u, '');
    const source = readFileSync(path.join(SOURCE, file), 'utf8');
    writeFileSync(path.join(TARGET, `${slug}.html`), publishable(source, slug));
  }

  // Гарнитуры лежат рядом с артбордами и едут вместе с ними (решение Р-204).
  const fonts = path.join(SOURCE, 'fonts');
  if (existsSync(fonts)) cpSync(fonts, path.join(TARGET, 'fonts'), { recursive: true });

  writeFileSync(path.join(TARGET, 'index.html'), indexPage(files.length));
  console.log(`Артборды кабинета в витрине: ${files.length} и перечень`);
}

/**
 * Готовит снимок к выкладке: закрывает от поисковиков, переписывает
 * маршруты кабинета и обезвреживает формы.
 */
function publishable(html, slug) {
  let out = html.replace(
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="robots" content="noindex, nofollow">',
  );

  out = out.replace(/href="(\/cabinet[^"]*)"/gu, (whole, target) => {
    const board = resolve(target);
    return board === slug ? 'href="#"' : `href="${board}.html"`;
  });

  // Снимок сохранил формы вместе с адресами серверных действий. Отправлять
  // их некуда, а нажатие «Войти» на витрине не должно давать ошибку сервера
  // вместо экрана.
  out = out.replace(/<form(\s)/gu, '<form onsubmit="return false"$1');
  out = out.replace(/\s(action|formaction)="[^"]*"/gu, '');

  return out;
}

/** Артборд, на который переводится маршрут кабинета; иначе — перечень. */
function resolve(target) {
  const clean = target.split('?')[0].split('#')[0].replace(/\/$/u, '') || '/cabinet';
  for (const [pattern, board] of ROUTES) {
    if (pattern.test(clean)) return board;
  }
  return 'index';
}

function indexPage(count) {
  const cards = BOARDS.map(
    ([slug, title, note]) => `      <li>
        <a href="${slug}.html">
          <span class="num">${slug.slice(0, 2)}</span>
          <span class="title">${title}</span>
          <span class="note">${note}</span>
        </a>
      </li>`,
  ).join('\n');

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Экраны личного кабинета — ProDisser</title>
<style>
  :root { --pd-accent:#14417A; --pd-ink:#14161C; --pd-ink-muted:#5C6473;
    --pd-border:#DDE2EA; --pd-surface-quiet:#F5F7FA; }
  * { box-sizing:border-box; }
  body { margin:0; background:#fff; color:var(--pd-ink); padding:48px 24px 72px;
    font-family:'Inter','Helvetica Neue',Arial,sans-serif; }
  main { max-width:1220px; margin:0 auto; }
  .mono { font-family:'JetBrains Mono',ui-monospace,monospace; font-size:12px;
    letter-spacing:.08em; text-transform:uppercase; color:var(--pd-ink-muted); }
  h1 { font-family:'Literata',Georgia,'Times New Roman',serif; font-weight:400;
    font-size:clamp(28px,3.4vw,40px); line-height:1.2; margin:12px 0 16px; }
  p { font-size:16px; line-height:1.65; color:var(--pd-ink-muted); margin:0 0 14px; max-width:78ch; }
  ul { list-style:none; margin:32px 0 0; padding:0;
    display:grid; gap:16px; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); }
  li a { display:grid; gap:6px; align-content:start; height:100%; padding:20px;
    border:1px solid var(--pd-border); border-radius:14px; text-decoration:none; color:inherit;
    background:#fff; }
  li a:hover { border-color:var(--pd-accent); background:var(--pd-surface-quiet); }
  .num { font-family:'JetBrains Mono',ui-monospace,monospace; font-size:12px; color:var(--pd-accent); }
  .title { font-size:18px; font-weight:600; }
  .note { font-size:14px; line-height:1.55; color:var(--pd-ink-muted); }
  .back { display:inline-flex; align-items:center; min-height:44px; padding:0 22px; margin-top:36px;
    border:1px solid var(--pd-ink); border-radius:999px; color:var(--pd-ink);
    text-decoration:none; font-weight:600; font-size:15px; }
</style>
</head>
<body>
<main>
  <span class="mono">Личный кабинет ProDisser</span>
  <h1>Экраны кабинета — ${count} снимков</h1>
  <p>Кабинет работает на сервере: вход по одноразовой ссылке, серверные сессии, материалы и
  переписка хранятся в базе. Витрина сервера не имеет, поэтому здесь лежат снимки настоящих
  экранов, снятые с работающего приложения. Облик — тот же, что увидит пользователь.</p>
  <p>Что на снимке не работает: формы ничего не отправляют, фильтры и сортировки неподвижны,
  файлы не скачиваются. Переходы между экранами работают там, где нужный экран есть в этом
  наборе; остальные ведут сюда. Люди, суммы и темы работ вымышлены.</p>
  <ul>
${cards}
  </ul>
  <a class="back" href="/">К страницам сайта</a>
</main>
</body>
</html>
`;
}

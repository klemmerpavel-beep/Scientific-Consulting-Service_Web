/**
 * Шлифовка Р-796…Р-803 по проверке арт-директора 04.11.2026 (раскладка Р-803 —
 * по Р-814; снятые по
 * указанию владельца разделы — Р-807, Р-813, Р-824): облик, который
 * программные проверки страницы не ловят, а правка макета легко вернёт, —
 * тире в начале строки, разнобой номеров, «серп» кромки на скруглении,
 * таблица без имени, провалы в карточках, шкала, прыгающая под пальцем.
 * Проверка по исходникам: макет — источник правды, перенесённый компонент —
 * то, что уходит в сеть.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const COMPONENT = { MainPage: 'PostgradPage', StudentsPage: 'StudentsPage', BusinessPage: 'BusinessPage' } as const;
type Page = keyof typeof COMPONENT;
const design = (page: Page) => read('design', `${page}.dc.html`);
/** Макет и перенесённый компонент страницы — с подписью для сообщения. */
const both = (page: Page): Array<[string, string]> => [
  [`design/${page}.dc.html`, design(page)],
  [`${COMPONENT[page]}.tsx`, read('app', 'src', 'components', 'pages', `${COMPONENT[page]}.tsx`)],
];
/** Массив данных логики: от его начала до ближайшего «].map». */
const data = (source: string, head: string) => {
  const at = source.indexOf(head);
  assert.ok(at >= 0, `нет данных ${head}`);
  return source.slice(at, source.indexOf('].map', at));
};
const NB = ' ';

/**
 * Видимый текст макета (доводка 05.11.2026): текстовые узлы шаблона вне
 * <head>, <style>, <script>, комментариев и выражений {{ }} и строковые
 * литералы сценария data-dc-script вне комментариев JS. Атрибуты, CSS,
 * комментарии и код сюда не входят, литерал значения атрибута (`aria: '…'`)
 * тоже: тире там строку не начинает.
 */
const visibleText = (html: string): string[] => {
  const out: string[] = [];
  const body = html.replace(/<head>[\s\S]*?<\/head>/u, '');
  const markup = body.replace(/<!--[\s\S]*?-->|<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gu, '<>');
  for (const m of markup.matchAll(/>([^<>]*)</gu)) {
    for (const part of m[1]!.split(/\{\{[\s\S]*?\}\}/u)) if (part.trim()) out.push(part);
  }
  const code = body.match(/<script[^>]*data-dc-script[^>]*>([\s\S]*?)<\/script>/u)?.[1] ?? '';
  let lineStart = 0;
  let prev = '';
  for (let i = 0; i < code.length; ) {
    const c = code[i]!;
    if (c === '\n') { lineStart = i + 1; i++; continue; }
    if (code.startsWith('//', i)) { const j = code.indexOf('\n', i); i = j < 0 ? code.length : j; continue; }
    if (code.startsWith('/*', i)) { const j = code.indexOf('*/', i + 2); i = j < 0 ? code.length : j + 2; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const parts: string[] = [];
      let part = '';
      let j = i + 1;
      while (j < code.length && code[j] !== c) {
        if (code[j] === '\\') { part += code.slice(j, j + 2); j += 2; continue; }
        if (c === '`' && code.startsWith('${', j)) {
          parts.push(part);
          part = '';
          let depth = 1;
          for (j += 2; j < code.length && depth; j++) depth += code[j] === '{' ? 1 : code[j] === '}' ? -1 : 0;
          continue;
        }
        part += code[j];
        j++;
      }
      parts.push(part);
      if (!/\baria\s*:[^,\n]*$/u.test(code.slice(lineStart, i))) out.push(...parts.filter((p) => p.trim()));
      i = j + 1;
      prev = 'x';
      continue;
    }
    if (c === '/' && /^$|[(,=:[!&|?{};]$|^return$/u.test(prev)) {
      // регулярное выражение: кавычки внутри него — не строка
      let j = i + 1;
      for (let cls = false; j < code.length && (code[j] !== '/' || cls); j++) {
        if (code[j] === '\\') j++;
        else if (code[j] === '[') cls = true;
        else if (code[j] === ']') cls = false;
      }
      for (i = j + 1; i < code.length && /[a-z]/u.test(code[i]!); ) i++;
      prev = 'x';
      continue;
    }
    if (/\s/u.test(c)) { i++; continue; }
    const word = /^[\w$]+/u.exec(code.slice(i, i + 40))?.[0];
    if (word) { prev = /^(return|typeof|case)$/u.test(word) ? 'return' : 'x'; i += word.length; continue; }
    prev = c;
    i++;
  }
  return out;
};
/** Обычный пробел или перенос строки разметки перед тире: здесь тире уйдёт в начало строки. */
const dashGaps = (html: string): string[] =>
  visibleText(html).flatMap((t) => [...t.matchAll(/[ \t\r\n]+(?=[—–])/gu)].map((m) =>
    `${t.slice(Math.max(0, m.index - 24), m.index)}·${t.slice(m.index + m[0].length, m.index + m[0].length + 16)}`.replace(/\s+/gu, ' ')));
/** В видимом тексте макета перед тире нет обычного пробела, и перенос в компонент сохранил неразрывные. */
const assertDashesBound = (page: Page) => {
  const html = design(page);
  assert.deepEqual(dashGaps(html), [], `design/${page}.dc.html: обычный пробел перед тире — тире уйдёт в начало строки`);
  const bound = visibleText(html).flatMap((t) => [...t.matchAll(/[^\s<>{}&;]{1,16} [—–]/gu)].map((m) => m[0]));
  assert.ok(bound.length > 0, `design/${page}.dc.html: нет ни одного тире с неразрывным пробелом`);
  const tsx = both(page)[1];
  for (const phrase of new Set(bound)) assert.ok(tsx[1].includes(phrase), `${tsx[0]}: перенос потерял неразрывный пробел в «${phrase.replace(/ /gu, '·')}»`);
};

describe('Р-796: «Диагностика» на «Аспирантам»', () => {
  it('тире не начинает строку: перед тире — неразрывный пробел', () => {
    for (const [where, source] of both('MainPage')) {
      assert.doesNotMatch(data(source, 'const stalls = ['), / —/u, `${where}: в перечне перед тире обычный пробел — тире уйдёт в начало строки`);
      // Абзац «…а главы — другую.» снят с картой «точка остановки → что делает
      // разбор» (Р-809, указание владельца З-1): тире карты — в метке «Требования
      // совета»; метка «Доклад — за неделю…» снята с картой из шести точек (Р-836).
      for (const phrase of [`Требования совета${NB}— в${NB}последний месяц`, `этапы${NB}— с приёмкой`, `ждут от вас,${NB}— на одной карточке. Рядом${NB}— переписка`]) {
        assert.ok(source.includes(phrase), `${where}: нет неразрывного пробела в «${phrase.replace(/ /gu, '·')}»`);
      }
    }
  });

  it('во всём видимом тексте страницы перед тире — неразрывный пробел (доводка 05.11.2026)', () => {
    assertDashesBound('MainPage');
  });

  it('номер пункта перечня — исполнение «Карточки-списка»: Inter 13 px / 600 --pd-ink-muted, tabular-nums, без разрядки (К-9)', () => {
    // Факторы сметы, с которыми номер сравнивался, сняты вместе с разделом
    // «Стоимость» (Р-807): исполнение номера К-9 проверяется по значениям.
    const K9 = "font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:21px;font-weight:600;color:var(--pd-ink-muted);font-variant-numeric:tabular-nums";
    const html = design('MainPage');
    assert.equal(html.match(/<span style="([^"]*)">\{\{ p\.num \}\}<\/span>/u)?.[1], K9, 'номер перечня набран не по К-9');
    const tsx = both('MainPage')[1][1];
    assert.match(tsx, /<span style=\{\{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "21px", fontWeight: "600", color: "var\(--pd-ink-muted\)", fontVariantNumeric: "tabular-nums" \}\}>\{p\.num\}<\/span>/u, 'перенос изменил номер перечня');
  });

  it('шкалы плана «Как это выглядит у вас» нет — снята с инфографикой Р-836', () => {
    for (const [where, source] of both('MainPage')) {
      assert.doesNotMatch(source, /pd-plan-|Ход работы по этапам|trackAt|planLine/u, `${where}: осталась шкала плана`);
    }
  });
});

describe('Р-797: кромка карточки статьи на «Аспирантам» (раздел «Публикации к защите», Р-808)', () => {
  // Строка «Патент…» и её проверка сняты вместе с прежним разделом по указанию
  // владельца (З-3, Р-808); карточка статьи с кромкой осталась.
  it('кромка — псевдоэлементом ровной толщины, без border-top 2 px на скруглённой карточке', () => {
    for (const page of Object.keys(COMPONENT) as Page[]) {
      for (const tag of design(page).match(/<[a-z][^>]*\bstyle="[^"]*"[^>]*>/gu) ?? []) {
        const style = tag.match(/\bstyle="([^"]*)"/u)![1];
        assert.ok(!(/border-top:2px solid/u.test(style) && /border-radius/u.test(style)), `${page}: border-top 2 px у скруглённого блока даёт «серп»: ${tag.slice(0, 140)}`);
      }
    }
    for (const [where, source] of both('MainPage')) {
      assert.ok(source.includes('.pd-edge::before{content:"";position:absolute;top:-1px;left:-1px;right:-1px;height:15px;box-sizing:border-box;border:2px solid var(--pd-accent);border-bottom:0;border-radius:14px 14px 0 0;pointer-events:none}'), `${where}: нет правила кромки`);
    }
    assert.equal((design('MainPage').match(/<article class="pd-lift pd-edge"/gu) ?? []).length, 1, 'у карточки статьи нет кромки pd-edge');
  });
});

describe('Р-807: раздел «Стоимость» снят с «Аспирантам»', () => {
  // Р-798 оформлял раздел; по указанию владельца 05.11.2026 (З-4) раздел снят
  // с «Аспирантам» вместе со стилями и данными, факт о сумме — ответом «Вопросов».
  it('раздела #cost, пункта «Стоимость» в шапке и ссылок на #cost нет', () => {
    for (const [where, source] of both('MainPage')) {
      assert.doesNotMatch(source, /id="cost"/u, `${where}: раздел #cost остался`);
      assert.doesNotMatch(source, /href="#cost"/u, `${where}: ссылка на #cost осталась`);
      assert.doesNotMatch(source, />Стоимость</u, `${where}: пункт или метка «Стоимость» остались`);
    }
    for (const page of ['StartPage', 'StudentsPage', 'BusinessPage', 'ExpertsPage', 'NotFoundPage']) {
      assert.doesNotMatch(read('design', `${page}.dc.html`), /main\.html#cost|\/main#cost/u, `${page}: ссылка на /main#cost`);
    }
    // У «Студентам» своя «Стоимость» (#cost) — её правка не касается.
    assert.match(design('StudentsPage'), /<section id="cost"/u, '«Студентам»: раздел #cost пропал');
  });

  it('стилей и данных раздела не осталось', () => {
    for (const [where, source] of both('MainPage')) {
      for (const name of ['pd-costgrid', 'pd-termrow', 'pd-terms', 'pd-costlist', 'mp-cost-title', 'mp-cost-note', 'costFactors', 'termRows']) {
        assert.ok(!source.includes(name), `${where}: осталось «${name}»`);
      }
    }
  });

  it('факт раздела — одним ответом «Сколько это стоит?», без повтора на странице', () => {
    const fact = `Сумму вы видите в${NB}Задании, до${NB}оплаты; стоимость фиксируется в${NB}Задании и${NB}меняется только дополнительным соглашением к${NB}нему, которое подписываете вы.`;
    for (const [where, source] of both('MainPage')) {
      const faq = data(source, 'const faqData = [');
      assert.ok(faq.includes(`['Сколько это стоит?', 'Считаем по${NB}этапам после разбора ваших материалов. ${fact}']`), `${where}: ответ «Сколько это стоит?» не дополнен`);
      assert.equal(faq.split(/стоит\?'/u).length - 1, 1, `${where}: второй вопрос о стоимости`);
    }
    // Видимый текст макета (без комментариев): факт стоит один раз (Р-258).
    const shown = visibleText(design('MainPage')).join('\n');
    assert.equal(shown.split(/Сумму вы видите/u).length - 1, 1, '«Сумму вы видите…» повторено на странице');
    assert.equal(shown.split(/дополнительным соглашением/u).length - 1, 1, '«…дополнительным соглашением…» повторено на странице');
  });

  it('пустых правил и правила .pd-cost в таблице стилей нет', () => {
    const css = [...design('MainPage').matchAll(/<style>([\s\S]*?)<\/style>/gu)].map((m) => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//gu, '');
    assert.doesNotMatch(css, /\.pd-cost[,{]/u, 'осталось правило .pd-cost');
    assert.doesNotMatch(css, /,\s*\}/u, 'правило со списком селекторов без объявлений');
    assert.ok(!both('MainPage')[1][1].includes('.pd-cost,'));
  });
});

describe('Р-824: «План от даты защиты» снят с «Аспирантам»', () => {
  // Р-804 и Р-811 строили раздел; по замечанию владельца 06.11.2026 («сложно
  // говорить точно о сроках») раздел снят вместе со стилями, сценарием счёта
  // сроков и состоянием. Этапы работы — в «Шести шагах» (#process).
  it('раздела #defense-plan и ссылок на него нет ни на одной странице', () => {
    for (const [where, source] of both('MainPage')) {
      assert.doesNotMatch(source, /id="defense-plan"|mp-dp-title/u, `${where}: раздел остался`);
      assert.doesNotMatch(source, />План от даты защиты</u, `${where}: метка раздела осталась`);
      assert.doesNotMatch(source, /Сроки по Положению/u, `${where}: заголовок раздела остался`);
    }
    for (const page of ['MainPage', 'StartPage', 'StudentsPage', 'BusinessPage', 'ExpertsPage', 'NotFoundPage', 'ToolsPage']) {
      assert.doesNotMatch(read('design', `${page}.dc.html`), /#defense-plan/u, `${page}: ссылка на #defense-plan`);
    }
  });

  it('стилей, сценария и состояния раздела не осталось', () => {
    for (const [where, source] of both('MainPage')) {
      for (const name of ['pd-dp-', 'dpRules', 'dpPlan', 'dpSay', 'dpToday', 'dpNow', 'dpDate', 'dpKind', 'dpRows', 'dpPick']) {
        assert.ok(!source.includes(name), `${where}: осталось «${name}»`);
      }
    }
  });

  it('за «Шестью шагами» сразу идёт «Как это выглядит внутри»', () => {
    for (const [where, source] of both('MainPage')) {
      const process = source.search(/<section\b[^>]*\bid="process"/u);
      assert.ok(process > 0, `${where}: нет раздела #process`);
      const next = source.slice(source.indexOf('</section>', process) + '</section>'.length).match(/<section\b[^>]*\bid="([a-z-]+)"/u)?.[1];
      assert.equal(next, 'inside', `${where}: после #process — #${next}`);
    }
  });
});

describe('Р-799: «Смета на диплом» на «Студентам»', () => {
  it('тире не начинает строку: перед тире — неразрывный пробел', () => {
    for (const [where, source] of both('StudentsPage')) {
      for (const phrase of [`черновик готов${NB}— разный объём разбора.`, `каждая загрузка${NB}— отдельная версия`]) {
        assert.ok(source.includes(phrase), `${where}: нет неразрывного пробела в «${phrase.replace(/ /gu, '·')}»`);
      }
    }
  });
  it('во всём видимом тексте страницы перед тире — неразрывный пробел (доводка 05.11.2026)', () => {
    assertDashesBound('StudentsPage');
  });
});

describe('Р-800: «Что будет после отправки» на «Студентам»', () => {
  it('«Срок ответа — рабочий день» — тем же компонентом «Метка-факт», что срок на «Аспирантам»', () => {
    // Срок карточки статьи «Публикаций к защите» (данные articleCard, Р-808; до Р-808 — articleTracks).
    const fact = design('MainPage').match(/<span style="([^"]*)">\s*<span aria-hidden="true" style="([^"]*)"><\/span>\s*<span style="([^"]*)">\{\{ articleCard\.term \}\}<\/span>/u);
    const label = design('StudentsPage').match(/<span style="([^"]*)"><span aria-hidden="true" style="([^"]*)"><\/span><span style="([^"]*)">Срок ответа\u00a0— рабочий день<\/span><\/span>/u);
    assert.ok(fact, 'нет метки-факта срока на «Аспирантам»');
    assert.ok(label, 'подпись «Срок ответа — рабочий день» не метка-факт');
    assert.equal(label[1], fact[1], 'подложка метки другая');
    assert.equal(label[3], fact[3], 'текст метки набран иначе');
    assert.doesNotMatch(label[0], /text-transform:uppercase/u);
  });

  it('шаги — вертикальной шкалой справа от формы на её высоту, как на «Компаниям» (Р-846)', () => {
    for (const [where, source] of both('StudentsPage')) {
      assert.ok(source.includes('@media (min-width:769px){.sp-reqsteps .pd-track-v{flex:1 1 auto}.sp-reqsteps .pd-track-v>li:not(:last-child){flex:1 1 auto}}'), `${where}: шаги не на высоту формы`);
    }
    const html = design('StudentsPage');
    const req = html.slice(html.indexOf('<section id="request"'), html.indexOf('</section>', html.indexOf('<section id="request"')));
    assert.match(req, /<\/form>\s*<!--[\s\S]*?-->\s*<div class="sp-reqsteps"[\s\S]*<ol class="pd-track pd-track-v" role="list">/u);
    assert.match(req, /<div class="sp-reqask"[\s\S]*Что прислать для сметы[\s\S]*<ul class="sp-asklist"[\s\S]*askFor/u);
    assert.doesNotMatch(req, /image-slot|sp-afterbox/u, 'фото и горизонтальная шкала вернулись');
    assert.match(html, /<span class="pd-track-title" style="[^"]*">\{\{ s\.title \}\}<\/span>/u);
  });
});

describe('Р-801: «Уровень готовности технологии» на «Компаниям»', () => {
  it('шкала встаёт по центру только при смене ширины окна, не высоты', () => {
    for (const [where, source] of both('BusinessPage')) {
      const at = source.indexOf('this.onResize = () => {');
      assert.ok(at > 0, `${where}: нет обработчика смены размера окна`);
      const body = source.slice(at, source.indexOf("window.addEventListener('resize', this.onResize)", at));
      assert.equal((body.match(/this\.centerTrl\(\)/gu) ?? []).length, 1, `${where}: центрирование шкалы — не одним вызовом`);
      assert.match(body, /if \(window\.innerWidth !== this\.trlWidth\) \{ this\.trlWidth = window\.innerWidth; this\.centerTrl\(\); \}/u,
        `${where}: шкала центрируется при любой смене размера — на телефоне строка адреса двигает её под пальцем`);
      assert.match(source, /this\.trlWidth = window\.innerWidth;\s*this\.onResize = /u, `${where}: исходная ширина не запомнена`);
    }
  });

  it('во всём видимом тексте страницы перед тире — неразрывный пробел (доводка 05.11.2026)', () => {
    assertDashesBound('BusinessPage');
  });

  it('шапки колонок карточки уровня — в одной строке подсетки, прижаты к её низу', () => {
    for (const [where, source] of both('BusinessPage')) {
      assert.ok(source.includes('.bp-trlcol{display:grid;grid-row:span 2;grid-template-rows:subgrid;row-gap:12px;align-content:start;min-width:0}'), `${where}: колонка не подсетка`);
      assert.ok(source.includes('.bp-trlcolhead{align-self:end}'), `${where}: шапка не прижата к низу строки`);
    }
  });
});

describe('Р-835: блок заявки «Компаниям» без пустоты под формой', () => {
  // Владелец 07.11.2026: «под формой пустое пространство… выровнять блоки по
  // размерам и наполнению». Форма и шаги — две колонки одной высоты,
  // «Что прислать для сметы» — полосой на всю ширину под ними.
  const block = (source: string) => {
    const at = source.search(/<section\b[^>]*\bid="request"/u);
    assert.ok(at > 0, 'нет блока заявки');
    return source.slice(at, source.indexOf('</section>', at));
  };

  it('в сетке .bp-req три ячейки по порядку: форма, «Что будет после отправки», полоса «Что прислать для сметы»', () => {
    const html = block(design('BusinessPage'));
    const form = html.indexOf('<form ');
    const steps = html.indexOf('<div class="bp-reqsteps"');
    const ask = html.indexOf('<div class="bp-reqask"');
    assert.ok(form > 0 && steps > html.indexOf('</form>') && ask > steps, 'порядок ячеек другой');
    assert.doesNotMatch(html, /flex-direction:column;gap:12px;height:100%/u, 'правая колонка снова обёрткой на высоту формы');
    assert.match(html.slice(steps, ask), /Что будет после отправки/u);
    assert.match(html.slice(ask), /Что прислать для сметы[\s\S]*<div class="bp-asklist"[\s\S]*askFor/u);
  });

  it('стили: полоса на всю ширину, изображение слева от 769 px, пункты в две колонки от 1025 px', () => {
    for (const [where, source] of both('BusinessPage')) {
      for (const rule of [
        '.bp-reqask{grid-column:1 / -1;display:grid;grid-template-columns:minmax(0,1fr)}',
        '@media (min-width:769px){.bp-reqask{grid-template-columns:240px minmax(0,1fr)}',
        '@media (min-width:1025px){.bp-asklist{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 28px!important}}',
        '@media (min-width:769px){.bp-reqsteps .pd-track-v{flex:1 1 auto}.bp-reqsteps .pd-track-v>li:not(:last-child){flex:1 1 auto}}',
      ]) assert.ok(source.includes(rule), `${where}: нет правила «${rule.slice(0, 40)}…»`);
    }
  });

  it('форма прежняя: поля, их порядок и согласия не менялись', () => {
    const html = block(design('BusinessPage'));
    const form = html.slice(html.indexOf('<form '), html.indexOf('</form>'));
    const fields = [...form.matchAll(/<(input|select|textarea)\b[^>]*\bid="([^"]+)"/gu)].map((m) => m[2]);
    assert.ok(fields.length >= 5, `полей формы ${fields.length}`);
    assert.match(form, /согласие на обработку персональных данных/u);
  });
});

describe('Р-834: шесть карточек условий на «Компаниям» одной высоты', () => {
  // Владелец 07.11.2026: «все блоки сделать одинакового размера». Общая
  // высота закрытых карточек — по самой высокой, от 769 px; раскрытие растит
  // только свою карточку (сетка остаётся align-items: start, Р-802).
  it('у карточки min-height из --bp-mech-h, подвал — нижняя строка, лишнее — в строку текста', () => {
    for (const [where, source] of both('BusinessPage')) {
      assert.ok(source.includes('row-gap:8px;min-height:var(--bp-mech-h,auto)}'), `${where}: у карточки нет общей высоты`);
      assert.ok(source.includes('grid-template-rows:auto 1fr auto;grid-template-areas:"img head" "img text" "foot foot"'), `${where}: строка текста не забирает лишнюю высоту`);
    }
  });

  it('fitMech: по самой высокой закрытой карточке, только от 769 px, после шрифтов и при смене ширины окна', () => {
    for (const [where, source] of both('BusinessPage')) {
      const at = source.indexOf('this.fitMech = () => {');
      assert.ok(at > 0, `${where}: нет расчёта общей высоты`);
      const body = source.slice(at, source.indexOf('};', source.indexOf("grid.style.setProperty('--bp-mech-h'", at)));
      assert.match(body, /grid\.style\.removeProperty\('--bp-mech-h'\);\s*if \(!window\.matchMedia\('\(min-width:769px\)'\)\.matches\) return;/u, `${where}: до 768 px общая высота не снимается`);
      assert.match(body, /c\.offsetHeight - \(p \? p\.offsetHeight \+ 18 : 0\)/u, `${where}: раскрытое пояснение входит в общую высоту`);
      assert.match(body, /Math\.max\(/u, `${where}: высота — не по самой высокой карточке`);
      assert.match(source, /this\.onMechResize = \(\) => \{ if \(window\.innerWidth !== this\.mechWidth\) \{ this\.mechWidth = window\.innerWidth; this\.fitMech\(\); \} \};/u, `${where}: пересчёт не по смене ширины`);
      assert.match(source, /document\.fonts\.ready\.then\(\(\) => this\.fitMech\(\)\)/u, `${where}: нет пересчёта после шрифтов`);
      assert.match(source, /window\.removeEventListener\('resize', this\.onMechResize\)/u, `${where}: обработчик не снимается`);
    }
  });
});

describe('Р-802: «Условия, закреплённые договором и приёмкой» на «Компаниям»', () => {
  it('карточки по своей высоте — без провала над «Чем закреплено» и без сдвига соседки при раскрытии', () => {
    for (const [where, source] of both('BusinessPage')) {
      assert.ok(source.includes('.bp-mech{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start}'), `${where}: карточки тянутся до соседки`);
      assert.doesNotMatch(source, /pairOpen|r\.align\b|align: pairOpen/u, `${where}: высоту карточки снова задаёт логика раскрытия`);
    }
    assert.doesNotMatch(design('BusinessPage'), /align-self:\{\{ r\.align \}\}/u);
  });

  it('на 769—1100 px — изображение 64 px рядом с заголовком, текст на всю ширину', () => {
    for (const [where, source] of both('BusinessPage')) {
      assert.ok(source.includes('@media (min-width:769px) and (max-width:1100px){.bp-mechcard{grid-template-columns:64px minmax(0,1fr);grid-template-rows:auto 1fr auto;grid-template-areas:"img head" "text text" "foot foot";'), `${where}: нет раскладки 769—1100 px`);
    }
  });

  it('у кнопки «Чем закреплено» внутренний отступ: кольцо фокуса не касается буквы', () => {
    const button = design('BusinessPage').match(/<button type="button" class="bp-mechbtn"[^>]*>/u)?.[0] ?? '';
    assert.match(button, /padding:0 8px;margin:0 -8px;width:calc\(100% \+ 16px\);box-sizing:border-box/u);
  });

  it('тире не начинает строку: перед тире — неразрывный пробел', () => {
    for (const [where, source] of both('BusinessPage')) {
      for (const phrase of [`Предмет договора${NB}— соответствие требованиям`, `ждут от вас,${NB}— на одной карточке. Рядом${NB}— переписка`]) {
        assert.ok(source.includes(phrase), `${where}: нет неразрывного пробела в «${phrase.replace(/ /gu, '·')}»`);
      }
    }
  });
});

describe('Р-813: раздел «Шесть задач компании» снят с «Компаниям»', () => {
  // Р-806 добавил раздел #tasks между шкалой УГТ и пакетами; по указанию
  // владельца 05.11.2026 (З-7) он снят вместе со стилями, данными и
  // ограничителем site-business-tasks, который охранял только его.
  it('раздела, ссылок на него, стилей и данных не осталось', () => {
    for (const [where, source] of both('BusinessPage')) {
      assert.doesNotMatch(source, /id="tasks"|href="#tasks"|bp-tasks-title/u, `${where}: раздел #tasks или ссылка на него остались`);
      for (const name of ['bp-task', 'const TASKS', 'Шесть задач компании', 'Обсудить задачу', 'Другая задача', 'Строка ведёт к пакету']) {
        assert.ok(!source.includes(name), `${where}: осталось «${name}»`);
      }
    }
    for (const page of ['StartPage', 'MainPage', 'StudentsPage', 'ExpertsPage', 'NotFoundPage']) {
      assert.doesNotMatch(read('design', `${page}.dc.html`), /business\.html#tasks|\/business#tasks/u, `${page}: ссылка на /business#tasks`);
    }
    assert.doesNotMatch(read('docs', 'DESIGN-SYSTEM.md'), /Перечень «задача → пакет»/u, 'DESIGN-SYSTEM, §7: строка снятого компонента');
  });

  it('за шкалой УГТ сразу «Пять пакетов»; уточнение «из перечня» на шкале осталось', () => {
    const html = design('BusinessPage');
    const trl = html.indexOf('<section id="trl"');
    const next = html.indexOf('<section', html.indexOf('</section>', trl));
    assert.ok(trl > 0 && html.startsWith('<section id="packs"', next), 'за #trl не «Пять пакетов»');
    for (const [where, source] of both('BusinessPage')) {
      assert.ok(source.includes('Повышающий коэффициент к расходам на НИОКР из перечня, п. 7 ст. 262 НК РФ.'), `${where}: на шкале УГТ пропало «из перечня»`);
    }
  });
});

describe('Р-814: «Права и конфиденциальность» на «Компаниям» — сетка 3 × 2 (раскладка Р-803 заменена)', () => {
  // Р-803 ставил тёмную панель по её содержимому рядом со списком из пяти
  // пунктов: под панелью оставалось пустое поле в 250—270 px. По замечанию
  // владельца З-8 (05.11.2026) шесть пунктов — шесть плиток одной сеткой,
  // плитки ряда одной высоты; первая — тёмная. Тексты, значки, номера и
  // порядок — прежние.
  /** Разметка раздела #rights — в макете и в перенесённом компоненте (JSX). */
  const section = (source: string) => {
    const at = source.lastIndexOf('<section', source.indexOf('id="rights"'));
    assert.ok(at >= 0 && source.indexOf('id="rights"') > 0, 'нет раздела #rights');
    return source.slice(at, source.indexOf('</section>', at));
  };

  it('шесть плиток одной сеткой: 3 колонки от 1200 px, 2 на 769—1199 px, одна до 768 px; высота ряда общая', () => {
    for (const [where, source] of both('BusinessPage')) {
      assert.ok(source.includes('.bp-rights{display:grid;grid-template-columns:minmax(0,1.3fr) repeat(2,minmax(0,1fr));align-items:stretch;list-style:none;margin:0;padding:0}'), `${where}: сетка плиток не 3 колонки с общей высотой ряда`);
      assert.ok(source.includes('@media (max-width:1199px){.bp-rights{grid-template-columns:repeat(2,minmax(0,1fr))}}'), `${where}: на 769—1199 px не две колонки`);
      assert.match(source, /@media \(max-width:768px\)\{[^{}]*\.bp-rights[,{][^{}]*\{grid-template-columns:minmax\(0,1fr\)\}/u, `${where}: до 768 px не одна колонка`);
      assert.ok(source.includes('.bp-right{display:flex;flex-direction:column;gap:20px;min-width:0;box-sizing:border-box;border-radius:14px;padding:clamp(20px,2vw,28px);box-shadow:0 6px 14px rgba(20,22,28,.06),0 1px 2px rgba(20,22,28,.05)}'), `${where}: устройство плитки`);
      for (const gone of ['bp-rightlead', 'bp-rightlist', 'bp-rightart', 'align-items:start}']) {
        assert.ok(!section(source).includes(gone) && !source.includes(`.${gone}`), `${where}: осталась раскладка Р-803 — «${gone}»`);
      }
    }
    const html = section(design('BusinessPage'));
    assert.match(html, /<ul role="list" class="bp-rights" style="gap:16px">\n<li class="bp-right bp-right-lead pd-lift"/u, 'первая плитка — не первым пунктом сетки');
    assert.match(html, /<sc-for list="\{\{ rightsRest \}\}" as="r" hint-placeholder-count="5">\n<li class="bp-right pd-lift" style="background:var\(--pd-ink-inverse\);border:1px solid var\(--pd-border\)">/u, 'пять светлых плиток — не в той же сетке');
    assert.equal((html.match(/<li class="bp-right[ "]/gu) ?? []).length, 2, 'плитки размечены не двумя ветками (первая и цикл)');
    assert.ok(!/<article|<svg/u.test(html), 'в разделе панель-статья или кольца');
  });

  it('тёмная одна — первая плитка «Исключительные права»; у всех плиток значок 22 на плашке 44, номер и заголовок 17 px', () => {
    for (const [where, source] of both('BusinessPage')) {
      const html = section(source);
      assert.equal((html.match(/accent-deep/gu) ?? []).length, 2, `${where}: в разделе не одна тёмная плитка (фон и рамка)`);
      const split = html.indexOf('rightsRest');
      assert.ok(split > 0, `${where}: нет цикла пяти светлых плиток`);
      assert.ok(html.slice(0, split).includes('accent-deep'), `${where}: тёмная — не первая плитка`);
      assert.ok(!html.slice(split).includes('accent-deep'), `${where}: тёмная плитка среди пяти светлых`);
    }
    const jsx = section(read('app', 'src', 'components', 'pages', 'BusinessPage.tsx'));
    assert.ok(jsx.includes('<li className="bp-right bp-right-lead pd-lift" style={{ background: "var(--pd-accent-deep)", border: "1px solid var(--pd-accent-deep)" }}>'), 'BusinessPage.tsx: первая плитка не тёмная');
    assert.ok(jsx.includes('{(rightsRest ?? []).map((r: any, _i0: number) => (<React.Fragment key={_i0}><li className="bp-right pd-lift" style={{ background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)" }}>'), 'BusinessPage.tsx: пять светлых плиток не циклом в той же сетке');
    const html = section(design('BusinessPage'));
    const split = html.indexOf('rightsRest');
    for (const [part, name] of [[html.slice(0, split), 'rightsLead'], [html.slice(split), 'r']] as const) {
      assert.match(part, /<span aria-hidden="true" style="width:44px;height:44px;flex:0 0 44px;border-radius:10px;/u, `плашка значка не 44 px (${name})`);
      assert.match(part, new RegExp(`<span style="width:22px;height:22px;display:block;[^"]*mask:\\{\\{ ${name}\\.icon \\}\\}"`, 'u'), `значок не 22 px (${name})`);
      assert.match(part, new RegExp(`<div class="bp-righthead">\\n<span aria-hidden="true"[^\\n]*\\n<span style="[^"]*tabular-nums[^"]*">\\{\\{ ${name}\\.num \\}\\}</span>\\n</div>`, 'u'), `номер не справа от значка (${name})`);
      assert.match(part, new RegExp(`<h3 style="margin:0;font-family:'Literata',Georgia,'Times New Roman',serif;font-size:17px;line-height:1\\.4;font-weight:600;[^"]*">\\{\\{ ${name}\\.label \\}\\}</h3>`, 'u'), `заголовок плитки не 17 px (${name})`);
      assert.match(part, new RegExp(`<p style="margin:0;font-size:14px;line-height:1\\.6;[^"]*">\\{\\{ ${name}\\.text \\}\\}</p>`, 'u'), `текст плитки не 14 px (${name})`);
    }
  });

  it('тексты, значки и порядок шести пунктов прежние (Р-803)', () => {
    const accepted = [
      ['Исключительные права', 'Права на результаты интеллектуальной деятельности переходят заказчику. Условие закреплено пунктом договора об отчуждении прав.', 'pd-asset'],
      ['Кто подписывает NDA', 'Соглашение о неразглашении подписывает каждый участник проектной команды до получения доступа к материалам.', 'pd-nda'],
      ['Материалы после проекта', 'По акту передаём материалы и удаляем рабочие копии. Срок хранения и порядок удаления записаны в договоре.', 'pd-contract'],
      ['На кого оформляется охранный документ', `Заявитель и правообладатель${NB}— ваша компания. Мы готовим документы и сопровождаем подачу, не выступая правообладателем.`, 'award'],
      ['Повторное использование', 'Материалы проекта не используются в других работах и не показываются как пример. Публичных кейсов у нас нет.', 'shield'],
      ['Служебные результаты', 'Помогаем оформить положение о служебных результатах, уведомления авторов и приказы внутри вашей компании.', 'pd-team'],
    ];
    for (const [where, source] of both('BusinessPage')) {
      const rows = [...data(source, 'const rights = [').matchAll(/\['([^']*)', '([^']*)', '([^']*)'\]/gu)].map((m) => [m[1], m[2], m[3]]);
      assert.deepEqual(rows, accepted, `${where}: тексты, значки или порядок пунктов изменились`);
      assert.ok(source.includes("label, text, num: '0' + (i + 1),"), `${where}: номера 01—06`);
      assert.ok(source.includes('return { rightsLead: rights[0], rightsRest: rights.slice(1) };'), `${where}: первая плитка — не первый пункт`);
    }
    const head = visibleText(section(design('BusinessPage'))).map((t) => t.trim()).filter(Boolean);
    assert.deepEqual(head, ['Права и конфиденциальность', `Кому принадлежит результат и${NB}что происходит с${NB}материалами`, 'Права на результат остаются у вашей компании'], 'шапка раздела изменилась');
  });
});

/**
 * Сайт (решение Р-770, пункты С-3 и С-5 задания, П-5): порядок работы на
 * «Аспирантам», «Студентам» и «Компаниям» — по концепции: заявка и ответ
 * менеджера → личный кабинет и материалы по перечню «Что подготовить» →
 * куратор и созвон знакомства до 20 минут → итог консультации и Задание →
 * этапы с приёмкой. Сумму клиент видит в Задании, до оплаты (оферта,
 * раздел 6), а не «на консультации». Для клиента две роли — менеджер и
 * куратор (Р-322): «четырёх ролей», «состава команды» и «чек-листа из
 * 74 пунктов» на сайте нет.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { findForbidden } from '../src/lib/cabinet/text-guard.ts';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8');
/** Неразрывный пробел — обычный, без «склейки слов» (U+2060): так фразы сверяются без оглядки на вёрстку. */
const plain = (source: string) => source.replace(/\u00a0|&nbsp;/gu, ' ').replace(/\u2060/gu, '');
const design = (page: string) => plain(read(`design/${page}.dc.html`));
/**
 * Источник без раздела «Кто сопровождает» (орбита ролей): там четыре роли и
 * карточки возвращены указанием владельца 04.11.2026 (Р-795), на остальной
 * странице для клиента по-прежнему две роли — менеджер и куратор (Р-770).
 */
const withoutTeam = (source: string) => {
  const k = source.search(/class(?:Name)?="(?:pd|sp|bp)-orbit"/u);
  if (k < 0) return source;
  return source.slice(0, source.lastIndexOf('<section', k)) + source.slice(source.indexOf('</section>', k));
};

/** Пять шагов концепции: название шага и что обязательно сказано в его тексте («Шесть шагов» «Аспирантам»). */
const CONCEPT: ReadonlyArray<readonly [string, readonly RegExp[]]> = [
  ['Заявка и ответ менеджера', [/в течение рабочего дня/u, /Пн—Пт 10:00—19:00/u]],
  ['Личный кабинет', [/Менеджер открывает/u, /по перечню «Что подготовить»/u]],
  ['Куратор и созвон знакомства', [/до 20 минут/u]],
  ['Итог консультации и Задание', [/[Сс]остав работ, календарный план и стоимость по этапам/u, /согласуете [^']*в кабинете/u]],
  ['Этапы с приёмкой', [/Следующий этап оплачивается после приёмки предыдущего/u]],
];
/**
 * Те же пять шагов в панели «Что будет после отправки» у формы заявки — в
 * редакции Р-885 (замечание владельца 13.11.2026: «текст переработать,
 * сделать более понятным»): порядок и факты прежние, вместо перечня
 * «Что подготовить» — что именно загружается в кабинет.
 */
const AFTER: ReadonlyArray<readonly [string, readonly RegExp[]]> = [
  ['Менеджер отвечает', [/в течение рабочего дня/u, /Пн—Пт 10:00—19:00/u]],
  ['Доступ в личный кабинет', [/Менеджер открывает/u, /вы загружаете/u]],
  ['Знакомство с куратором', [/до 20 минут/u]],
  ['Задание и смета', [/[Сс]остав работ, календарный план и стоимость каждого этапа/u, /согласуете [^']*в кабинете/u]],
  ['Работа по этапам', [/принимаете в кабинете/u, /Следующий этап оплачивается после приёмки предыдущего/u]],
];

/** Строки массива данных макета: у каждой — название шага и его текст. */
function steps(html: string, head: string, end: string): Array<{ title: string; text: string }> {
  const at = html.indexOf(head);
  assert.ok(at > 0, `нет данных ${head}`);
  const block = html.slice(at + head.length, html.indexOf(end, at));
  return block
    .split('\n')
    .map((line) => [...line.matchAll(/'([^']*)'/gu)].map((m) => m[1]!).filter((s) => s !== '' && !/^\d\d$/u.test(s)))
    .filter((cells) => cells.length >= 2)
    .map((cells) => ({ title: cells[0]!, text: cells[cells.length - 1]! }));
}

const PAGES = {
  MainPage: { component: 'PostgradPage', concept: CONCEPT, list: () => steps(design('MainPage'), 'const stepData = [', '];') },
  MainPageAfter: { component: 'PostgradPage', concept: AFTER, list: () => steps(design('MainPage'), 'afterSteps: [', '].map') },
  StudentsPage: { component: 'StudentsPage', concept: AFTER, list: () => steps(design('StudentsPage'), 'afterSteps: [', '].map') },
  BusinessPage: { component: 'BusinessPage', concept: AFTER, list: () => steps(design('BusinessPage'), 'afterSteps: [', '].map') },
} as const;

describe('шаги работы — в порядке концепции (С-3, П-5)', () => {
  for (const [page, { component, list, concept }] of Object.entries(PAGES)) {
    it(`${page}: заявка → кабинет → куратор и созвон → итог и Задание → этапы с приёмкой`, () => {
      const rows = list();
      assert.deepEqual(rows.slice(0, 5).map((row) => row.title), concept.map(([title]) => title));
      concept.forEach(([title, musts], i) => {
        for (const must of musts) assert.match(rows[i]!.text, must, `${title}: нет ${must}`);
      });
      // Кабинет не раньше ответа менеджера, куратор — не раньше кабинета.
      assert.doesNotMatch(rows[0]!.text, /куратор/iu, 'куратор в шаге заявки');
      assert.doesNotMatch(rows[1]!.text, /куратор/iu, 'куратор в шаге кабинета');
      const tsx = plain(read(`app/src/components/pages/${component}.tsx`));
      let from = 0;
      for (const [title] of concept) {
        const at = tsx.indexOf(`'${title}'`, from);
        assert.ok(at > from, `в перенесённом компоненте нет шага «${title}» на месте`);
        from = at;
      }
    });
  }

  it('«Аспирантам»: шестой шаг — подготовка к защите как завершающий этап Задания', () => {
    const rows = PAGES.MainPage.list();
    assert.equal(rows.length, 6);
    assert.equal(rows[5]!.title, 'Подготовка к защите');
    assert.match(rows[5]!.text, /^Завершающий этап Задания/u);
    const main = design('MainPage');
    assert.ok(main.includes('>Шесть шагов от заявки до защиты</h2>'));
    assert.ok(main.includes('>Этапы по Заданию закрываются актом приёмки</span>'));
    assert.ok(main.includes('>6 шагов</span>'), 'плашка первого экрана считает шаги');
  });

  it('«Студентам» и «Компаниям»: в списке пять шагов, подсказка заготовки — тоже пять', () => {
    for (const page of ['StudentsPage', 'BusinessPage'] as const) {
      assert.equal(PAGES[page].list().length, 5, page);
      assert.ok(design(page).includes('<sc-for list="{{ afterSteps }}" as="s" hint-placeholder-count="5">'), page);
    }
    // Пять шагов у формы — тёмной панелью по образцу «Экспертам» (Р-885).
    for (const page of ['StudentsPage', 'BusinessPage', 'MainPage'] as const) {
      assert.ok(design(page).includes('<ol class="pd-afterflow" role="list" aria-label="Шаги после заявки">'), page);
    }
    assert.equal(PAGES.MainPageAfter.list().length, 5);
  });

  it('вопрос «С чего начинается работа?» — тем же порядком («Студентам», «Компаниям»)', () => {
    for (const page of ['StudentsPage', 'BusinessPage'] as const) {
      const html = design(page);
      const at = html.indexOf("['С чего начинается работа?',");
      assert.ok(at > 0, page);
      const answer = html.slice(at, html.indexOf("']", at));
      const order = ['в течение рабочего дня', 'личный кабинет', '«Что подготовить»', 'созвоне знакомства до 20 минут', 'Задани'];
      let from = 0;
      for (const piece of order) {
        const pos = answer.indexOf(piece, from);
        assert.ok(pos >= from, `${page}: «${piece}» не на месте`);
        from = pos;
      }
    }
  });
});

describe('сумма — в Задании, до оплаты (С-3, оферта, раздел 6)', () => {
  const SITE = ['StartPage', 'MainPage', 'StudentsPage', 'BusinessPage'] as const;

  it('нет «сумму называем на консультации» и сметы «в договоре»', () => {
    for (const page of SITE) {
      const html = design(page);
      assert.doesNotMatch(html, /[Сс]умму называем/u, page);
      assert.doesNotMatch(html, /оцениваем до оплаты, на консультации/u, page);
      assert.doesNotMatch(html, /от подписания договора/u, page);
      assert.doesNotMatch(html, /[Сс]мета (?:фиксируется|попадает) в договор/u, page);
      assert.doesNotMatch(html, /смета в договоре/u, page);
    }
  });

  it('«Сумму вы видите в Задании, до оплаты» — на «Аспирантам», «Студентам» и главной', () => {
    for (const page of ['MainPage', 'StudentsPage', 'StartPage'] as const) {
      assert.match(design(page), /Сумму вы видите в Задании, до оплаты/u, page);
    }
  });

  it('«Компаниям»: установочной сессии на сорок минут нет — созвон знакомства до 20 минут', () => {
    const business = design('BusinessPage');
    assert.doesNotMatch(business, /установочн|сорок минут|40 минут/iu);
    assert.ok(business.includes('>Те же вопросы разбираем на созвоне знакомства</span>'));
    assert.ok(business.includes('>Заявка принята. Менеджер ответит в течение рабочего дня и пришлёт NDA.</span>'));
  });
});

describe('две роли для клиента — менеджер и куратор (С-5, Р-322)', () => {
  const SITE = [
    ['StartPage', 'StartPage'],
    ['MainPage', 'PostgradPage'],
    ['StudentsPage', 'StudentsPage'],
    ['BusinessPage', 'BusinessPage'],
  ] as const;

  it('вне «Кто сопровождает» нет «четырёх ролей», «четверых», «04 специалиста», «состава команды» и отдельных методолога и редактора', () => {
    for (const [page, component] of SITE) {
      for (const source of [withoutTeam(design(page)), withoutTeam(plain(read(`app/src/components/pages/${component}.tsx`)))]) {
        assert.doesNotMatch(source, /[Чч]етыре роли|закреплены четверо|специалиста закрепляем|[Сс]остав команды/u, page);
        assert.doesNotMatch(source, />Методолог<|>Научный редактор|Эксперт по специальности|научный редактор —|методолог —/u, page);
        assert.doesNotMatch(source, /проверяют куратор и научный редактор|вычитку научного редактора/u, page);
      }
    }
  });

  it('«чек-листа из 74 пунктов» нет — перечень «Что подготовить» в кабинете', () => {
    for (const [page, component] of SITE) {
      assert.doesNotMatch(design(page), /74 пункт/u, page);
      assert.doesNotMatch(read(`app/src/components/pages/${component}.tsx`), /74 пункт/u, component);
    }
    assert.ok(design('StartPage').includes('>Перечень «Что подготовить» по виду работы — в кабинете до начала работы.</p>'));
    assert.ok(design('MainPage').includes("'Перечень «Что подготовить» по виду работы — в кабинете до начала работы'"));
  });

  it('«Кто сопровождает»: четыре роли и четыре карточки на орбите (Р-795)', () => {
    const ROLES = {
      MainPage: ['pd', ['Менеджер', 'Методолог', 'Научный редактор', 'Эксперт по специальности'], 'Менеджер, эксперт по специальности, методолог и научный редактор ведут проект до защиты.'],
      StudentsPage: ['sp', ['Менеджер', 'Методолог', 'Научный редактор', 'Куратор по специальности'], 'Над работой закреплены четверо: менеджер, куратор по специальности, методолог и научный редактор.'],
      BusinessPage: ['bp', ['Менеджер', 'Методолог', 'Научный редактор', 'Эксперт по специальности'], 'За проектом закреплены четверо: менеджер, отраслевой эксперт, методолог и научный редактор.'],
    } as const;
    for (const [page, [cls, titles, lead]] of Object.entries(ROLES)) {
      const html = design(page);
      assert.ok(html.includes(lead), `${page}: нет лида четырёх ролей`);
      assert.match(html, />04<\/span><span [^>]*>специалиста закрепляем за (?:проектом|работой) до (?:самой защиты|сдачи результата)<\/span>/u, page);
      assert.equal([...html.matchAll(new RegExp(`<div class="${cls}-crew" `, 'gu'))].length, 4, `${page}: карточек ролей не четыре`);
      const orbit = html.slice(html.indexOf(`<div class="${cls}-orbit"`), html.indexOf('</section>', html.indexOf(`<div class="${cls}-orbit"`)));
      const found = [...orbit.matchAll(/font-weight:600;color:var\(--pd-ink\)">([^<]+)<\/span>/gu)].map((m) => m[1]);
      assert.deepEqual(found, [...titles], page);
      assert.equal([...orbit.matchAll(new RegExp(`class="${cls}-dot"`, 'gu'))].length, 4, `${page}: точек орбиты не четыре`);
      for (const fig of ['manager', 'method', 'editor', 'expert']) assert.ok(orbit.includes(`./assets/crew/${fig}.webp`), `${page}: нет фигуры ${fig}`);
      // Движение и раскладка блока — прежние: до 1024 px орбита — сетка в две колонки.
      assert.ok(html.includes(`.${cls}-orbit{position:static;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;aspect-ratio:auto!important;width:100%}`), page);
      // Метки направлений — словами Р-771 и Р-785, без «научной редактуры».
      assert.doesNotMatch(orbit, /научн[а-яё]*[\s ]+редактур/iu, page);
    }
  });

  it('«Студентам»: номер роли в углу карточки с одним отступом, описание куратора в три строки (Р-840)', () => {
    const html = design('StudentsPage');
    const orbit = html.slice(html.indexOf('<div class="sp-orbit"'), html.indexOf('</section>', html.indexOf('<div class="sp-orbit"')));
    const nums = [...orbit.matchAll(/<span class="sp-crewnum" style="position:absolute;top:20px;right:19px;[^"]*">(0[1-4])<\/span>/gu)].map((m) => m[1]);
    assert.deepEqual(nums, ['01', '02', '03', '04'], 'номера ролей не в углу карточки');
    // Номер больше не стоит в строке заголовка: «специальности» выталкивало «04» на поле карточки.
    assert.doesNotMatch(orbit, /margin-left:auto;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1\.4;color:var\(--pd-ink-muted\)">0[1-4]</u);
    assert.ok(orbit.includes('>Разбирает с автором тему и содержание глав.</span>'), 'описание куратора');
  });

  it('главная: карточка «Две роли» словами задания', () => {
    const start = design('StartPage');
    assert.ok(start.includes('>Менеджер — сроки, документы, оплаты. Куратор со степенью по вашей специальности — содержание и методология.</p>'));
    assert.ok(start.includes('>Методологический разбор и научная экспертиза текста — работа куратора. Оба подписывают NDA.</p>'));
    assert.ok(start.includes(' Каждый этап проверяет куратор.</p>'));
  });

  it('первые экраны: второй портрет — менеджер, а не научный редактор; на «Компаниям» куратор один', () => {
    assert.ok(design('StartPage').includes('>Менеджер проекта — сроки, документы, оплаты</span>'));
    assert.ok(design('MainPage').includes('>Менеджер проекта — сроки, документы, оплаты</span>'));
    assert.ok(design('StudentsPage').includes('>Менеджер<br><span style="color:var(--pd-ink-muted)">сроки, документы, оплаты</span></span>'));
    const business = design('BusinessPage');
    assert.ok(business.includes('>Куратор — отраслевой эксперт со степенью</span>'));
    assert.ok(business.includes('>Менеджер проекта</span>'));
    assert.doesNotMatch(business, />Куратор проекта</u);
    // Одно лицо — одна роль на всех страницах: портрет менеджера — тот же снимок.
    const photos = read('app/src/components/photos.ts');
    for (const slot of ['sp-avatar-2c', 'mp-photo-2', 'sp-stud-2', 'bp-photo-2']) {
      assert.match(photos, new RegExp(`'${slot}': \\{ photo: EDITOR \\}`, 'u'), slot);
    }
  });

  it('клиентский словарь: «комментарии куратора», а не «эксперта» (Р-322)', () => {
    assert.ok(design('StartPage').includes('комментарии куратора собраны в кабинете проекта'));
    assert.ok(design('MainPage').includes('с комментариями куратора'));
    // «Замечания куратора по вашей научной области…» сняты вместе с четырьмя
    // свойствами «Диагностики» (Р-809, указание владельца З-1); слово
    // клиентского словаря осталось в первом результате «Итога разбора».
    assert.ok(design('MainPage').includes("'Замечания куратора', 'Раздел, проблема, способ исправления'"));
    for (const page of ['StartPage', 'MainPage'] as const) {
      assert.doesNotMatch(design(page), /комментари[ия]ми? эксперта|[Зз]амечания эксперта/u, page);
    }
  });
});

describe('тексты — без запрещённых оборотов (С-1, text-guard)', () => {
  it('шаги, ответы и карточки ролей проходят text-guard', () => {
    const all = Object.values(PAGES).flatMap(({ list }) => list().map((row) => `${row.title}. ${row.text}`)).join('\n');
    assert.deepEqual(findForbidden(all, 'шаги работы'), []);
    assert.doesNotMatch(all, /гарант|под ключ|напишем|за вас/iu);
  });
});

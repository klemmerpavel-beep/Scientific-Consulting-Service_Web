/**
 * Сайт (требование Т-24, решение Р-318): ссылка «Личный кабинет» в шапке
 * всех восьми страниц; после отправки каждой из восьми форм заявки —
 * строка исхода и под ней, вне `role=status`, блок «Что будет дальше» из
 * трёх шагов, согласованных с письмом «Заявка получена»; формы отзыва не
 * меняются.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const DESIGN = path.join(import.meta.dirname, '..', '..', 'design');
const read = (page: string) => readFileSync(path.join(DESIGN, `${page}.dc.html`), 'utf8');

const PAGES = ['StartPage', 'MainPage', 'StudentsPage', 'BusinessPage', 'OfferPage', 'PrivacyPage', 'ConsentPage', 'NotFoundPage'];
const FORMS: Record<string, readonly string[]> = {
  StartPage: ['top', 'bottom'],
  MainPage: ['top', 'request'],
  StudentsPage: ['top', 'main'],
  BusinessPage: ['top', 'main'],
};
const STEPS = [
  'Менеджер разберёт заявку и ответит в течение рабочего дня',
  'Свяжемся удобным вам способом, чтобы уточнить задачу',
  'После согласования откроем вам личный кабинет — ссылка придёт на почту',
];

describe('ссылка «Личный кабинет» в шапке', () => {
  for (const page of PAGES) {
    it(page, () => {
      const html = read(page);
      const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
      // На правовых страницах и 404 — тем же элементом, что на главной (О-9).
      const link = [...header.matchAll(/<a href="\.\/cabinet\.html"[^>]*>([\s\S]*?)<\/a>/gu)].map((m) =>
        m[1]!.replace(/<[^>]+>/gu, '').trim(),
      );
      assert.ok(link.includes('Личный кабинет'), 'в шапке нет ссылки «Личный кабинет»');
      if (['OfferPage', 'PrivacyPage', 'ConsentPage', 'NotFoundPage'].includes(page)) {
        assert.match(header, /class="pd-cabinet"/u);
      }
    });
  }
});

describe('«Что будет дальше» после отправки заявки', () => {
  for (const [page, keys] of Object.entries(FORMS)) {
    for (const key of keys) {
      it(`${page} · ${key}`, () => {
        const html = read(page);
        const status = html.indexOf(`data-sent="${key}"`);
        assert.ok(status > 0, 'строки исхода нет');
        const statusEnd = html.indexOf('</div>', status);
        const next = html.indexOf(`data-next="${key}"`);
        assert.ok(next > statusEnd, 'блок шагов внутри role=status или перед ним');
        const block = html.slice(next, html.indexOf('</ol>', next));
        for (const step of STEPS) assert.ok(block.includes(`<li>${step}</li>`), `нет шага «${step}»`);
        const wrapperEnd = html.indexOf('</sc-if>', status);
        assert.ok(next < wrapperEnd, 'блок шагов виден и до отправки');
      });
    }
  }

  it('формы отзыва не меняются', () => {
    for (const page of Object.keys(FORMS)) assert.doesNotMatch(read(page), /data-next="review"/u);
  });
});

describe('сайт не обещает того, чего кабинет не делает (Т-25, Р-319)', () => {
  it('«Состав команды и зоны ответственности», а не «имена»', () => {
    const start = read('StartPage');
    assert.match(start, /Состав команды и зоны ответственности вы получаете до старта работы\./u);
    assert.doesNotMatch(start, /Имена и зоны ответственности/u);
  });

  it('профиль обещан куратору, а не эксперту: имя эксперта клиенту не раскрывается', () => {
    for (const page of PAGES) assert.doesNotMatch(read(page), /профиль эксперта/iu, page);
  });
});

describe('обещание о профиле куратора — одной формулировкой (П-1, Р-762)', () => {
  // Профиль обезличен (Р-297, Р-322): степень, специальность, стаж и
  // публикации числом по категориям журналов, без названий — названия
  // раскрывают имя. Клиент видит его с назначения куратора, до
  // согласования Задания; договор по оферте заключается акцептом при
  // отправке заявки (раздел 4), поэтому «до договора» сайт не обещает.
  const FULL = 'рофиль куратора — степень, специальность, стаж и публикации по категориям журналов — вы видите до согласования Задания.';
  const SHORT = "'Профиль куратора вы видите до согласования Задания'";
  const SITE = [...PAGES, 'ExpertsPage'];
  // Строка массива данных макета от её начала до закрывающей скобки.
  const row = (html: string, head: string) => {
    const at = html.indexOf(head);
    assert.ok(at > 0, `нет строки ${head}`);
    return html.slice(at, html.indexOf(']', at));
  };

  it('главная, карточка «Куратор со степенью по вашей специальности»', () => {
    assert.ok(read('StartPage').includes(`>П${FULL}</p>`));
  });

  it('«Аспирантам»: ответ на «Кто будет вести мою работу?» и карточка — короткая формулировка', () => {
    const main = read('MainPage');
    assert.equal(
      row(main, "['Кто будет вести мою работу?'"),
      `['Кто будет вести мою работу?', 'Куратор с учёной степенью в вашей области. П${FULL}'`,
    );
    assert.ok(row(main, "['pd-degree', 'Куратор со степенью по вашей специальности'").endsWith(`, ${SHORT}`));
  });

  it('«Компаниям», пункт 04 «Чем закреплено»', () => {
    const business = read('BusinessPage');
    assert.ok(row(business, "['04', 'Работу ведёт отраслевой эксперт со степенью'").endsWith(`, 'п${FULL}'`));
  });

  it('прежних обещаний нет: «список его публикаций», «его публикации», профиль «до договора»', () => {
    for (const page of SITE) {
      const html = read(page);
      assert.doesNotMatch(html, /список его публикаций/iu, page);
      assert.doesNotMatch(html, /его публикации/iu, page);
      // О профиле — ни в одной фразе; остальные «до договора» сняты Р-767
      // (П-10), их держит блок ниже.
      assert.doesNotMatch(html, /профил[^.'"<>]*до (?:подписания )?договора/iu, page);
      assert.doesNotMatch(html, /до (?:подписания )?договора[^.'"<>]*профил/iu, page);
    }
  });
});

describe('«до согласования Задания» вместо «до договора», шаги «Аспирантам» (П-10, П-11, Р-767)', () => {
  // Договор по оферте заключается акцептом при отправке заявки (раздел 4);
  // объём, сроки, этапы и стоимость фиксируются в Задании. Правовые
  // страницы не проверяются и не меняются (CONTRIBUTING, п. 3).
  const CONTENT = ['StartPage', 'MainPage', 'StudentsPage', 'BusinessPage', 'ExpertsPage', 'NotFoundPage'];
  const PLACES: ReadonlyArray<readonly [string, string, string]> = [
    ['StartPage', 'подпись «Что входит в сопровождение»', '>Условия фиксируются до согласования Задания<'],
    ['StartPage', '«Оставьте заявку»: консультация не оплачивается', '>Консультация не оплачивается: назовём объём работ, сроки и порядок сметы до согласования Задания. '],
    ['MainPage', 'подпись блока «Стоимость»', '>Сумму называем на консультации, до согласования Задания и до оплаты<'],
    ['MainPage', 'пункт у формы «Заявка»', "['calendar-days', 'Назовём сроки и этапы до согласования Задания']"],
    ['BusinessPage', '«Условия, закреплённые договором и приёмкой», пункт 01', "['01', 'Получатель документа фиксируется до старта', 'До согласования Задания определяем, кто принимает результат: "],
    ['StudentsPage', 'карточка «Консультация 20 минут»', '>Читаем работу, называем объём правок и срок. После этого считаем смету — до согласования Задания и до оплаты.<'],
  ];

  it('на шести страницах сайта нет «до договора» и «до подписания договора»', () => {
    for (const page of CONTENT) assert.doesNotMatch(read(page), /[Дд]о (?:подписания )?договора/u, page);
  });

  for (const [page, place, text] of PLACES) {
    it(`${page}: ${place}`, () => {
      assert.equal(read(page).split(text).length - 1, 1, 'фраза не на месте или повторена');
    });
  }

  it('«Экспертам»: договор куратора — «до заключения договора», о Задании клиента речи нет', () => {
    // Решение по умолчанию Р-767: шесть фраз «Экспертам» говорят о
    // гражданско-правовом договоре с куратором, а не об оферте клиента.
    const experts = read('ExpertsPage');
    assert.equal(experts.split('до заключения договора').length - 1, 6);
    assert.doesNotMatch(experts, /Задани[яе]/u);
  });

  it('шаги «Аспирантам»: «Ответ менеджера» в 01, «Подбор куратора» и «Профиль куратора» — в 02', () => {
    const main = read('MainPage');
    const at = main.indexOf('const stepTags = [');
    assert.ok(at > 0, 'нет stepTags');
    const rows = main.slice(at, main.indexOf('];', at)).split('\n').slice(1, 3).map((line) => line.trim());
    assert.deepEqual(rows, [
      "['Разбор задачи', 'Оценка объёма', 'Ответ менеджера'],",
      "['Постановка задачи', 'Подбор куратора', 'Профиль куратора', 'Предварительный план'],",
    ]);
    assert.doesNotMatch(main, /Подбор эксперта/u);
  });
});

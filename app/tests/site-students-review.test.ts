/**
 * Сайт (решение Р-771, С-6, продолжение Р-549): «Студентам» описывает
 * сопровождение и проверку, а не выполнение работы за студента (С-1,
 * п. 10 ст. 7 закона «О рекламе»). Колонка «Мы» маршрута, состав этапов,
 * карточки и перечень услуг, ответы и нормоконтроль — глаголами разбора и
 * проверки; курсовая — только «Разбор и нормоконтроль курсовой». Якоря
 * объявлений: `#works` — первый экран, `#services` — раздел «Состав работ»
 * (пункт меню, карточка «23 позиции», быстрая ссылка Директа), `#norm`
 * раскрывает нормоконтроль при загрузке и при смене якоря. Отзывы не
 * проверяются и не меняются (П-16).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { findForbidden } from '../src/lib/cabinet/text-guard.ts';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8');
const nbsp = (s: string) => s.replace(/[ ⁠]/gu, ' ');
/** Видимый текст фрагмента разметки: без тегов, неразрывный пробел — обычный. */
const text = (html: string) => nbsp(html.replace(/<[^>]+>/gu, '')).replace(/&nbsp;/gu, ' ').replace(/\s+/gu, ' ').trim();

const HTML = read('design/StudentsPage.dc.html');
const TSX = read('app/src/components/pages/StudentsPage.tsx');
/** Макет без отзывов: их тексты — дословные отзывы с Авито (П-16, Р-605). */
const PAGE = (() => {
  const at = HTML.indexOf('const REVIEWS');
  assert.ok(at > 0, 'нет данных отзывов');
  return nbsp(HTML.slice(0, at) + HTML.slice(HTML.indexOf('];', at)));
})();

/** Этапы маршрута: [ситуация, этап, «Вы», «Мы», состав работ, результат]. */
const STAGES = (() => {
  const data = PAGE.slice(PAGE.indexOf('const situationData = ['), PAGE.indexOf('const sIdx'));
  const rows = [...data.matchAll(/\['([^']+)', '([^']+)', (\d+), (?:true|false),\s*'([^']+)',\s*'([^']+)', \[([\s\S]*?)\],\s*'([^']+)'\]/gu)];
  return rows.map((m) => ({
    title: m[1]!,
    author: m[4]!,
    team: m[5]!,
    works: [...m[6]!.matchAll(/'([^']+)'/gu)].map((w) => w[1]!),
    result: m[7]!,
  }));
})();

describe('«Студентам»: колонка «Мы» и состав этапов — разбор и проверка (С-6)', () => {
  it('в четырёх ситуациях — 18 этапов', () => {
    assert.equal(STAGES.length, 18);
  });

  it('колонка «Мы» каждого этапа начинается глаголом разбора или проверки', () => {
    for (const stage of STAGES) {
      assert.match(stage.team, /^(?:Разбираем|Проверяем|Сверяем|Определяем)(?!\p{L})/u, `${stage.title}: «${stage.team}»`);
    }
  });

  it('формулировки находки проверки — на месте', () => {
    const teams = STAGES.map((s) => s.team);
    const works = STAGES.flatMap((s) => s.works);
    assert.ok(teams.includes('Разбираем ваш доклад и презентацию, репетируем вопросы комиссии'));
    assert.ok(teams.includes('Разбираем замечания руководителя по пунктам и проверяем ваши правки'));
    assert.ok(works.includes('Замечания к выводам по главам и сверка их с введением'));
    assert.ok(works.includes('Перечень устаревших и не относящихся к теме источников'));
    assert.ok(works.includes('Замечания к спорным формулировкам и выводам'));
  });

  it('нет оборотов, по которым сервис готовит, правит или заменяет за студента', () => {
    const banned = [
      /(?<!\p{L})(?:мы\s+)?(?:готовим|подготовим)(?!\p{L})/iu,
      /правк[аи]\s+(?:выводов|спорных)/iu,
      /замена\s+источников/iu,
      /ведём\s+правки/iu,
      /отрабатываем/iu,
      /ставим\s+доклад/iu,
      /выправляем|доводим\s+оформление|приводим|пересобираем|сводим/iu,
      /редактируем(?:\s+ваш)?/iu,
      /с\s+формулировк(?:ой|ами)\s+(?:для\s+)?правки/iu,
      /Кто\s+ведёт\s+вашу\s+работу/u,
    ];
    for (const pattern of banned) assert.doesNotMatch(PAGE, pattern);
    assert.deepEqual(findForbidden(PAGE, 'StudentsPage.dc.html'), []);
  });

  it('метка над портретами первого экрана — «Кто сопровождает работу»', () => {
    const art = PAGE.slice(PAGE.indexOf('class="sp-art"'));
    assert.match(text(art.slice(0, art.indexOf('</span>') + 7)), /Кто сопровождает работу$/u);
  });

  it('ответы о помощи с дипломом и о возврате работы — разбор и проверка', () => {
    assert.match(PAGE, /'Разбираем структуру и логику глав, проверяем ваш текст и оформление по ГОСТ 7\.32/u);
    assert.match(PAGE, /Замечания по сданному этапу разбираем без доплаты/u);
  });
});

describe('«Студентам»: карточки и перечень услуг', () => {
  const list = (() => {
    const at = PAGE.indexOf('const all = [');
    return [...PAGE.slice(at, PAGE.indexOf('];', at)).matchAll(/'([^']+)'/gu)].map((m) => m[1]!);
  })();
  const cards = (() => {
    const at = PAGE.indexOf('const svc = [');
    return [...PAGE.slice(at, PAGE.indexOf('].map', at)).matchAll(/\['([^']+)', '([^']+)'/gu)].map((m) => ({ title: m[1]!, text: m[2]! }));
  })();

  it('шесть карточек и 17 строк перечня — «23 позиции» на первом экране', () => {
    assert.equal(cards.length, 6);
    assert.equal(list.length, 17);
    assert.match(text(PAGE), /23 позиции в перечне работ/u);
  });

  it('услуги к защите и документы к ней названы проверкой', () => {
    for (const title of ['Разбор доклада и презентации к защите', 'Проверка раздаточного материала', 'Проверка аннотации и ключевых слов', 'Проверка списка литературы по ГОСТ']) {
      assert.ok(list.includes(title), `нет «${title}»`);
    }
    assert.ok(cards.some((c) => c.title === 'Разбор перед предзащитой'));
    for (const old of ['Доклад и презентация к защите', 'Раздаточный материал к защите', 'Аннотация и ключевые слова', 'Подготовка к предзащите']) {
      assert.ok(!list.includes(old) && !cards.some((c) => c.title === old), `осталось «${old}»`);
    }
  });

  it('курсовая — только «Разбор и нормоконтроль курсовой» (по умолчанию)', () => {
    const coursework = [...list, ...cards.map((c) => c.title)].filter((t) => /курсов/iu.test(t));
    assert.deepEqual(coursework, ['Разбор и нормоконтроль курсовой']);
    const markup = text(PAGE.slice(0, PAGE.indexOf('<script type="text/x-dc"')));
    assert.equal((markup.match(/курсов/giu) ?? []).length, 0, 'курсовая видна вне перечня');
  });

  it('карточки услуг не «приводят» текст за автора', () => {
    for (const card of cards) assert.doesNotMatch(card.text, /^(?:Приводим|Готовим|Пишем|Оформляем)/u, card.title);
  });
});

describe('«Студентам»: якоря объявлений', () => {
  it('#works — у первого экрана (с h1), #services — у раздела «Состав работ»', () => {
    const works = PAGE.indexOf('<section id="works"');
    assert.ok(works > 0 && PAGE.indexOf('<h1', works) < PAGE.indexOf('</section>', works), '#works не первый экран');
    const at = PAGE.indexOf('<section id="services"');
    assert.ok(at > 0, 'у раздела «Состав работ» нет id="services"');
    assert.match(text(PAGE.slice(at, PAGE.indexOf('</h2>', at))), /^Состав работ /u);
  });

  it('пункт меню «Состав работ» и карточка «23 позиции» ведут на #services', () => {
    const nav = PAGE.slice(PAGE.indexOf('<nav id="sp-nav"'), PAGE.indexOf('</nav>', PAGE.indexOf('<nav id="sp-nav"')));
    assert.match(nav, /<a href="#services"[^>]*>Состав работ<\/a>/u);
    const card = PAGE.slice(PAGE.indexOf('<a class="pd-lift" href="#services"'));
    assert.ok(PAGE.includes('<a class="pd-lift" href="#services"'), 'карточка не ведёт на #services');
    assert.match(text(card.slice(0, card.indexOf('</a>'))), /^23 позиции/u);
    assert.doesNotMatch(PAGE, /href="#works"/u, 'ссылка на первый экран вместо состава работ');
  });

  it('#norm раскрывает нормоконтроль при загрузке и по hashchange — в макете и в перенесённом компоненте', () => {
    for (const [name, source] of [['макет', HTML], ['StudentsPage.tsx', TSX]] as const) {
      const mount = source.slice(source.indexOf('componentDidMount(){'), source.indexOf('componentWillUnmount(){'));
      assert.match(mount, /window\.location\.hash === '#norm'\) this\.setState\(\{ normOpen: true \}\)/u, name);
      assert.match(mount, /this\.openNorm\(\);/u, `${name}: при загрузке не проверяется`);
      assert.match(mount, /window\.addEventListener\('hashchange', this\.openNorm\)/u, name);
      const unmount = source.slice(source.indexOf('componentWillUnmount(){'));
      assert.match(unmount, /window\.removeEventListener\('hashchange', this\.openNorm\)/u, `${name}: слушатель не снимается`);
    }
    assert.match(PAGE, /<div id="norm"/u);
  });
});

describe('Директ «Студентам»: быстрая ссылка на #services (Р-570)', () => {
  const source = JSON.parse(read('marketing/campaigns/direct.json')) as {
    campaigns: { page: string; sitelinks: { title: string; anchor: string }[]; groups: { name: string; anchor: string }[] }[];
  };
  const stu = source.campaigns.find((c) => c.page === '/students');

  it('«Состав работ» — на /students#services, первые четыре не тронуты', () => {
    assert.ok(stu, 'нет кампании «Студентам»');
    assert.ok(stu.sitelinks.some((s) => s.title === 'Состав работ' && s.anchor === 'services'));
    assert.deepEqual(stu.sitelinks.slice(0, 4).map((s) => s.anchor), ['norm', 'route', 'cost', 'faq']);
    assert.equal(stu.groups.find((g) => g.name === 'STU_NORM')?.anchor, 'norm');
  });

  it('описание кампании совпадает с источником', () => {
    assert.match(read('marketing/campaigns/direct-студенты.md'), /\| Состав работ \| `\/students#services` \|/u);
  });
});

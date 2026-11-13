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
import { existsSync, readFileSync } from 'node:fs';
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

describe('«Студентам»: первый экран как до Р-841, плашки условий под ним (Р-852)', () => {
  const hero = PAGE.slice(PAGE.indexOf('<section id="works"'), PAGE.indexOf('</section>', PAGE.indexOf('<section id="works"')));

  it('форма заявки, портреты куратора и менеджера, три плашки с цифрами; «7 причин» — к разделу нормоконтроля', () => {
    assert.match(hero, /<form onSubmit="\{\{ submitTop \}\}"/u);
    assert.match(hero, /<image-slot id="sp-stud-1"/u);
    assert.match(hero, /<image-slot id="sp-stud-2"/u);
    const plates = [...hero.matchAll(/<a class="pd-lift" href="(#[a-z]+)"[\s\S]*?white-space:nowrap[^>]*>([^<]+)<\/span>/gu)].map((m) => [m[1], m[2]]);
    assert.deepEqual(plates, [['#services', '23 позиции'], ['#norm', '7 причин'], ['#route', '4 ситуации']]);
    assert.doesNotMatch(hero, /data-pd-dialog|st-cabinet|sp-node/u, 'элементы первого экрана Р-841');
  });

  it('под сеткой первого экрана — плашки «Консультация», «Оплата», «Авторство» к ответам в «Вопросах»', () => {
    const at = hero.indexOf('<div class="sp-terms"');
    assert.ok(at > hero.indexOf('class="sp-art"'), 'плашки условий — после сетки первого экрана');
    const terms = [...hero.slice(at).matchAll(/<a class="sp-term" href="(#sp-faq-\d)"/gu)].map((m) => m[1]);
    assert.deepEqual(terms, ['#sp-faq-1', '#sp-faq-7', '#sp-faq-0']);
    for (const word of ['Консультация', 'Оплата', 'Авторство']) assert.match(text(hero.slice(at)), new RegExp(word, 'u'));
  });
});

describe('«Студентам»: над заголовком первого экрана — плашка «Научный коллектив с 2016 года» (Р-855)', () => {
  const hero = PAGE.slice(PAGE.indexOf('<section id="works"'), PAGE.indexOf('</section>', PAGE.indexOf('<section id="works"')));

  it('плашка с тремя портретами ролей стоит прямо перед h1, метки «Студентам, магистрантам и специалистам» нет', () => {
    const at = hero.indexOf('<span class="sp-proof"');
    assert.ok(at > 0, 'нет плашки');
    const plate = hero.slice(at, hero.indexOf('<h1', at));
    assert.match(text(plate), /^Научный коллектив с 2016 года$/u);
    const faces = [...plate.matchAll(/<img src="\.\/assets\/avatars\/(ph-[a-z]+)\.webp" alt="" aria-hidden="true"/gu)].map((m) => m[1]);
    assert.deepEqual(faces, ['ph-curator', 'ph-expert', 'ph-editor']);
    assert.ok(hero.indexOf('<h1') > at && hero.indexOf('<h1') - at < plate.length + 1, 'между плашкой и заголовком другой элемент');
    assert.doesNotMatch(hero.replace(/<!--[\s\S]*?-->/gu, ''), /Студентам, магистрантам и специалистам/u);
  });
});

describe('«Студентам»: порядок разделов как на выкате № 155 (Р-853)', () => {
  it('первый экран, команда, состав работ, смета, этапы, кабинет, случаи, «География», вопросы, заявка, отзывы', () => {
    const ids = [...PAGE.matchAll(/<section id="([a-z]+)"/gu)].map((m) => m[1]);
    assert.deepEqual(ids, ['works', 'services', 'cost', 'route', 'inside', 'tasks', 'geo', 'faq', 'request', 'reviews']);
    const team = PAGE.indexOf('<section', PAGE.indexOf('</section>', PAGE.indexOf('<section id="works"')));
    assert.match(text(PAGE.slice(team, PAGE.indexOf('</h2>', team))), /Кто сопровождает работу$/u, 'за первым экраном не «Кто сопровождает»');
  });

  it('раздела «Что закреплено в договоре» (Р-844) и открытого раздела нормоконтроля (Р-843) нет', () => {
    for (const source of [HTML, TSX]) {
      assert.doesNotMatch(source, /id="deal"|sp-deal|Что закреплено в договоре/u);
      assert.doesNotMatch(source, /<section id="norm"|sp-normcard/u);
    }
  });

  it('«География» (Р-849): команды в двух городах, счётчик по книге заказов, схема с подписью, без слова «офис»', () => {
    const at = PAGE.indexOf('<section id="geo"');
    const section = PAGE.slice(at, PAGE.indexOf('</section>', at));
    const words = text(section.replace(/<\/(?:span|li|text)>/gu, ' $&'));
    assert.match(words, /Сопровождаем дипломы и ВКР по всей России/u);
    assert.match(words, /430\+ работ с 2016 года по книге заказов практики/u);
    assert.match(words, /Москва команда практики/u);
    assert.match(words, /Санкт-Петербург команда практики/u);
    assert.doesNotMatch(words, /офис/iu, 'адреса офисов на сайте не заявлены');
    assert.match(section, /<img class="sp-geo-map" src="\.\/assets\/art\/st-russia\.svg" alt="Схема: Россия[^"]+" width="640" height="353"/u);
    assert.doesNotMatch(section, /<animate|<set /u, 'движение — только классом с transform и opacity');
  });

  it('кнопка действия между этапами и формой (Р-851): «Оставить заявку» в «Географии», к форме без окна', () => {
    for (const id of ['geo']) {
      const at = PAGE.indexOf(`<section id="${id}"`);
      const section = PAGE.slice(at, PAGE.indexOf('</section>', at));
      const cta = section.match(/<a href="#request"( data-pd-dialog)? style="[^"]*background:var\(--pd-ink\)[^"]*"[^>]*>Оставить заявку</u);
      assert.ok(cta, `нет кнопки действия в #${id}`);
      assert.equal(cta[1], undefined, `#${id}: окно заявки открывает только кнопка первого экрана`);
    }
  });

  it('«География»: силуэт России — по ст. 65 Конституции РФ, отметки городов — в своих координатах', () => {
    const files = ['design/assets/art/st-russia.svg', 'app/public/assets/art/st-russia.svg'].map(read);
    assert.equal(files[0], files[1], 'st-russia.svg в папках ассетов различается');
    assert.match(files[0]!, /viewBox="0 0 640 353" width="640" height="353"/u);
    const dots = [...files[0]!.matchAll(/M([\d.]+) ([\d.]+)h0/gu)].map((m) => [Number(m[1]), Number(m[2])] as const);
    assert.ok(dots.length > 1500, `точек силуэта: ${dots.length}`);
    // Точки tools/russia-dots.mjs (Альберс 95°/25°/65°): у каждой — точка сетки ближе шага 8.
    const places: Record<string, [number, number]> = {
      'Симферополь': [11.4, 248], 'Севастополь': [6.8, 248.3], 'Донецк': [44.8, 239.5], 'Луганск': [54.4, 240.3],
      'Мелитополь': [28, 239.4], 'Геническ': [21.6, 242.1], 'Калининград': [24, 135.7], 'Итуруп': [613.3, 275.6],
    };
    for (const [name, [x, y]] of Object.entries(places)) {
      assert.ok(dots.some(([dx, dy]) => Math.hypot(dx - x, dy - y) <= 8), `${name} вне силуэта`);
    }
    const at = PAGE.indexOf('<section id="geo"');
    const section = PAGE.slice(at, PAGE.indexOf('</section>', at));
    assert.match(section, /<circle cx="87\.5" cy="183\.6" r="6\.5"/u, 'отметка Москвы');
    assert.match(section, /<circle cx="87\.8" cy="134\.4" r="5\.5"/u, 'отметка Санкт-Петербурга');
    assert.match(section, /left:calc\(13\.67% \+ 14px\);top:52\.01%[^"]*">Москва</u);
    assert.match(section, /left:calc\(13\.72% \+ 14px\);top:38\.07%[^"]*">Санкт-Петербург</u);
  });

});

describe('«Студентам»: фон без сборки ВКР, кольца справа — как на выкате № 155 (Р-854)', () => {
  it('слоя сборки, его кадров и привязки движения к прокрутке нет — в макете и в компоненте', () => {
    for (const source of [HTML, TSX]) {
      assert.doesNotMatch(source, /sp-build|animation-timeline|st-sheet-/u);
    }
    for (const dir of [['design', 'assets', 'art'], ['app', 'public', 'assets', 'art']]) {
      for (const n of [1, 2, 3]) assert.ok(!existsSync(path.join(ROOT, ...dir, `st-sheet-${n}.webp`)), `осталось ${dir.join('/')}/st-sheet-${n}.webp`);
    }
  });

  it('справа ниже первого экрана — три пары «пятно света + кольца», как на выкате № 155', () => {
    const rings = [...HTML.matchAll(/<svg class="pd-orb pd-orb-b" viewBox="0 0 640 580" width="896" height="812" fill="none" style="position:absolute;left:calc\(50% \+ 238px\);top:(\d+)px">/gu)].map((m) => Number(m[1]));
    assert.deepEqual(rings, [2050, 4150, 6250]);
    const glows = [...HTML.matchAll(/<div class="pd-glow" style="position:absolute;left:calc\(50% \+ 360px\);top:(\d+)px;/gu)].map((m) => Number(m[1]));
    assert.deepEqual(glows, [2120, 4220, 6320]);
  });
});

describe('«Студентам»: выравнивание оставленных блоков (Р-856)', () => {
  it('«Кто сопровождает работу»: карточки ролей попарно на одной высоте — 01 с 02, 03 с 04', () => {
    const orbit = PAGE.slice(PAGE.indexOf('<div class="sp-orbit"'), PAGE.indexOf('</section>', PAGE.indexOf('<div class="sp-orbit"')));
    const crews = [...orbit.matchAll(/<div class="sp-crew" style="position:absolute;left:([\d.]+)%;top:([\d.]+)%;[\s\S]*?<span class="sp-crewnum"[^>]*>(0[1-4])<\/span>/gu)]
      .map((m) => ({ num: m[3]!, left: Number(m[1]), top: Number(m[2]) }));
    assert.deepEqual(crews.map((c) => c.num), ['01', '02', '03', '04']);
    const [c1, c2, c3, c4] = crews;
    assert.equal(c1!.top, c2!.top, '01 и 02 на разной высоте');
    assert.equal(c3!.top, c4!.top, '03 и 04 на разной высоте');
    assert.ok(c1!.top < c3!.top, 'верхний ряд — 01 и 02');
    assert.ok(c1!.left < c2!.left && c3!.left < c4!.left, '01 и 03 — слева');
    // Портреты стоят над своими карточками: фигура — первый потомок карточки роли.
    assert.equal((orbit.match(/<div class="sp-crew" [^>]*>\n<img class="sp-crewfig"/gu) ?? []).length, 4);
  });

  it('«География»: карточка карты на высоту левой колонки, карта — по центру между верхом карточки и легендой', () => {
    const at = PAGE.indexOf('<section id="geo"');
    const section = PAGE.slice(at, PAGE.indexOf('</section>', at));
    assert.match(section, /<div class="sp-geo" style="gap:40px;align-items:stretch">/u);
    assert.match(section, /<div class="sp-geo-card" style="[^"]*display:flex;flex-direction:column">\n<div style="flex:1 1 auto;display:flex;flex-direction:column;justify-content:center;min-height:0">\n<div style="position:relative">\n<img class="sp-geo-map"/u);
  });

  it('«Как это выглядит внутри»: поля текста и снимка по 24 px сверху и снизу — заголовок со снимком и подпись с его низом на одних линиях', () => {
    assert.ok(PAGE.includes('.sp-in-text{padding:24px 28px;border-right:1px solid var(--pd-border)}'), 'поля текстовой панели');
    assert.ok(PAGE.includes('.sp-in-shot{padding:24px}'), 'поля панели снимка');
  });
});

describe('«Студентам»: «Как это выглядит внутри» — карточка из двух панелей (Р-845)', () => {
  it('текст и снимок в одной карточке, внизу текста — «Экран N из 4» и переход к следующей вкладке', () => {
    const at = PAGE.indexOf('<section id="inside"');
    const section = PAGE.slice(at, PAGE.indexOf('</section>', at));
    assert.match(section, /<div id="pd-in-panel" role="tabpanel" aria-labelledby="\{\{ inTabLabelledBy \}\}" class="sp-in-card"/u);
    assert.match(section, /<div class="sp-in-text"[\s\S]*\{\{ inStep \}\}[\s\S]*onClick="\{\{ inNext \}\}"[\s\S]*\{\{ inCaption \}\}[\s\S]*<div class="sp-in-shot"/u);
    assert.doesNotMatch(section, /<figure/u, 'у снимка снова своя рамка');
    assert.ok(PAGE.includes(".sp-in-card{display:grid;grid-template-columns:minmax(0,.78fr) minmax(0,1.22fr)}"));
  });

  it('четыре вкладки: карточка работы — на первом экране, вместо неё «Переписка с менеджером»', () => {
    const at = PAGE.indexOf('const IN_TABS = [');
    const data = PAGE.slice(at, PAGE.indexOf('];', at));
    const labels = [...data.matchAll(/\{ label: '([^']+)'/gu)].map((m) => m[1]);
    assert.deepEqual(labels, ['Согласование этапа', 'Материалы и версии', 'Переписка с менеджером', 'Оплаты и документы']);
    const imgs = [...data.matchAll(/img: '\.\/assets\/art\/(st-tab-[a-z]+)\.webp', alt: '([^']+)'/gu)];
    assert.equal(imgs.length, 4);
    for (const [, name, alt] of imgs) {
      for (const dir of [['design', 'assets', 'art'], ['app', 'public', 'assets', 'art']]) {
        assert.ok(existsSync(path.join(ROOT, ...dir, `${name}.webp`)), `нет ${dir.join('/')}/${name}.webp`);
      }
      assert.match(alt!, /Данные вымышленные\.$/u, name);
    }
  });
});

describe('«Студентам»: подписи кнопок действия (Р-847, Р-853)', () => {
  it('«Оставить заявку» везде, кроме «Этапов»: там — «Обсудить мой срок», как на выкате № 155', () => {
    const buttons = [...PAGE.matchAll(/<a (?:[^>]*\s)?href="#request"[^>]*background:var\(--pd-ink\)[^>]*>([^<]+)</gu)].map((m) => m[1]!.trim());
    assert.ok(buttons.length >= 3, `кнопок действия ${buttons.length}`);
    for (const label of buttons) assert.ok(label === 'Оставить заявку' || label === 'Обсудить мой срок', label);
    const at = PAGE.indexOf('<section id="route"');
    const route = PAGE.slice(at, PAGE.indexOf('</section>', at));
    assert.match(route, /<a href="#request"[^>]*>Обсудить мой срок</u);
    assert.equal(buttons.filter((b) => b === 'Обсудить мой срок').length, 1, '«Обсудить мой срок» — только в «Этапах»');
    // Блок ролей оставлен в виде Р-840 со снимка владельца: кнопка «Оставить заявку».
    assert.doesNotMatch(PAGE, />Обсудить работу</u);
  });
});

describe('«Студентам»: заголовки разделов (Р-848, Р-853)', () => {
  const h2 = [...PAGE.matchAll(/<h2 [^>]*>([\s\S]*?)<\/h2>/gu)].map((m) => text(m[1]!));

  it('заголовки разделов — до 52 знаков (шкала скилла, Р-607)', () => {
    for (const title of h2) assert.ok([...title].length <= 52, `«${title}» — ${[...title].length} знаков`);
  });

  it('заголовки «Этапов», «Вопросов» и «Отзывов» — как на выкате № 155; фразы ядра остаются в заголовках и тексте', () => {
    for (const title of ['Этапы под вашу стадию работы: от разбора до защиты', 'Вопросы о защите, кафедре и научном руководителе', 'Что говорят клиенты']) {
      assert.ok(h2.includes(title), `нет заголовка «${title}»`);
    }
    const joined = h2.join(' | ');
    for (const phrase of [/ВКР/u, /смета на диплом/u]) assert.match(joined, phrase);
    const all = text(PAGE.slice(0, PAGE.indexOf('<script type="text/x-dc"')));
    // Подводка «Сопровождение дипломной работы, ВКР и магистерской диссертации» ушла вместе с первым экраном Р-841 (Р-852).
    assert.match(all, /Консультация по дипломной работе/u);
    assert.doesNotMatch(all, /написани[ея] (?:диплом|ВКР|работ)|вычитк|редактировани[ея] (?:диплом|ВКР)/iu, 'формулировки под п. 10 ст. 7 ФЗ «О рекламе»');
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

  it('#norm раскрывает нормоконтроль при загрузке и по hashchange — в макете и в перенесённом компоненте (свёртка возвращена Р-853)', () => {
    for (const [name, source] of [['макет', HTML], ['StudentsPage.tsx', TSX]] as const) {
      const mount = source.slice(source.indexOf('componentDidMount(){'), source.indexOf('componentWillUnmount(){'));
      assert.match(mount, /window\.location\.hash === '#norm'\) this\.setState\(\{ normOpen: true \}\)/u, name);
      assert.match(mount, /this\.openNorm\(\);/u, `${name}: при загрузке не проверяется`);
      assert.match(mount, /window\.addEventListener\('hashchange', this\.openNorm\)/u, name);
      const unmount = source.slice(source.indexOf('componentWillUnmount(){'));
      assert.match(unmount, /window\.removeEventListener\('hashchange', this\.openNorm\)/u, `${name}: слушатель не снимается`);
    }
    const at = PAGE.indexOf('<section id="cost"');
    const cost = PAGE.slice(at, PAGE.indexOf('</section>', at));
    assert.match(cost, /<div id="norm" class="sp-normbox"[\s\S]*<button class="sp-normbtn" type="button" onClick="\{\{ toggleNorm \}\}" aria-expanded="\{\{ normOpenAttr \}\}" aria-controls="norm-panel"/u, 'свёртка «Нормоконтроль» — внутри «Сметы»');
    assert.match(text(cost), /Семь причин возврата с нормоконтроля/u);
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

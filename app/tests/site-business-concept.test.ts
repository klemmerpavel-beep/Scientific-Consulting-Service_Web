/**
 * «Компаниям» (решение Р-772, пункт С-7 задания, П-2, П-5, П-20): статьи и
 * диссертации сотрудников — сопровождение и экспертиза рукописи, а не работа
 * за клиента (С-1, п. 10 ст. 7 закона «О рекламе»); созвон знакомства до
 * 20 минут ведут менеджер и куратор, установочной сессии на сорок минут нет;
 * с организацией — договор по форме, согласованной юристом, проект договора
 * и NDA — после заявки; материалы — в кабинет после NDA; для заказчика две
 * роли. Галочка «Принимаю оферту» в форме не тронута — вопрос юристу (Р-96).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { findForbidden } from '../src/lib/cabinet/text-guard.ts';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8');
/** Неразрывный пробел — обычный, без «склейки слов» (U+2060): фразы сверяются без оглядки на вёрстку. */
const plain = (source: string) => source.replace(/ |&nbsp;/gu, ' ').replace(/⁠/gu, '');
const html = () => plain(read('design/BusinessPage.dc.html'));
const tsx = () => plain(read('app/src/components/pages/BusinessPage.tsx'));
const both = () => [['макет', html()], ['компонент', tsx()]] as const;
/** Без раздела «Кто работает над проектом»: там четыре роли возвращены владельцем 04.11.2026 (Р-795). */
const withoutTeam = (source: string) => {
  const k = source.search(/class(?:Name)?="bp-orbit"/u);
  if (k < 0) return source;
  return source.slice(0, source.lastIndexOf('<section', k)) + source.slice(source.indexOf('</section>', k));
};

/** Строки данных каталога: направление и его позиции. */
function catalog(source: string): Array<{ title: string; items: string[] }> {
  const at = source.indexOf('const catalogData = [');
  assert.ok(at > 0, 'нет данных каталога');
  const block = source.slice(at, source.indexOf('\n    ];', at));
  return [...block.matchAll(/\['([^']+)', \[([^\]]*)\]\]/gu)].map((m) => ({
    title: m[1]!,
    items: [...m[2]!.matchAll(/'([^']*)'/gu)].map((x) => x[1]!),
  }));
}

/** Ответ на вопрос из массива faq. */
function answer(source: string, question: string): string {
  const at = source.indexOf(`['${question}',`);
  assert.ok(at > 0, `нет вопроса «${question}»`);
  const from = source.indexOf("'", at + question.length + 4);
  return source.slice(from + 1, source.indexOf("']", from));
}

describe('«Компаниям»: статьи и диссертации сотрудников — сопровождение (С-7, С-1)', () => {
  it('нет «пишем статьи», «доводим до статьи» и статьи как результата работы сервиса', () => {
    for (const [where, source] of both()) {
      assert.doesNotMatch(source, /[Пп]ишем стать|[Дд]оводим результаты работ до статьи|Научная статья по результатам/u, where);
      assert.doesNotMatch(source, /'[^']*сопровождение диссертаций сотрудников'/u, `${where}: диссертации — позицией каталога`);
    }
    const page = html();
    assert.ok(page.includes("'Сопровождаем подготовку статьи и доклада по результатам работ: структура, требования журнала, экспертиза рукописи авторов.'"));
    assert.ok(page.includes("['Заключение по рукописи статьи', 'требования журнала']"));
  });

  it('каталог: «Сопровождение статьи сотрудников…» и «Экспертиза рукописи и доклада»; позиций по-прежнему 52', () => {
    for (const [where, source] of both()) {
      const groups = catalog(source);
      assert.equal(groups.length, 7, where);
      const pubs = groups.find((g) => g.title === 'Публикации и научная репутация компании');
      assert.ok(pubs, where);
      assert.deepEqual(pubs.items.slice(0, 2), ['Сопровождение статьи сотрудников до подачи в рецензируемый журнал', 'Экспертиза рукописи и доклада'], where);
      assert.equal(groups.reduce((n, g) => n + g.items.length, 0), 52, `${where}: число позиций не совпадает с заголовком`);
    }
    assert.ok(html().includes('>Полный каталог: семь направлений, 52 позиции</h2>'));
  });

  it('направление 07: сопровождение диссертаций сотрудников — ссылкой на «Аспирантам»', () => {
    const page = html();
    assert.ok(page.includes('<sc-if value="{{ g.postgrad }}" hint-placeholder-val="{{ false }}">'));
    assert.match(page, /<a href="\.\/main\.html#services" [^>]*>Сопровождение диссертаций сотрудников — на странице «Аспирантам»<span aria-hidden="true"/u);
    assert.ok(page.includes('postgrad: gi === 6,'), 'ссылка не у направления 07');
    assert.match(tsx(), /href="\/main#services"[^>]*>Сопровождение диссертаций сотрудников — на странице «Аспирантам»/u);
  });
});

describe('«Компаниям»: созвон знакомства до 20 минут, менеджер и куратор (С-7, П-2, П-5)', () => {
  it('нет установочной сессии на сорок минут', () => {
    for (const [where, source] of both()) {
      assert.doesNotMatch(source, /установочн|сорок минут|40 минут/iu, where);
    }
  });

  it('шаг 03 и ответ «С чего начинается работа?»: созвон ведут менеджер и куратор', () => {
    const page = html();
    // Текст шага переработан по замечанию владельца 13.11.2026 (Р-885): факты прежние.
    assert.ok(page.includes("'Куратор — отраслевой эксперт со степенью. Задачу обсуждаем после подписания NDA: на созвоне до 20 минут менеджер и куратор разбирают разработку, стадию и получателя документа.'"));
    assert.match(answer(page, 'С чего начинается работа?'), /На созвоне знакомства до 20 минут менеджер и куратор — отраслевой эксперт со степенью — разбирают разработку, её стадию и получателя документа/u);
  });
});

describe('«Компаниям»: договор с организацией и NDA (С-7, П-20)', () => {
  it('ответ «Как заключается договор» на месте и называет договор по форме юриста; общество не названо (Р-862)', () => {
    for (const [where, source] of both()) {
      const text = answer(source, 'Как заключается договор и что в нём фиксируется?');
      assert.doesNotMatch(text, /РУСДРОН/u, where);
      assert.ok(text.includes('Реквизиты исполнителя и общие условия — в публичной оферте.'), where);
      assert.ok(text.includes('С организацией заключаем договор по форме, согласованной юристом; проект договора и NDA присылаем после заявки.'), where);
      assert.ok(text.includes('В Задании к договору фиксируются состав работ'), where);
    }
  });

  it('шаги: проект договора — с ответом менеджера, кабинет — после NDA, Задание — к договору', () => {
    const page = html();
    // Шаги «Что будет после отправки» в редакции Р-885 (замечание владельца 13.11.2026): факты прежние.
    assert.ok(page.includes("'Отвечает в течение рабочего дня, Пн—Пт 10:00—19:00, присылает NDA и проект договора.'"));
    assert.ok(page.includes('Задачу обсуждаем после подписания NDA: на созвоне'));
    assert.ok(page.includes("'Менеджер открывает вход после подписания NDA. Туда вы загружаете материалы проекта, которые уже есть.'"));
    assert.ok(page.includes("'Задание к договору: состав работ, календарный план и стоимость каждого этапа. Его вы согласуете в кабинете.'"));
  });

  it('галочка «Принимаю оферту» в форме не тронута (Р-96, вопрос юристу)', () => {
    const page = html();
    assert.match(page, /<input id="bp-terms" name="terms" type="checkbox" required="\{\{ true \}\}"/u);
    assert.match(page, /<span>Принимаю <a href="\.\/offer\.html"/u);
  });
});

describe('«Компаниям»: «Что прислать для сметы» — куда и когда (С-7)', () => {
  it('под перечнем — кабинет после NDA, доступ открывает менеджер', () => {
    const page = html();
    const at = page.indexOf('>Что прислать для сметы</h3>');
    assert.ok(at > 0);
    const block = page.slice(at, page.indexOf('</section>', at));
    const list = block.indexOf('<sc-for list="{{ askFor }}"');
    const note = block.indexOf('>Материалы загружаете в личный кабинет после подписания NDA — доступ откроет менеджер.</p>');
    assert.ok(list > 0 && note > list, 'подпись не под перечнем');
    assert.ok(tsx().includes('Материалы загружаете в личный кабинет после подписания NDA — доступ откроет менеджер.'));
  });
});

describe('«Компаниям»: роли (С-7, С-5; «Кто работает над проектом» — Р-795)', () => {
  it('«Кто работает над проектом»: четыре роли и карточки, как при приёмке 02.11.2026', () => {
    const page = html();
    assert.ok(page.includes('>За проектом закреплены четверо: менеджер, куратор по отрасли, методолог и научный редактор. Каждый отвечает за свой участок.</p>'));
    assert.ok(page.includes('>Держит календарный план и ведёт приёмку этапов.</span>'));
    assert.ok(page.includes('>Отвечает за расчёты, эксперимент и обоснование.</span>'));
    // Описания ролей — в три строки, как на «Студентам» (Р-954).
    assert.ok(page.includes('>Сверяет отчёт с требованиями получателя.</span>'));
  });

  it('«Кто работает над проектом»: под метками направлений — кнопка «Оставить заявку» к форме, как на «Аспирантам» (Р-877, подпись — Р-959)', () => {
    // Р-959 (решение владельца 20.11.2026) сменило подпись Р-877 «Обсудить проект» на
    // «Оставить заявку»: одна подпись у всех кнопок к заявке. Место и вид кнопки — по Р-877.
    for (const [where, source] of both()) {
      const k = source.search(/class(?:Name)?="bp-orbit"/u);
      assert.ok(k > 0, `${where}: нет орбиты ролей`);
      const left = source.slice(source.lastIndexOf('<section', k), k);
      const chips = left.indexOf('Обоснование внедрения</span>');
      const link = left.search(/<a (?:className="[^"]*" )?href="#request"[^>]*>Оставить заявку</u);
      assert.ok(chips > 0, `${where}: нет меток направлений`);
      assert.ok(link > chips, `${where}: под метками направлений нет ссылки «Оставить заявку» на #request`);
    }
    // Разметка и оформление — те же, что у кнопки раздела «Кто сопровождает проект» на «Аспирантам».
    const style = (source: string) => {
      const k = source.search(/class="(?:pd|bp)-orbit"/u);
      const left = source.slice(source.lastIndexOf('<section', k), k);
      return left.match(/<a href="#request" (style="[^"]*" style-hover="[^"]*" style-active="[^"]*")>Оставить заявку</u)?.[1];
    };
    const main = style(plain(read('design/MainPage.dc.html')));
    assert.ok(main, 'на «Аспирантам» в «Кто сопровождает проект» нет кнопки «Оставить заявку»');
    assert.equal(style(html()), main);
  });

  it('вне «Кто работает над проектом» нет «четырёх» и «четверых» в значении ролей', () => {
    for (const [where, source] of both()) {
      assert.doesNotMatch(withoutTeam(source), /четыр[её]х? (?:рол|специал|человек)|[Чч]етвер[оы]|04 специалист/u, where);
    }
  });
});

describe('«Компаниям»: новые тексты проходят text-guard (Р-365)', () => {
  it('без запрещённых оборотов', () => {
    const page = html();
    const texts = [
      'Сопровождаем подготовку статьи и доклада по результатам работ: структура, требования журнала, экспертиза рукописи авторов.',
      'Сопровождаем статью и доклад сотрудников по результатам работ: структура, требования издания, экспертиза рукописи.',
      'Сопровождение диссертаций сотрудников — на странице «Аспирантам»',
      answer(page, 'С чего начинается работа?'),
      answer(page, 'Как заключается договор и что в нём фиксируется?'),
      'Материалы загружаете в личный кабинет после подписания NDA — доступ откроет менеджер.',
      'Держит календарный план и ведёт приёмку этапов.',
      'Выстраивает структуру исследования и программу испытаний.',
      'Сверяет отчёт с требованиями получателя.',
      'Отвечает за расчёты, эксперимент и обоснование.',
    ];
    for (const text of texts) assert.ok(page.includes(text), text);
    const all = texts.join('\n');
    assert.deepEqual(findForbidden(all, '«Компаниям»'), []);
    assert.doesNotMatch(all, /гарант|под ключ|напишем|пишем|за вас/iu);
  });
});

/**
 * Заголовки четырёх разделов «Компаниям» — до 52 знаков (Р-976, задача С-6.4,
 * указание владельца 22.11.2026; методика, §8). Подсветка h2 страницы — одна, на
 * «Пяти пакетах», фрагмент «до постановки на баланс» (Р-32). Заголовок #request
 * — он же заголовок окна заявки (`RequestDialog` берёт h2 раздела формы).
 * `<title>` и описания страницы не меняются.
 */
describe('«Компаниям»: четыре заголовка до 52 знаков (Р-976)', () => {
  const HEADS = {
    trl: 'Девять уровней готовности и документы на выходе',
    packs: 'Пять пакетов: от техзадания до постановки на баланс',
    rights: 'Права на результат и материалы после проекта',
    request: 'Опишите разработку — разберём её и посчитаем смету',
  } as const;
  /** Видимый текст h2 раздела с данным id. */
  const h2 = (source: string, id: string) => {
    const at = source.search(new RegExp(`<section (?:className="[^"]*" )?id="${id}"`, 'u'));
    assert.ok(at > 0, `нет раздела #${id}`);
    const head = source.slice(at).match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/u);
    assert.ok(head, `в #${id} нет h2`);
    // Части заголовка «Пяти пакетов» — блоками в две строки: между ними пробел.
    return head[1]!.replace(/<[^>]*>/gu, ' ').replace(/\{" "\}/gu, ' ').replace(/\s+/gu, ' ').trim();
  };

  it('макет и компонент: заголовки дословно, каждый не длиннее 52 знаков', () => {
    for (const [where, source] of both()) {
      for (const [id, text] of Object.entries(HEADS)) {
        assert.equal(h2(source, id), text, `${where}: #${id}`);
        assert.ok(text.length <= 52, `#${id}: ${text.length} знаков`);
      }
      assert.doesNotMatch(source, /На каком уровне разработка|постановки прав на баланс<\/span><\/span><\/h2>|Кому принадлежит результат|разберём задачу и посчитаем/u, `${where}: остался прежний заголовок`);
    }
  });

  it('подсветка: в h1 и ровно в одном h2 — «до постановки на баланс» в «Пяти пакетах» (Р-32)', () => {
    const page = html();
    const marked = [...page.matchAll(/<(h1|h2)\b[^>]*>([\s\S]*?)<\/\1>/gu)].filter((m) => m[2]!.includes('background:var(--pd-accent-mark)'));
    assert.deepEqual(marked.map((m) => m[1]), ['h1', 'h2']);
    assert.match(marked[1]![2]!, /<span style="position:relative">до постановки на баланс<\/span><\/span>$/u);
  });

  it('<title> и описания страницы — прежние', () => {
    const page = read('design/BusinessPage.dc.html');
    assert.ok(page.includes('<title>НИОКР, патенты и гранты для бизнеса — ProDisser</title>'));
    const desc = 'Техзадание и патентная чистота, НИОКР под сдачу, заявки на гранты, постановка прав на баланс. Шкала уровней готовности 1—9, пять пакетов, каталог из 52 позиций.';
    assert.ok(page.includes(`<meta name="description" content="${desc}">`));
    assert.ok(page.includes(`<meta property="og:description" content="${desc}">`));
  });

  it('окно заявки берёт заголовок из h2 раздела формы', () => {
    const dialog = read('app/src/components/RequestDialog.tsx');
    assert.ok(dialog.includes("const heading = section?.querySelector('h2')?.textContent?.trim() || 'Оставить заявку';"));
  });
});

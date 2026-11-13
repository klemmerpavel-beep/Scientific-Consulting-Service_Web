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
    assert.ok(page.includes("'Куратор — отраслевой эксперт со степенью. На созвоне знакомства до 20 минут менеджер и куратор разбирают разработку, стадию и получателя документа.'"));
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
    assert.ok(page.includes('присылает NDA и проект договора; задачу обсуждаем после подписания NDA.'));
    assert.ok(page.includes("'Менеджер открывает доступ после подписания NDA, вы прикладываете материалы по перечню «Что подготовить».'"));
    assert.ok(page.includes("'Состав работ, календарный план и стоимость по этапам — в Задании к договору; Задание вы согласуете в кабинете.'"));
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
    assert.ok(page.includes('>За проектом закреплены четверо: менеджер, отраслевой эксперт, методолог и научный редактор. Каждый отвечает за свой участок.</p>'));
    assert.ok(page.includes('>Держит календарный план и ведёт приёмку этапов.</span>'));
    assert.ok(page.includes('>Ведёт содержательную часть: расчёты, эксперимент, обоснование.</span>'));
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
      'Проверяет логику, оформление и соответствие требованиям получателя.',
      'Ведёт содержательную часть: расчёты, эксперимент, обоснование.',
    ];
    for (const text of texts) assert.ok(page.includes(text), text);
    const all = texts.join('\n');
    assert.deepEqual(findForbidden(all, '«Компаниям»'), []);
    assert.doesNotMatch(all, /гарант|под ключ|напишем|пишем|за вас/iu);
  });
});

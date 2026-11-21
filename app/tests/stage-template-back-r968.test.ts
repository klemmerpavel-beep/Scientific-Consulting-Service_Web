/**
 * Шаблон этапов: исход и отказ — на вкладке «Шаблоны этапов» (решение
 * Р-968; найдено при Р-955).
 *
 * С разведения вкладок справочников (Р-177) сохранение и удаление строки
 * шаблона возвращали на адрес экрана без вкладки — на «Типы
 * сопровождения». Отказ стоял там, где формы шаблона нет, а успешное
 * сохранение уводило с шаблона, который только что дополняли. Теперь оба
 * действия возвращают на `?tab=stages`, а отказ, называющий поле, помечает
 * его (способ Р-936, Р-955).
 *
 * Действие и экран с JSX тестом не загружаются — проверка по исходникам,
 * как в `fault-field-r955.test.ts`; фразы служб сверяются с исходником.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { faultField, type FaultKind } from '../src/lib/cabinet/fault-field.ts';

const APP = path.join(import.meta.dirname, '..');
const read = (file: string) => readFileSync(path.join(APP, file), 'utf8');
const actions = read('src/app/cabinet/actions.ts');
const screen = read('src/app/cabinet/manage/directory/page.tsx');
const service = read('src/lib/cabinet/admin.ts');

const BACK = '/cabinet/manage/directory?tab=stages';

/** Тело действия — от объявления до следующего экспорта. */
function body(name: string): string {
  const start = actions.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `нет действия ${name}`);
  const end = actions.indexOf('\nexport ', start + 1);
  return actions.slice(start, end < 0 ? undefined : end);
}

/** Перечень полей, который действие передаёт `faultField`. */
function fieldsOf(name: string): Record<string, FaultKind> {
  const match = /faultField\([a-z]+, (\{[^}]*\})\)/u.exec(body(name));
  assert.ok(match !== null, `${name}: отказ поля не называет`);
  const pairs = [...match[1]!.matchAll(/(?:'([A-Za-z][\w-]*)'|\b([A-Za-z]\w*)): '([a-z]+)'/gu)];
  return Object.fromEntries(pairs.map((pair) => [pair[1] ?? pair[2]!, pair[3] as FaultKind]));
}

/** Вкладка «Шаблоны этапов» экрана справочников. */
function stagesTab(): string {
  const start = screen.indexOf("{tab === 'stages' ? (");
  assert.ok(start >= 0, 'нет вкладки шаблонов');
  return screen.slice(start, screen.indexOf('{tab === ', start + 1));
}

describe('шаблон этапов: возврат на свою вкладку (Р-968)', () => {
  for (const name of ['saveStageTemplate', 'dropStageTemplate']) {
    it(`${name}: исход и отказ ведут на вкладку «Шаблоны этапов»`, () => {
      const code = body(name);
      assert.ok(code.includes(`const back = '${BACK}';`), `${name}: адрес возврата`);
      assert.match(code, /redirect\(\s*await withError\(back, failure/u);
      assert.match(code, /\n  redirect\(back\);\n\}/u);
      // Ни одного возврата на вкладку типов: адрес без вкладки — это она.
      assert.doesNotMatch(code, /'\/cabinet\/manage\/directory'|`\/cabinet\/manage\/directory`/u);
    });
  }

  it('вкладка, на которую ведёт возврат, существует и выводит отказ', () => {
    assert.match(screen, /const TABS: readonly Tab\[\] = \[[^\]]*'stages'/u);
    const href = /const href = \(next: Tab\) =>\s*next === 'types' \? '\/cabinet\/manage\/directory' : `\/cabinet\/manage\/directory\?tab=\$\{next\}`;/u;
    assert.match(screen, href, 'адрес вкладки шаблонов — ?tab=stages');
    // Блок отказа вверху выводится на любой вкладке, кроме свёртки
    // «Добавить позицию» на вкладке типов.
    assert.match(screen, /const typeFailed = sp\.new === '1' && failure !== undefined && tab === 'types';/u);
    assert.match(screen, /\{failure === undefined \|\| typeFailed \? null : \(\s*<Outcome tone="error" id=\{FAULT_ID\} mark=\{sp\.error\}>\s*\{failure\}\s*\{fieldFault\}/u);
  });

  it('отказ службы называет своё поле; отказ о состоянии и общая фраза — нет', () => {
    const fields = fieldsOf('saveStageTemplate');
    const marked: readonly (readonly [string, string])[] = [
      ['Название этапа не указано', 'template-title'],
      ['Порядковый номер этапа — целое число, начиная с единицы', 'template-position'],
      ['Длительность — целое число дней от нуля', 'template-durationDays'],
    ];
    for (const [text, id] of marked) {
      assert.ok(service.includes(text), `admin.ts: нет фразы «${text}»`);
      assert.equal(faultField(text, fields), id, text);
    }
    for (const text of [
      'Не удалось сохранить этап шаблона',
      'Это уже изменили в другой вкладке или другой сотрудник: обновите страницу и повторите',
      'Запись не найдена или недоступна для вашей роли',
    ]) {
      assert.equal(faultField(text, fields), undefined, text);
    }
    // Тип сопровождения — выбор из перечня, который строит сам экран (Р-955).
    assert.ok(!('template-serviceTypeId' in fields));
  });

  it('каждое названное поле стоит на вкладке шаблонов ровно одним', () => {
    const tab = stagesTab();
    for (const id of Object.keys(fieldsOf('saveStageTemplate'))) {
      const name = id.replace(/^template-/u, '');
      const field = new RegExp(`<(?:Field|Select)\\b[^>]*?\\bname="${name}"[^>]*?\\bscope="template"`, 'gsu');
      assert.equal(tab.match(field)?.length ?? 0, 1, `поле ${id}`);
      // И больше нигде на экране: пометка не уйдёт на поле другой вкладки.
      assert.equal(screen.match(field)?.length ?? 0, 1, `поле ${id} на экране`);
    }
    assert.match(tab, /<Form action=\{saveStageTemplate\}>/u);
    assert.match(tab, /<Form action=\{dropStageTemplate\} inline>/u);
  });
});

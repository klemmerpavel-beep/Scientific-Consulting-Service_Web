/**
 * Отказ действия называет поле — вторая очередь (аудит 15.11.2026, находка
 * Д-2, остаток Р-936; решение Р-955): формы расходов, поручений,
 * справочников и настроек.
 *
 * Перечень полей берётся из самого действия: проверка гоняет настоящие
 * фразы служб через тот перечень, который действие передаёт `faultField`,
 * и сверяет каждый идентификатор с полем на экране, куда ведёт отказ.
 * Действия и экраны с JSX тестом не загружаются — проверка по исходникам,
 * как в `fault-field-r936.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { faultField, type FaultKind } from '../src/lib/cabinet/fault-field.ts';
import { parseAmount } from '../src/lib/cabinet/money.ts';
import { whoLeads } from '../src/lib/cabinet/staff-texts.ts';

const APP = path.join(import.meta.dirname, '..');
const read = (file: string) => readFileSync(path.join(APP, file), 'utf8');
const actions = read('src/app/cabinet/actions.ts');

/** Тело действия — от объявления до следующего экспорта. */
function body(name: string): string {
  const start = actions.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `нет действия ${name}`);
  const end = actions.indexOf('\nexport ', start + 1);
  return actions.slice(start, end < 0 ? undefined : end);
}

/** Перечень полей, который действие передаёт `faultField`, — по порядку. */
function fieldsOf(name: string): Record<string, FaultKind> {
  const match = /faultField\([a-z]+, (\{[^}]*\})\)/u.exec(body(name));
  assert.ok(match !== null, `${name}: отказ поля не называет`);
  const pairs = [...match[1]!.matchAll(/(?:'([A-Za-z][\w-]*)'|\b([A-Za-z]\w*)): '([a-z]+)'/gu)];
  return Object.fromEntries(pairs.map((pair) => [pair[1] ?? pair[2]!, pair[3] as FaultKind]));
}

/** Фраза отказа, как её произносит служба: пределы и код подставлены. */
const LIMITS: Readonly<Record<string, string>> = {
  EXPENSE_NOTE_MAX: '500',
  ASSIGNMENT_TEXT_MAX: '2000',
  REACTION_MAX: '10',
  LEAD_RESPONSE_MAX: '9',
  CONTACT_MAX: '500',
  code: 'translation',
};
const said = (source: string) => source.replace(/\$\{(\w+)\}/gu, (_, key: string) => LIMITS[key] ?? key);

/** Отказы разбора суммы — те, что произносит сама `parseAmount`. */
function amountRefusals(): string[] {
  return ['', '12abc', '9 000 000 000'].map((raw) => {
    try {
      parseAmount(raw);
    } catch (error) {
      return (error as Error).message;
    }
    assert.fail(`«${raw}» разобралась без отказа`);
  });
}

interface FormCase {
  readonly action: string;
  /** Куда ведёт отказ: адрес экрана в действии. */
  readonly back: string;
  readonly screen: string;
  /** Вкладка экрана, на которой стоит форма (справочники). */
  readonly tab?: string;
  /** Где служба произносит отказ. */
  readonly service: string;
  /** Поля формы: имя и область, как у `fieldId`. */
  readonly fields: readonly { readonly name: string; readonly scope?: string }[];
  /** Фраза в исходнике службы — поле, к которому она относится. */
  readonly marked: readonly (readonly [string, string])[];
  /** Фразы, которые поля не помечают: состояние, выбор из перечня, два поля разом. */
  readonly unmarked: readonly string[];
  /** Готовые фразы, произнесённые не этой службой (разбор суммы). */
  readonly spoken?: readonly (readonly [string, string])[];
}

const FORMS: readonly FormCase[] = [
  {
    action: 'addExpenseAction',
    back: "const back = '/cabinet/manage/finance/profit';",
    screen: 'src/app/cabinet/manage/finance/profit/page.tsx',
    service: 'src/lib/cabinet/profit.ts',
    fields: [{ name: 'month' }, { name: 'amount' }, { name: 'note' }],
    marked: [
      ['Укажите месяц расхода', 'month'],
      ['Расход будущего месяца не вносится', 'month'],
      ['Расход старше двенадцати месяцев здесь не вносится: он вошёл бы в «Итоги по годам» без строки в перечне', 'month'],
      ['Сумма расхода — больше нуля', 'amount'],
      ['Заметка — не длиннее ${EXPENSE_NOTE_MAX} знаков', 'note'],
    ],
    unmarked: ['Выберите статью расхода из справочника', 'Тип сопровождения не найден в справочнике'],
    spoken: amountRefusals().map((text) => [text, 'amount'] as const),
  },
  {
    action: 'createAssignmentAction',
    back: "const back = '/cabinet/manage/assignments';",
    screen: 'src/app/cabinet/manage/assignments/page.tsx',
    service: 'src/lib/cabinet/assignments.ts',
    fields: [{ name: 'dueOn' }, { name: 'text' }],
    marked: [
      ['Опишите поручение', 'text'],
      ['Поручение — не длиннее ${ASSIGNMENT_TEXT_MAX} знаков', 'text'],
      ['Укажите срок поручения', 'dueOn'],
      ['Срок поручения — не раньше сегодняшнего дня', 'dueOn'],
    ],
    unmarked: ['Поручить можно действующему менеджеру или куратору', 'Работа с таким кодом не найдена'],
    // «Сотрудник не ведёт эту работу» называет и сотрудника, и работу.
    spoken: [
      [whoLeads('Иванова Анна Сергеевна', null), ''],
      [whoLeads('Иванова Анна Сергеевна', 'Петров Олег Ильич'), ''],
    ],
  },
  {
    action: 'saveType',
    back: "withError('/cabinet/manage/directory?new=1', reason,",
    screen: 'src/app/cabinet/manage/directory/page.tsx',
    tab: 'types',
    service: 'src/lib/cabinet/admin.ts',
    fields: [{ name: 'code' }, { name: 'basePrice' }, { name: 'sortOrder' }],
    marked: [
      ['Код — латиница в нижнем регистре, цифры, дефис и подчёркивание, без пробелов', 'code'],
      ['Позиция с кодом «${code}» уже есть', 'code'],
      ['Базовая цена не бывает отрицательной', 'basePrice'],
      ['Порядок — целое число от нуля', 'sortOrder'],
    ],
    // Код и название — два поля: какое из них пусто, по фразе не понять.
    unmarked: ['Код и название обязательны'],
    spoken: amountRefusals().map((text) => [text, 'basePrice'] as const),
  },
  {
    action: 'attachAlias',
    back: 'withError(`/cabinet/manage/directory`, reason,',
    screen: 'src/app/cabinet/manage/directory/page.tsx',
    tab: 'types',
    service: 'src/lib/cabinet/admin.ts',
    fields: [{ name: 'alias' }],
    marked: [['Написание не указано', 'alias']],
    unmarked: [],
  },
  {
    action: 'saveReaction',
    back: "const back = '/cabinet/manage/directory?tab=calendar';",
    screen: 'src/app/cabinet/manage/directory/page.tsx',
    tab: 'calendar',
    service: 'src/lib/cabinet/practice-settings.ts',
    fields: [{ name: 'days' }, { name: 'hours' }],
    marked: [
      ['Срок реакции — целое число рабочих дней от 1 до ${REACTION_MAX}', 'days'],
      ['Первый ответ на заявку — целое число рабочих часов от 1 до ${LEAD_RESPONSE_MAX}', 'hours'],
    ],
    unmarked: [],
  },
  {
    action: 'saveAnalyticsSettings',
    back: "const back = '/cabinet/manage/directory?tab=calendar';",
    screen: 'src/app/cabinet/manage/directory/page.tsx',
    tab: 'calendar',
    service: 'src/lib/cabinet/practice-settings.ts',
    fields: [{ name: 'since' }, { name: 'thresholds' }],
    marked: [
      ['Дата начала учёта — день не раньше 2000 года и не позже сегодняшнего', 'since'],
      ['Пороги уверенности — три убывающих целых числа наблюдений, например «20, 10, 5»', 'thresholds'],
    ],
    unmarked: [],
  },
  {
    action: 'saveCalendar',
    back: "const back = '/cabinet/manage/directory?tab=calendar';",
    screen: 'src/app/cabinet/manage/directory/page.tsx',
    tab: 'calendar',
    service: 'src/lib/cabinet/admin.ts',
    fields: [
      { name: 'day', scope: 'calendar' },
      { name: 'note', scope: 'calendar' },
    ],
    marked: [
      ['Укажите день', 'calendar-day'],
      ['Примечание — не длиннее 200 знаков', 'calendar-note'],
    ],
    unmarked: [],
  },
  {
    action: 'addContactChannel',
    back: "withError('/cabinet/settings', back.reason,",
    screen: 'src/app/cabinet/settings/page.tsx',
    service: 'src/lib/cabinet/channels.ts',
    fields: [{ name: 'value' }],
    marked: [
      ['Укажите номер телефона: без него звонок не состоится', 'value'],
      ['Укажите ссылку или имя в мессенджере', 'value'],
    ],
    // Предел длины называет и способ, и заметку; сопровождение в выборе не предлагается.
    unmarked: [
      'Способ связи и заметка к нему — не длиннее ${CONTACT_MAX} знаков',
      'Полное сопровождение включается отдельной отметкой в «Настройках»',
    ],
  },
];

/** Отказы о состоянии и прочее, что не называет предмета ни одного поля. */
const STATE = [
  'Это уже изменили в другой вкладке или другой сотрудник: обновите страницу и повторите',
  'Запись не найдена или недоступна для вашей роли',
];

/** Раздел экрана справочников — от начала вкладки до следующей. */
function section(source: string, tab: string | undefined): string {
  if (tab === undefined) return source;
  const start = source.indexOf(`{tab === '${tab}' ? (`);
  assert.ok(start >= 0, `нет вкладки ${tab}`);
  const next = source.indexOf('{tab === ', start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

describe('отказ называет поле в формах второй очереди (Р-955)', () => {
  for (const form of FORMS) {
    it(`${form.action}: фраза службы относится к своему полю`, () => {
      const fields = fieldsOf(form.action);
      const service = read(form.service);
      for (const [source, id] of form.marked) {
        assert.ok(service.includes(source), `${form.service}: нет фразы «${source}»`);
        assert.equal(faultField(said(source), fields), id, source);
      }
      for (const source of form.unmarked) {
        assert.ok(service.includes(source), `${form.service}: нет фразы «${source}»`);
        assert.equal(faultField(said(source), fields), undefined, source);
      }
      for (const [text, id] of form.spoken ?? []) {
        assert.equal(faultField(text, fields), id === '' ? undefined : id, text);
      }
      for (const text of STATE) assert.equal(faultField(text, fields), undefined, text);
    });

    it(`${form.action}: каждое названное поле стоит на экране, куда ведёт отказ`, () => {
      const code = body(form.action);
      assert.ok(code.includes(form.back), `${form.action}: отказ ведёт не на ${form.screen}`);
      const named = Object.keys(fieldsOf(form.action)).sort();
      const expected = form.fields.map(({ name, scope }) => (scope === undefined ? name : `${scope}-${name}`)).sort();
      assert.deepEqual(named, expected, `${form.action}: перечень полей`);
      const screen = section(read(form.screen), form.tab);
      for (const { name, scope } of form.fields) {
        const field = new RegExp(
          scope === undefined
            ? `<(?:Field|Select)\\b[^>]*?\\bname="${name}"(?![^>]*?\\bscope=)`
            : `<(?:Field|Select)\\b[^>]*?\\bname="${name}"[^>]*?\\bscope="${scope}"`,
          'gsu',
        );
        // Ровно одно поле с этим идентификатором: пометка не уйдёт на соседнее.
        assert.equal(screen.match(field)?.length ?? 0, 1, `${form.screen}: поле ${scope ?? ''}${name}`);
      }
    });
  }

  it('экраны выводят пометку поля у блока отказа', () => {
    // Расходы и поручения — общим блоком отказа, настройки — в форме способа связи.
    assert.match(read('src/app/cabinet/manage/finance/profit/page.tsx'), /<ActionError id=\{flags\.error\} \/>/u);
    assert.match(read('src/app/cabinet/manage/assignments/page.tsx'), /<ActionError id=\{flags\.error\} \/>/u);
    const settings = read('src/app/cabinet/settings/page.tsx');
    const contact = settings.slice(settings.indexOf('<Form action={addContactChannel}>'));
    assert.match(contact, /^<Form action=\{addContactChannel\}>\s*<ActionError id=\{params\.error\} slot="contact" \/>/u);
    // Справочники выводят отказ сами: блок вверху и блок в свёртке «Добавить позицию».
    const directory = read('src/app/cabinet/manage/directory/page.tsx');
    assert.match(directory, /const fault = await flashEntry\(sp\.error\);/u);
    assert.match(directory, /<FieldFault field=\{fault\.field\} by=\{FAULT_ID\} mark=\{sp\.error\} \/>/u);
    assert.match(directory, /<Outcome tone="error" id=\{FAULT_ID\} mark=\{sp\.error\}>\s*\{failure\}\s*\{fieldFault\}\s*<\/Outcome>/u);
    assert.match(directory, /<div id=\{FAULT_ID\}>\s*<Notice tone="error" role="alert">\s*\{failure\}\s*<\/Notice>\s*\{fieldFault\}\s*<\/div>/u);
  });

  it('шаблон этапов поля не называет: отказ возвращает на вкладку типов, где формы нет', () => {
    const code = body('saveStageTemplate');
    assert.doesNotMatch(code, /faultField/u);
    assert.match(code, /withError\(`\/cabinet\/manage\/directory`, reason\)/u);
  });

  it('запрос удаления данных поля не называет: флажок без идентификатора, отметку требует браузер', () => {
    assert.doesNotMatch(body('requestMyErasure'), /faultField/u);
  });
});

/**
 * Заявка: вид работы, выбранный заявителем, виден и не подменяется первым
 * в списке (решение Р-718). Прежде выбор стоял только в свёртке
 * «Исправить сведения заявки» полем «Что нужно», а форма одобрения
 * открывалась на первом типе справочника — одобрение без проверки
 * заводило работу чужого вида с чужим шаблоном этапов. Подсказка под
 * плашками называла «Договор заключён» и «Отказ», которых на экране нет.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { chosenServiceType } from '../src/lib/cabinet/lead-labels.ts';

const PAGE = readFileSync(
  path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'manage', 'leads', '[id]', 'page.tsx'),
  'utf8',
);

const TYPES = [
  { id: 'diss', name: 'Сопровождение диссертационного исследования' },
  { id: 'pub', name: 'Научные публикации и патентные материалы' },
];

describe('тип сопровождения, выбранный заявителем (Р-718)', () => {
  it('выбор заявителя находится по названию — без учёта регистра и лишних пробелов', () => {
    assert.equal(chosenServiceType(TYPES, 'Научные публикации и патентные материалы')?.id, 'pub');
    assert.equal(chosenServiceType(TYPES, '  научные  публикации и патентные материалы ')?.id, 'pub');
  });

  it('без выбора, при чужом названии и при «что нужно» с сайта — типа нет, а не первый в списке', () => {
    assert.equal(chosenServiceType(TYPES, null), null);
    assert.equal(chosenServiceType(TYPES, ''), null);
    assert.equal(chosenServiceType(TYPES, '   '), null);
    assert.equal(chosenServiceType(TYPES, 'НИОКР под сдачу'), null);
  });

  it('форма одобрения стоит на выборе заявителя, а без него — на пустой строке, и поле обязательно', () => {
    const select = /<Select\s+label="Тип сопровождения"\s+name="serviceTypeId"([\s\S]*?)<\/Select>/u.exec(PAGE);
    assert.ok(select !== null, 'нет поля «Тип сопровождения» в форме одобрения');
    const body = select[1]!;
    assert.match(body, /\brequired\b/u, 'тип сопровождения не обязателен');
    assert.match(body, /defaultValue=\{chosenType\?\.id \?\? ''\}/u, 'значение по умолчанию — не выбор заявителя');
    assert.match(body, /<option value="">Выберите тип сопровождения<\/option>/u, 'нет пустой первой строки');
    assert.match(PAGE, /const chosenType = chosenServiceType\(types, lead\.need\)/u);
  });

  it('карточка заявки показывает выбранный тип среди сведений', () => {
    assert.match(
      PAGE,
      /term: chosenType !== null \|\| lead\.source === 'cabinet' \? 'Тип сопровождения' : 'Что нужно', value: lead\.need/u,
    );
  });

  it('подсказка под плашками называет кнопки экрана, а не отсутствующие плашки', () => {
    const hint = /Состояние меняется одним нажатием\.([\s\S]*?)<\/Text>/u.exec(PAGE);
    assert.ok(hint !== null, 'нет подсказки под плашками');
    const text = hint[1]!.replace(/\s+/gu, ' ');
    assert.match(text, /«Одобрить и создать работу»/u);
    assert.match(text, /«Отклонить заявку» в свёртке/u);
    assert.doesNotMatch(text, /«Договор заключён»|«Отказ»/u);
  });
});

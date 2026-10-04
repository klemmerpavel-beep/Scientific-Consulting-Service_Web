/**
 * Тексты писем куратору (требование Э-03, решение Р-323): кабинет открыт,
 * доступ к материалам открыт, назначение на работу. Без договора поручения
 * письмо о назначении не несёт ни названия, ни темы (ответ ОЭ-5).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assignmentLetter, invitationLetter, ndaSignedLetter } from '../src/lib/cabinet/curator-letters.ts';

const work = {
  code: 'PD-2026-061',
  title: 'Глава 2 диссертации',
  topic: 'Износ резцов проходческого комбайна',
  serviceType: 'Сопровождение диссертационного исследования',
  dueOn: new Date(Date.UTC(2026, 11, 15)),
  manager: 'Нечаева Ксения Ильинична',
};

describe('письмо «Вам открыт кабинет куратора ProDisser»', () => {
  it('что за кабинет, как войти, зачем договор поручения', () => {
    const letter = invitationLetter(false);
    assert.equal(letter.subject, 'Вам открыт кабинет куратора ProDisser');
    assert.match(letter.body, /назначенные вам работы/u);
    assert.match(letter.body, /Как войти: нажмите «Открыть кабинет» и укажите адрес этой почты/u);
    assert.match(letter.body, /договора поручения обработки персональных данных/u);
    assert.doesNotMatch(letter.body, /https?:\/\//u, 'в письме ссылка — её даёт кнопка (Р-162)');
  });

  it('договор уже отмечен — абзаца о нём нет', () => {
    assert.doesNotMatch(invitationLetter(true).body, /договора поручения/u);
  });
});

describe('письмо «Доступ к материалам открыт»', () => {
  it('тема и текст', () => {
    const letter = ndaSignedLetter();
    assert.equal(letter.subject, 'Доступ к материалам открыт');
    assert.match(letter.body, /Материалы назначенных вам работ открыты/u);
  });
});

describe('письмо «Вас назначили куратором работы {код}»', () => {
  it('с договором — тип, название, тема, срок, менеджер', () => {
    const letter = assignmentLetter(work, true);
    assert.equal(letter.subject, 'Вас назначили куратором работы PD-2026-061');
    for (const line of [
      'PD-2026-061 — Глава 2 диссертации.',
      'Тема: Износ резцов проходческого комбайна.',
      'Тип сопровождения: Сопровождение диссертационного исследования.',
      'Срок работы: 15 декабря 2026.',
      'Менеджер: Нечаева Ксения Ильинична.',
    ]) {
      assert.ok(letter.body.includes(line), `нет строки «${line}»`);
    }
  });

  it('без договора — тип, срок, менеджер; без названия и темы (ОЭ-5)', () => {
    const letter = assignmentLetter(work, false);
    assert.match(letter.body, /^Работа PD-2026-061\./u);
    assert.match(letter.body, /Тип сопровождения: /u);
    assert.match(letter.body, /Срок работы: 15 декабря 2026\./u);
    assert.match(letter.body, /Менеджер: Нечаева/u);
    assert.match(letter.body, /откроется после договора поручения/u);
    assert.doesNotMatch(letter.body, /Глава 2|Износ резцов/u, 'название или тема ушли без договора');
  });

  it('тема, совпадающая с названием, и срок без даты', () => {
    const letter = assignmentLetter({ ...work, topic: work.title, dueOn: null }, true);
    assert.doesNotMatch(letter.body, /Тема:/u);
    assert.match(letter.body, /Срок работы: не назначен\./u);
  });
});

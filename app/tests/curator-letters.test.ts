/**
 * Тексты писем куратору (требование Э-03, решение Р-323): кабинет открыт,
 * доступ к материалам открыт, назначение на работу. Без договора поручения
 * письмо о назначении не несёт ни названия, ни темы (ответ ОЭ-5). Снятие с
 * работы и вознаграждение — без названия работы до договора и без суммы
 * всегда (требование Э-09, решение Р-328).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assignmentLetter,
  invitationLetter,
  ndaSignedLetter,
  payoutLetter,
  unassignedLetter,
} from '../src/lib/cabinet/curator-letters.ts';

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

describe('письма о снятии с работы и о вознаграждении (Э-09)', () => {
  it('снятие с работы — код без названия; передача и снятие различаются', () => {
    const replaced = unassignedLetter('PD-2026-061', true);
    assert.equal(replaced.subject, 'Работа PD-2026-061 передана другому куратору');
    assert.match(replaced.body, /вознаграждение остаётся на экране «Вознаграждение»/u);
    assert.equal(unassignedLetter('PD-2026-061', false).subject, 'Вы сняты с работы PD-2026-061');
  });

  it('вознаграждение без суммы; с договором — название и этап, без договора — только код', () => {
    const payout = { code: 'PD-2026-061', title: 'Глава 2 диссертации', stage: 'Обзор источников' };
    const signed = payoutLetter(payout, false, true);
    assert.equal(signed.subject, 'Начислено вознаграждение: PD-2026-061');
    assert.match(signed.body, /PD-2026-061 — Глава 2 диссертации, этап «Обзор источников»/u);
    const unsigned = payoutLetter(payout, true, false);
    assert.equal(unsigned.subject, 'Вознаграждение выплачено: PD-2026-061');
    assert.doesNotMatch(unsigned.body, /Глава 2|Обзор источников/u, 'название ушло без договора');
    for (const letter of [signed, unsigned]) {
      assert.doesNotMatch(`${letter.subject}\n${letter.body}`, /\d[\d\s]*(₽|руб)/u, 'сумма в письме');
    }
  });
});

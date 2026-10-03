/**
 * Тексты по роли (требование М-20, решение Р-306): на экране настроек
 * менеджера нет обращений клиента; карточка вопроса не обещает ответа,
 * которого нет; в письме вопроса — как ответить спросившему.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  HELP_CARD_NOTE,
  contactKindsFor,
  contactLabelFor,
  contactNoteFor,
  helpLetterBody,
  settingsTexts,
} from '../src/lib/cabinet/staff-texts.ts';
import type { ContactKind } from '../src/lib/cabinet/channels.ts';

const KINDS: readonly ContactKind[] = ['EMAIL', 'TELEGRAM', 'PHONE_CALL', 'MESSENGER', 'FULL_SUPPORT'];
const LABEL: Record<ContactKind, string> = {
  EMAIL: 'Письмо на почту',
  TELEGRAM: 'Сообщение в Telegram',
  PHONE_CALL: 'Звонок куратора',
  MESSENGER: 'Мессенджер или социальная сеть',
  FULL_SUPPORT: 'Полное сопровождение',
};
const NOTE: Record<ContactKind, string> = {
  EMAIL: 'Уведомления и ответы куратора приходят письмом.',
  TELEGRAM: 'То же, но сообщением в Telegram — быстрее письма.',
  PHONE_CALL: 'Куратор звонит по важным поворотам работы, а не по каждой мелочи.',
  MESSENGER: 'Куратор пишет туда, где вам удобно отвечать.',
  FULL_SUPPORT: 'Куратор ведёт работу сам и связывается первым, не дожидаясь вопросов.',
};

describe('тексты экрана настроек по роли', () => {
  it('у менеджера нет обращений к клиенту', () => {
    const texts = Object.values(settingsTexts('MANAGER'));
    for (const text of texts) {
      assert.doesNotMatch(text, /[Кк]уратор/u, `текст для клиента у менеджера: ${text}`);
    }
    assert.match(settingsTexts('MANAGER').contactsLead, /^Руководитель видит этот список, когда вы задаёте вопрос/u);
  });

  it('клиенту тексты прежние', () => {
    assert.match(settingsTexts('CLIENT').contactsLead, /^Куратор видит этот список/u);
    assert.match(settingsTexts('CLIENT').consentTail, /письмом куратору\.$/u);
  });

  it('подписи способов связи менеджера — без куратора и без полного сопровождения', () => {
    const kinds = contactKindsFor('MANAGER', KINDS);
    assert.ok(!kinds.includes('FULL_SUPPORT'));
    // Заведённое прежде «Полное сопровождение» тоже подписано не для клиента.
    for (const kind of KINDS) {
      assert.doesNotMatch(contactLabelFor('MANAGER', kind, LABEL), /куратор/iu);
      assert.doesNotMatch(contactNoteFor('MANAGER', kind, NOTE), /[Кк]уратор/u);
    }
    assert.deepEqual(contactKindsFor('CLIENT', KINDS), [...KINDS]);
    assert.equal(contactLabelFor('CLIENT', 'PHONE_CALL', LABEL), 'Звонок куратора');
  });
});

describe('вопрос руководителю', () => {
  it('карточка обещает ответ по почте или в Telegram', () => {
    assert.match(HELP_CARD_NOTE, /Руководитель получит уведомление и ответит по почте или в Telegram\.$/u);
    assert.doesNotMatch(HELP_CARD_NOTE, /который он выбрал/u);
  });

  it('в письме — почта и предпочтительный способ связи спросившего', () => {
    const body = helpLetterBody('Клиент просит перенести защиту', {
      fullName: 'Нечаева Ксения Ильинична',
      email: 'nechaeva@example.org',
      preferred: { label: 'Звонок', value: '+7 900 000-00-00', note: 'после 18:00' },
    });
    assert.match(body, /^Клиент просит перенести защиту\n\n/u);
    assert.match(body, /Спрашивает: Нечаева Ксения Ильинична, nechaeva@example\.org/u);
    assert.match(body, /Предпочтительный способ связи: Звонок — \+7 900 000-00-00 \(после 18:00\)/u);
    const plain = helpLetterBody('Вопрос', { fullName: 'Ф', email: 'f@example.org', preferred: null });
    assert.match(plain, /Предпочтительный способ связи: не указан — почта учётной записи/u);
  });
});

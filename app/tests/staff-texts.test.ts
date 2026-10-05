/**
 * Тексты по роли (требование М-20, решение Р-306): на экране настроек
 * менеджера нет обращений клиента; карточка вопроса не обещает ответа,
 * которого нет; в письме вопроса — как ответить спросившему. У куратора —
 * свои тексты, без обращений к клиенту (требование Э-10, решение Р-330).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  contactKindsFor,
  contactLabelFor,
  contactNoteFor,
  settingsTexts,
  uploadFailedText,
  waitingPublication,
} from '../src/lib/cabinet/staff-texts.ts';
import type { ContactKind } from '../src/lib/cabinet/channels.ts';

const KINDS: readonly ContactKind[] = ['EMAIL', 'TELEGRAM', 'PHONE_CALL', 'MESSENGER', 'FULL_SUPPORT'];
const LABEL: Record<ContactKind, string> = {
  EMAIL: 'Письмо на почту',
  TELEGRAM: 'Сообщение в Telegram',
  PHONE_CALL: 'Звонок менеджера',
  MESSENGER: 'Мессенджер или социальная сеть',
  FULL_SUPPORT: 'Полное сопровождение',
};
const NOTE: Record<ContactKind, string> = {
  EMAIL: 'Уведомления и ответы менеджера приходят письмом.',
  TELEGRAM: 'То же, но сообщением в Telegram — быстрее письма.',
  PHONE_CALL: 'Менеджер звонит по важным поворотам работы, а не по каждой мелочи.',
  MESSENGER: 'Менеджер пишет туда, где вам удобно отвечать.',
  FULL_SUPPORT: 'Менеджер ведёт работу сам и связывается первым, не дожидаясь вопросов.',
};

describe('тексты экрана настроек по роли', () => {
  it('у менеджера нет обращений к клиенту', () => {
    const texts = Object.values(settingsTexts('MANAGER'));
    for (const text of texts) {
      assert.doesNotMatch(text, /[Мм]енеджер/u, `текст для клиента у менеджера: ${text}`);
    }
    assert.match(settingsTexts('MANAGER').contactsLead, /^Руководитель видит этот список, когда вы задаёте вопрос/u);
  });

  it('клиенту — тексты о менеджере (Э-01)', () => {
    assert.match(settingsTexts('CLIENT').contactsLead, /^Менеджер видит этот список/u);
    // Адрес практики дописывает экран ссылкой (Т-08, Р-314).
    assert.match(settingsTexts('CLIENT').consentTail, /письмом менеджеру или на$/u);
  });

  it('подписи способов связи менеджера — без обращения к нему самому и без полного сопровождения', () => {
    const kinds = contactKindsFor('MANAGER', KINDS);
    assert.ok(!kinds.includes('FULL_SUPPORT'));
    // Заведённое прежде «Полное сопровождение» тоже подписано не для клиента.
    for (const kind of KINDS) {
      assert.doesNotMatch(contactLabelFor('MANAGER', kind, LABEL), /менеджер/iu);
      assert.doesNotMatch(contactNoteFor('MANAGER', kind, NOTE), /[Мм]енеджер/u);
    }
    // Клиент включает сопровождение отдельной отметкой, не строкой перечня (П-09, Р-401).
    assert.deepEqual(contactKindsFor('CLIENT', KINDS), KINDS.filter((kind) => kind !== 'FULL_SUPPORT'));
    assert.equal(contactLabelFor('CLIENT', 'PHONE_CALL', LABEL), 'Звонок менеджера');
  });
});

describe('тексты экрана настроек куратора (Э-10)', () => {
  it('без обращений к клиенту: список видят менеджер работ и руководитель', () => {
    const texts = settingsTexts('EXPERT');
    assert.notDeepEqual(texts, settingsTexts('CLIENT'));
    assert.match(texts.contactsLead, /^Менеджер ваших работ и руководитель видят этот список/u);
    for (const text of Object.values(texts)) {
      for (const phrase of [/держится его/u, /менеджер будет писать/u, /Звонки и сообщения в сетях делает менеджер/u, /письмом менеджеру/u]) {
        assert.doesNotMatch(text, phrase, `текст для клиента у куратора: ${text}`);
      }
    }
  });

  it('подписи способов связи куратора — без «Звонка менеджера» и «Полного сопровождения»', () => {
    const kinds = contactKindsFor('EXPERT', KINDS);
    assert.ok(!kinds.includes('FULL_SUPPORT'));
    assert.equal(contactLabelFor('EXPERT', 'PHONE_CALL', LABEL), 'Звонок');
    assert.match(contactNoteFor('EXPERT', 'PHONE_CALL', NOTE), /^Менеджер звонит, когда вопрос по заданию/u);
    for (const kind of KINDS) {
      assert.doesNotMatch(contactNoteFor('EXPERT', kind, NOTE), /ведёт работу сам|по важным поворотам работы/u, kind);
    }
  });
});

describe('отказ загрузки по роли (УК-08, Р-364)', () => {
  it('клиенту — к менеджеру, сотрудникам — к руководителю', () => {
    assert.match(uploadFailedText('CLIENT'), /напишите менеджеру/u);
    assert.doesNotMatch(uploadFailedText('CLIENT'), /руководител/u);
    for (const role of ['MANAGER', 'EXPERT', 'HEAD'] as const) assert.match(uploadFailedText(role), /напишите руководителю/u);
  });
});

describe('строка об удалении данных без отметки о согласии (УК-18, Р-369)', () => {
  it('у каждой роли — право требовать удаления, без «отозвать»', () => {
    for (const role of ['CLIENT', 'MANAGER', 'EXPERT', 'HEAD'] as const) {
      const text = settingsTexts(role).erasureTail;
      assert.match(text, /^Потребовать удаления своих персональных данных можно письмом/u);
      assert.doesNotMatch(text, /[Оо]тозвать/u);
      assert.match(text, / на$/u);
    }
  });
});

/** Общие подписи клиента — как `CONTACT_NOTE` в `channels.ts` (модуль с базой здесь не грузится). */
const CONTACT_NOTE: Record<ContactKind, string> = {
  EMAIL: 'Уведомления и ответы менеджера приходят письмом.',
  TELEGRAM: 'То же, но сообщением в Telegram — быстрее письма.',
  PHONE_CALL: 'Менеджер звонит по важным поворотам работы, а не по каждой мелочи.',
  MESSENGER: 'Менеджер пишет туда, где вам удобно отвечать.',
  FULL_SUPPORT: 'Менеджер ведёт работу сам и связывается первым, не дожидаясь вопросов.',
};

describe('подписи способов связи руководителя (УМ-15, УЭ-02, Р-370)', () => {
  it('без обращений клиента: не «ответы менеджера», не «повороты работы»', () => {
    const kinds = ['EMAIL', 'TELEGRAM', 'PHONE_CALL', 'MESSENGER', 'FULL_SUPPORT'] as const;
    for (const kind of kinds) {
      const note = contactNoteFor('HEAD', kind, CONTACT_NOTE);
      assert.notEqual(note, CONTACT_NOTE[kind], kind);
      assert.doesNotMatch(note, /ответы менеджера|поворотам работы|ведёт работу сам/u, kind);
    }
  });
});

describe('«Ждут публикации» одной строкой (УЭ-04, Р-382)', () => {
  it('по видам, с числительными; пусто — ничего', () => {
    assert.equal(waitingPublication(3, 1), 'Ждут публикации: 3 замечания и 1 версия куратора.');
    assert.equal(waitingPublication(0, 5), 'Ждут публикации: 5 версий куратора.');
    assert.equal(waitingPublication(11, 0), 'Ждут публикации: 11 замечаний.');
    assert.equal(waitingPublication(0, 0), null);
  });
});

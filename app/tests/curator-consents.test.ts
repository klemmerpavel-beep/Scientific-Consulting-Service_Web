/**
 * Согласия куратора отмечает сам куратор (П-12, решение Р-768): свёртка
 * текста, «согласие действует», скрытие витрины без текста, строки
 * состояния у куратора и руководителя, журнал, тексты по С-1 и Р-365 и
 * форма руководителя без полей согласий.
 *
 * Проверки без базы; права и запись — `curator-consents.db.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  CAMERA_CONSENT_TEXT,
  CONSENT_TITLE,
  SHOWCASE_TEXT_MAX,
  consentStatusForCurator,
  consentStatusForHead,
  consentTextHash,
  normalizeConsentText,
  shortHash,
  showcaseConsentValid,
  showcaseOffered,
  showcaseState,
  type ConsentMarks,
} from '../src/lib/cabinet/curator-consents.ts';
import { actionLabel, detailsLabel } from '../src/lib/cabinet/journal-labels.ts';
import { findForbidden } from '../src/lib/cabinet/text-guard.ts';

const SRC = path.join(import.meta.dirname, '..', 'src');
const read = (...parts: string[]) => readFileSync(path.join(SRC, ...parts), 'utf8');

const TEXT_A = 'Даю согласие на карточку без имени в витрине кураторов.';
const TEXT_B = 'Даю согласие на карточку без имени в витрине кураторов на сайте prodisser.ru.';
const at = new Date(Date.UTC(2026, 10, 2, 7, 30));
const none: ConsentMarks = { cameraConsentAt: null, showcaseConsentAt: null, showcaseConsentHash: null };
const givenA: ConsentMarks = { cameraConsentAt: at, showcaseConsentAt: at, showcaseConsentHash: consentTextHash(TEXT_A) };

describe('свёртка текста согласия', () => {
  it('SHA-256, шестнадцатеричная; пробелы по краям строк и переводы строк её не меняют', () => {
    const hash = consentTextHash(TEXT_A);
    assert.match(hash, /^[0-9a-f]{64}$/u);
    assert.equal(consentTextHash(`  ${TEXT_A}\r\n`), hash);
    assert.equal(consentTextHash('Строка один\r\nСтрока два'), consentTextHash('Строка один  \n  Строка два'));
    assert.notEqual(consentTextHash(TEXT_B), hash);
    assert.equal(shortHash(hash), hash.slice(0, 12));
    assert.equal(shortHash(null), null);
  });

  it('текст к хранению: переводы строк — \\n, три пустые строки — одна', () => {
    assert.equal(normalizeConsentText(' А\r\n\r\n\r\n\r\nБ \n'), 'А\n\nБ');
    assert.equal(normalizeConsentText('   '), '');
  });
});

describe('согласие на витрину действует только на действующий текст', () => {
  it('нет отметки — нет согласия', () => {
    assert.equal(showcaseState(none, TEXT_A), 'none');
    assert.equal(showcaseState(null, TEXT_A), 'none');
    assert.equal(showcaseConsentValid(none, TEXT_A), false);
  });

  it('отметка на этот текст — действует', () => {
    assert.equal(showcaseState(givenA, TEXT_A), 'valid');
    assert.equal(showcaseConsentValid(givenA, `${TEXT_A}\n`), true);
  });

  it('текст сменился — согласие дано на прежний и не действует до новой отметки', () => {
    assert.equal(showcaseState(givenA, TEXT_B), 'stale');
    assert.equal(showcaseConsentValid(givenA, TEXT_B), false);
  });

  it('текст снят — прежнее согласие не действует; отметка без свёртки (до Р-768) — тоже', () => {
    assert.equal(showcaseConsentValid(givenA, ''), false);
    assert.equal(showcaseState(givenA, ''), 'stale');
    assert.equal(showcaseConsentValid({ ...givenA, showcaseConsentHash: null }, TEXT_A), false);
  });
});

describe('отметка витрины у куратора без текста не показывается', () => {
  it('текста нет и отметки нет — строки витрины нет', () => {
    assert.equal(showcaseOffered(none, ''), false);
    assert.equal(showcaseOffered(null, '  \n '), false);
  });

  it('текст есть — строка есть; текста нет, а отметка стоит — строка есть, чтобы отозвать', () => {
    assert.equal(showcaseOffered(none, TEXT_A), true);
    assert.equal(showcaseOffered(givenA, ''), true);
  });
});

describe('строки состояния', () => {
  it('у куратора: камера, витрина — нет, дано, дано на прежний текст', () => {
    assert.equal(consentStatusForCurator('camera', none, ''), 'Согласия нет: камера на созвоне знакомства не включается.');
    assert.equal(
      consentStatusForCurator('camera', givenA, ''),
      'Согласие дано 2 ноября 2026: камеру на созвоне знакомства можно включить.',
    );
    assert.equal(consentStatusForCurator('showcase', none, TEXT_A), 'Согласия нет: в витрину кураторов вы не попадаете.');
    assert.equal(consentStatusForCurator('showcase', givenA, TEXT_A), 'Согласие дано 2 ноября 2026.');
    assert.match(consentStatusForCurator('showcase', givenA, TEXT_B), /на прежний текст.*до новой отметки карточка в витрину не идёт/u);
  });

  it('у руководителя: отметка и день, без формы; без текста — почему куратор отметки не видит', () => {
    assert.equal(consentStatusForHead('camera', givenA, ''), 'куратор отметил согласие 2 ноября 2026');
    assert.equal(consentStatusForHead('camera', none, ''), 'согласия нет');
    assert.equal(consentStatusForHead('showcase', givenA, TEXT_A), 'куратор отметил согласие 2 ноября 2026');
    assert.match(consentStatusForHead('showcase', givenA, TEXT_B), /на прежний текст — в витрину не идёт до новой отметки/u);
    assert.match(consentStatusForHead('showcase', none, ''), /текст согласия не внесён — куратору отметка не показывается/u);
  });

  it('день — по Москве: отметка в 23:30 UTC — следующим днём', () => {
    const late = { ...none, cameraConsentAt: new Date(Date.UTC(2026, 10, 1, 23, 30)) };
    assert.match(consentStatusForCurator('camera', late, ''), /2 ноября 2026/u);
  });
});

describe('текст согласия на камеру (П-6, П-12)', () => {
  it('видео на созвоне знакомства; имя, место работы и контакты не называются; запись не ведётся', () => {
    assert.match(CAMERA_CONSENT_TEXT, /созвоне знакомства/u);
    assert.match(CAMERA_CONSENT_TEXT, /имя, место работы и контакты на созвоне не называются/u);
    assert.match(CAMERA_CONSENT_TEXT, /запись разговора не ведётся/u);
    assert.match(CAMERA_CONSENT_TEXT, /отозвать/u);
  });

  it('тексты согласий и строк проходят text-guard (С-1, Р-365)', () => {
    const texts = [
      CAMERA_CONSENT_TEXT,
      ...Object.values(CONSENT_TITLE),
      ...(['camera', 'showcase'] as const).flatMap((kind) =>
        [none, givenA].flatMap((marks) => [
          consentStatusForCurator(kind, marks, TEXT_A),
          consentStatusForCurator(kind, marks, TEXT_B),
          consentStatusForHead(kind, marks, TEXT_A),
          consentStatusForHead(kind, marks, ''),
        ]),
      ),
    ];
    for (const text of texts) assert.deepEqual(findForbidden(text), [], text);
  });

  it('предел текста согласия на витрину — 4000 знаков', () => {
    assert.equal(SHOWCASE_TEXT_MAX, 4000);
  });
});

describe('журнал: отметка, отзыв и смена текста (Р-768)', () => {
  it('коды названы словами', () => {
    assert.equal(actionLabel('CURATOR_CONSENT_GIVEN'), 'Куратор дал согласие');
    assert.equal(actionLabel('CURATOR_CONSENT_WITHDRAWN'), 'Куратор отозвал согласие');
    assert.equal(actionLabel('SHOWCASE_CONSENT_TEXT_SAVED'), 'Изменён текст согласия на витрину кураторов');
  });

  it('какое согласие — словами, свёртка — короткой; текст на экран не выводится', () => {
    assert.equal(
      detailsLabel({ consent: 'showcase', textHash: 'abcdef012345' }, 'CURATOR_CONSENT_GIVEN'),
      'согласие: витрина кураторов на сайте · свёртка текста abcdef012345',
    );
    assert.equal(detailsLabel({ consent: 'camera' }, 'CURATOR_CONSENT_WITHDRAWN'), 'согласие: камера на созвоне знакомства');
    const line = detailsLabel(
      { from: null, to: 'abcdef012345', chars: TEXT_A.length, text: TEXT_A },
      'SHOWCASE_CONSENT_TEXT_SAVED',
    );
    assert.equal(line, `свёртка стала abcdef012345 · знаков ${TEXT_A.length}`);
  });
});

describe('форма руководителя согласий не ставит (П-12)', () => {
  it('на «Учётных записях» нет флажков согласий, есть строки отметки и форма текста витрины', () => {
    const page = read('app', 'cabinet', 'manage', 'users', 'page.tsx');
    assert.doesNotMatch(page, /name="cameraConsent"|name="showcaseConsent"/u);
    assert.match(page, /consentStatusForHead\(kind/u);
    assert.match(page, /action=\{updateShowcaseConsentText\}/u);
  });

  it('действие формы профиля не читает согласий; сохранение профиля их не пишет', () => {
    const actions = read('app', 'cabinet', 'actions.ts');
    const start = actions.indexOf('export async function updateCuratorProfile(');
    const body = actions.slice(start, actions.indexOf('\nexport ', start + 1));
    assert.doesNotMatch(body, /Consent/u);
    const admin = read('lib', 'cabinet', 'admin.ts');
    const from = admin.indexOf('export async function saveCuratorProfile(');
    const save = admin.slice(from, admin.indexOf('\n}\n', from));
    assert.doesNotMatch(save, /cameraConsent|showcaseConsent/u);
  });

  it('у куратора — тексты согласий и кнопки «Даю согласие» и «Отозвать согласие» со свёрткой', () => {
    const page = read('app', 'cabinet', 'settings', 'page.tsx');
    assert.match(page, /CAMERA_CONSENT_TEXT/u);
    assert.match(page, /showcaseOffered\(marks, showcaseText\)/u);
    assert.match(page, /name="textHash" value=\{consent\.hash\}/u);
    assert.match(page, />Даю согласие</u);
    assert.match(page, />Отозвать согласие</u);
  });
});

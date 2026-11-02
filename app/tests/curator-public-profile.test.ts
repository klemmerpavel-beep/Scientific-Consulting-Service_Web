/**
 * Обезличенный профиль куратора (П-1, решение Р-764): строки свёртки
 * «Профиль куратора», состав данных экрана клиента, разбор полей формы
 * руководителя, подписи журнала и тексты по правилам С-1 и Р-365.
 *
 * Проверки без базы; на PostgreSQL — `curator-profile.db.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  CURATOR_PROFILE_NOTE,
  CURATOR_PUBLIC_FIELDS,
  PUBLICATION_CATEGORIES,
  curatorProfileRows,
  publicationsLine,
  withoutStaffNames,
  type Actor,
} from '../src/lib/cabinet/access.ts';
import { CURATOR_PROFILE_FIELD_LABEL, detailsLabel } from '../src/lib/cabinet/journal-labels.ts';
import { EXPERIENCE_YEARS_MAX, PUBLICATIONS_MAX, profileCheckedOn, profileCount } from '../src/lib/cabinet/profile-input.ts';
import { findForbidden } from '../src/lib/cabinet/text-guard.ts';

const SRC = path.join(import.meta.dirname, '..', 'src');

const as = (role: Actor['role']): Actor => ({
  id: `${role.toLowerCase()}-profile`,
  role,
  status: 'ACTIVE',
  clientProfileId: role === 'CLIENT' ? 'client-profile' : null,
  expertNdaSignedAt: null,
});

const full = {
  degree: 'д.т.н.',
  academicTitle: 'профессор',
  specialtyCode: '2.8.6',
  specialization: 'теория надёжности технических систем',
  experienceYears: 23,
  pubK1: 4,
  pubK2: 6,
  pubK3: 2,
  pubRsci: 3,
  pubIntl: 5,
  pubCheckedOn: new Date(Date.UTC(2026, 7, 24)),
};

describe('строки свёртки «Профиль куратора» (П-1)', () => {
  it('полный профиль: степень и звание, специальность, стаж, публикации со сверкой, завершённые работы', () => {
    assert.deepEqual(curatorProfileRows(full, 7), [
      { term: 'Степень и звание', value: 'д.т.н., профессор' },
      { term: 'Научная специальность', value: '2.8.6 — теория надёжности технических систем' },
      { term: 'Стаж научной и преподавательской работы', value: '23 года' },
      {
        term: 'Публикации',
        value: 'ВАК: К1 — 4, К2 — 6, К3 — 2; RSCI — 3; Scopus и Web of Science — 5',
        note: 'за пять лет, сверено 24 августа 2026',
      },
      { term: 'Завершено работ в ProDisser', value: '7' },
    ]);
  });

  it('пустые части не выводятся; ноль публикаций — число, а не пропуск', () => {
    const rows = curatorProfileRows({ degree: ' ', specialtyCode: '5.2.3', pubK2: 0, pubCheckedOn: full.pubCheckedOn }, null);
    assert.deepEqual(
      rows.map((row) => row.term),
      ['Научная специальность', 'Публикации'],
    );
    assert.equal(rows[1]!.value, 'ВАК: К2 — 0');
    assert.deepEqual(curatorProfileRows(null, null), []);
    assert.equal(publicationsLine({ degree: null, specialtyCode: null, pubIntl: 2 }), 'Scopus и Web of Science — 2');
  });

  it('публикации без дня сверки клиенту не выводятся', () => {
    const rows = curatorProfileRows({ ...full, pubCheckedOn: null }, null);
    assert.equal(rows.some((row) => row.term === 'Публикации'), false);
  });

  it('стаж согласован с числом; ноль — «менее года»', () => {
    const years = (n: number) =>
      curatorProfileRows({ degree: null, specialtyCode: null, experienceYears: n }, null)[0]!.value;
    assert.equal(years(1), '1 год');
    assert.equal(years(3), '3 года');
    assert.equal(years(11), '11 лет');
    assert.equal(years(21), '21 год');
    assert.equal(years(0), 'менее года');
  });

  it('завершённых работ нет — «пока нет»; число не отдано — строки нет', () => {
    const done = (n: number | null) =>
      curatorProfileRows({ degree: 'к.э.н.', specialtyCode: null }, n).find((row) => row.term === 'Завершено работ в ProDisser');
    assert.equal(done(0)?.value, 'пока нет');
    assert.equal(done(null), undefined);
  });

  it('средней оценки сопровождения в профиле нет (П-8, Р-565)', () => {
    const text = JSON.stringify(curatorProfileRows(full, 7));
    assert.doesNotMatch(text, /оценк|рейтинг|балл/iu);
  });

  it('пять категорий публикаций в порядке задания', () => {
    assert.deepEqual(
      PUBLICATION_CATEGORIES.map((category) => category.key),
      ['pubK1', 'pubK2', 'pubK3', 'pubRsci', 'pubIntl'],
    );
  });
});

describe('данные экрана клиента — только обезличенный профиль (Р-147, Р-297, Р-418, Р-764)', () => {
  const data = {
    client: { fullName: 'Иванова Мария Петровна', university: 'Свой вуз клиента', email: 'client@example.org' },
    manager: {
      fullName: 'Нечаева К. И.',
      role: 'MANAGER',
      email: 'manager@example.org',
      expertProfile: { degree: 'к.т.н.', position: 'менеджер практики', university: 'Вуз менеджера' },
    },
    expert: {
      id: 'e1',
      fullName: 'Григорьев Антон Эдуардович',
      role: 'EXPERT',
      email: 'expert@example.org',
      expertProfile: {
        ...full,
        position: 'заведующий кафедрой',
        university: 'Северо-Западный политехнический университет',
        defaultPayout: 1_735_000n,
        ndaSignedAt: new Date(0),
        cameraConsentAt: new Date(0),
        showcaseConsentAt: new Date(0),
        showcaseConsentHash: 'a'.repeat(64),
        ndaRequestedAt: new Date(0),
      },
    },
  };

  it('клиенту: в профиле сотрудника только поля обезличенного профиля', () => {
    const seen = withoutStaffNames(as('CLIENT'), data);
    assert.deepEqual(Object.keys(seen.expert.expertProfile).sort(), [...CURATOR_PUBLIC_FIELDS].sort());
    const text = JSON.stringify(seen, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value));
    for (const trace of [
      'Григорьев',
      'expert@example.org',
      'заведующий кафедрой',
      'Северо-Западный',
      '1735000',
      'cameraConsentAt',
      'showcaseConsentAt',
      'showcaseConsentHash',
      'ndaSignedAt',
      'менеджер практики',
      'Вуз менеджера',
    ]) {
      assert.ok(!text.includes(trace), `в данных экрана клиента — ${trace}`);
    }
    assert.equal(seen.expert.expertProfile.experienceYears, 23);
    assert.ok(seen.expert.expertProfile.pubCheckedOn instanceof Date, 'день сверки испорчен');
  });

  it('свои сведения клиента и объекты без роли сотрудника не трогаются', () => {
    const seen = withoutStaffNames(as('CLIENT'), data);
    assert.equal(seen.client.university, 'Свой вуз клиента');
    assert.equal(seen.client.fullName, 'Иванова Мария Петровна');
  });

  it('практике и куратору профиль отдаётся как есть', () => {
    for (const role of ['EXPERT', 'MANAGER', 'HEAD'] as const) {
      assert.equal(withoutStaffNames(as(role), data), data);
    }
  });

  it('в перечне полей для клиента нет служебных и раскрывающих имя', () => {
    for (const field of ['position', 'university', 'defaultPayout', 'ndaSignedAt', 'cameraConsentAt', 'showcaseConsentAt', 'showcaseConsentHash']) {
      assert.equal(CURATOR_PUBLIC_FIELDS.includes(field), false, field);
    }
  });
});

describe('выборка экрана работы берёт обезличенный профиль и не берёт служебного (Р-418)', () => {
  const source = readFileSync(path.join(SRC, 'lib', 'cabinet', 'queries.ts'), 'utf8');
  const start = source.indexOf('export async function projectByCode');
  const body = source.slice(start, source.indexOf('\nexport ', start + 10));
  const expert = body.slice(body.indexOf('expert: {'), body.indexOf('stages:'));

  it('стаж, публикации и день сверки — в выборке', () => {
    for (const field of ['academicTitle', 'experienceYears', 'pubK1', 'pubK2', 'pubK3', 'pubRsci', 'pubIntl', 'pubCheckedOn']) {
      assert.match(expert, new RegExp(`\\b${field}: true`, 'u'), field);
    }
  });

  it('должность, вуз, ставка и согласия — нет', () => {
    for (const field of ['position', 'university', 'defaultPayout', 'cameraConsentAt', 'showcaseConsentAt', 'showcaseConsentHash']) {
      assert.doesNotMatch(expert, new RegExp(`\\b${field}: true`, 'u'), field);
    }
  });
});

describe('поля формы руководителя', () => {
  it('числа: пусто — null, без поля — не трогается, целое в пределах', () => {
    assert.equal(profileCount('', PUBLICATIONS_MAX, 'К1'), null);
    assert.equal(profileCount(undefined, PUBLICATIONS_MAX, 'К1'), undefined);
    assert.equal(profileCount(' 12 ', PUBLICATIONS_MAX, 'К1'), 12);
    assert.equal(profileCount('0', EXPERIENCE_YEARS_MAX, 'Стаж'), 0);
    assert.throws(() => profileCount('-1', PUBLICATIONS_MAX, 'К1'), /целым числом от 0 до 500/u);
    assert.throws(() => profileCount('2,5', PUBLICATIONS_MAX, 'К1'), /целым числом/u);
    assert.throws(() => profileCount('230', EXPERIENCE_YEARS_MAX, 'Стаж'), /Стаж — целым числом от 0 до 70/u);
  });

  it('день сверки: полночь UTC, не позже сегодняшнего дня по Москве', () => {
    const today = new Date(Date.UTC(2026, 10, 1));
    assert.equal(profileCheckedOn('2026-10-15', today)?.toISOString(), '2026-10-15T00:00:00.000Z');
    assert.equal(profileCheckedOn('2026-11-01', today)?.toISOString(), '2026-11-01T00:00:00.000Z');
    assert.equal(profileCheckedOn('', today), null);
    assert.equal(profileCheckedOn(undefined, today), undefined);
    assert.throws(() => profileCheckedOn('2026-11-02', today), /не позже сегодняшнего дня/u);
    assert.throws(() => profileCheckedOn('2026-02-30', today), /распознана неверно/u);
    assert.throws(() => profileCheckedOn('15.10.2026', today), /распознана неверно/u);
  });
});

describe('журнал: перечень полей профиля — словами (Р-324, Р-764)', () => {
  it('изменённые поля, ставка рублями, согласия — «да»/«нет»', () => {
    const line = detailsLabel(
      { changed: ['experienceYears', 'pubK1', 'pubCheckedOn', 'cameraConsent', 'defaultPayout'], defaultPayout: '2000000', cameraConsent: true },
      'CURATOR_PROFILE_SAVED',
    );
    assert.match(line, /^изменено: стаж, публикации ВАК К1, дата сверки публикаций, согласие на камеру, ставка/u);
    assert.match(line, /ставка 20\s000\s₽/u);
    assert.match(line, /согласие на камеру да/u);
    assert.doesNotMatch(line, /pub|experience|camera/u);
  });

  it('у каждого поля формы профиля есть подпись', () => {
    for (const field of [
      'degree',
      'academicTitle',
      'position',
      'specialtyCode',
      'specialization',
      'university',
      'defaultPayout',
      'experienceYears',
      ...PUBLICATION_CATEGORIES.map((category) => category.key),
      'pubCheckedOn',
      'cameraConsent',
      'showcaseConsentAt',
    ]) {
      assert.ok(CURATOR_PROFILE_FIELD_LABEL[field], field);
    }
  });
});

describe('тексты профиля — по правилам С-1 и Р-365', () => {
  it('пояснение свёртки и строки проходят text-guard', () => {
    const texts = [CURATOR_PROFILE_NOTE, ...curatorProfileRows(full, 7).flatMap((row) => [row.term, row.value, row.note ?? ''])];
    for (const text of texts) assert.deepEqual(findForbidden(text), [], text);
  });

  it('пояснение не обещает имени и говорит словарём клиента', () => {
    assert.doesNotMatch(CURATOR_PROFILE_NOTE, /эксперт|практик|исполнител/iu);
    assert.match(CURATOR_PROFILE_NOTE, /не называются/u);
  });
});

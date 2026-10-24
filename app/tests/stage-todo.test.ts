/**
 * «Что сделать сейчас» на экране этапа — по фактическому состоянию и ходу
 * (решение Р-723). Практике подсказка учитывает сдачу куратором, возврат
 * клиентом, материал, версии на публикации и просрочку; строка фактов
 * ведёт к версии на публикации. Куратору первая строка — чей ход с его
 * стороны, и «Сейчас от вас ничего не требуется», когда ход не за ним.
 *
 * Выбор подсказки проверяется вызовом чистых функций, разметка экрана —
 * по тексту исходника: модуль с JSX тест не загружает.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  DONE_LAST,
  HANDED_EMPTY,
  HANDED_PUBLISHED,
  HANDED_TO_PUBLISH,
  IN_APPROVAL_CLEAR,
  RETURNED,
  STAFF_TODO,
  curatorStageLine,
  pendingVersionsLine,
  staffStageTodo,
  type StaffStageFacts,
} from '../src/lib/cabinet/stage-todo.ts';

const base: StaffStageFacts = {
  state: 'IN_PROGRESS',
  handedOver: false,
  materials: 0,
  pendingVersions: 0,
  pendingComments: 0,
  returnedUnacked: false,
  hasNext: true,
  lateDays: null,
};
const todo = (facts: Partial<StaffStageFacts>) => staffStageTodo({ ...base, ...facts });

describe('подсказка практике по сдаче, возврату, материалу и просрочке', () => {
  it('сданный куратором этап — не «Работа идёт», а публикация версии и перевод на согласование', () => {
    const { text, draft } = todo({ handedOver: true, materials: 1, pendingVersions: 1 });
    assert.equal(text, HANDED_TO_PUBLISH);
    assert.doesNotMatch(text, /Работа идёт/u);
    assert.match(text, /опубликуйте её клиенту и переведите на согласование — или верните куратору/u);
    assert.equal(draft, null);
  });

  it('сданный этап с уже опубликованной версией — без «опубликуйте»', () => {
    assert.equal(todo({ handedOver: true, materials: 1, pendingVersions: 0 }).text, HANDED_PUBLISHED);
  });

  it('сданный без материала и просроченный — оба обстоятельства', () => {
    const { text } = todo({ handedOver: true, materials: 0, lateDays: 491 });
    assert.equal(text, `${HANDED_EMPTY} Срок этапа прошёл 491 день назад: перенесите срок.`);
    assert.match(text, /без материала: приложите материал или верните куратору с причиной/u);
  });

  it('возвращённый клиентом без отметки — «Замечания приняты в работу»', () => {
    assert.equal(todo({ returnedUnacked: true, materials: 1 }).text, RETURNED);
    assert.match(RETURNED, /отметьте «Замечания приняты в работу»/u);
    // Отметка стоит — этап снова просто в работе.
    assert.equal(todo({ returnedUnacked: false, materials: 1 }).text, STAFF_TODO.IN_PROGRESS);
    // Сдача после возврата — решение за менеджером: подсказка сдачи.
    assert.equal(todo({ returnedUnacked: true, handedOver: true, materials: 1, pendingVersions: 1 }).text, HANDED_TO_PUBLISH);
  });

  it('этап в работе после срока — без «следите за сроком», со сроком в днях', () => {
    assert.equal(todo({ lateDays: 3 }).text, 'Работа идёт. Срок этапа прошёл 3 дня назад: перенесите срок.');
    assert.equal(todo({ lateDays: 11 }).text, 'Работа идёт. Срок этапа прошёл 11 дней назад: перенесите срок.');
  });

  it('прежние подсказки и заготовки сохраняются (Р-254, Р-377, Р-710)', () => {
    assert.deepEqual(todo({ state: 'AWAITING_CLIENT' }), { text: STAFF_TODO.AWAITING_CLIENT, draft: 'remind' });
    assert.deepEqual(todo({ state: 'IN_APPROVAL', materials: 1 }), { text: IN_APPROVAL_CLEAR, draft: 'approve' });
    assert.deepEqual(todo({ state: 'IN_APPROVAL', materials: 1, pendingComments: 2 }), { text: STAFF_TODO.IN_APPROVAL, draft: null });
    assert.equal(todo({ state: 'NOT_STARTED' }).text, STAFF_TODO.NOT_STARTED);
    assert.equal(todo({ state: 'DONE', hasNext: false }).text, DONE_LAST);
    // Закрытый этап просрочкой не помечается.
    assert.equal(todo({ state: 'DONE', hasNext: true, lateDays: 40 }).text, STAFF_TODO.DONE);
  });

  it('строка фактов — число версий на публикации', () => {
    assert.equal(pendingVersionsLine(1), '1 версия ждёт публикации');
    assert.equal(pendingVersionsLine(2), '2 версии ждут публикации');
    assert.equal(pendingVersionsLine(5), '5 версий ждут публикации');
    assert.equal(pendingVersionsLine(21), '21 версия ждёт публикации');
  });
});

describe('первая строка куратора — чей ход с его стороны', () => {
  const line = (state: StaffStageFacts['state'], extra: { projectStatus?: string; handedOverAt?: Date | null } = {}) =>
    curatorStageLine({ state, projectStatus: extra.projectStatus ?? 'ACTIVE', hasExpert: true, handedOverAt: extra.handedOverAt ?? null });

  it('на согласовании у клиента — ход за клиентом, от куратора ничего не требуется', () => {
    assert.deepEqual(line('IN_APPROVAL'), {
      text: 'Ход за клиентом: этап на согласовании. Сейчас от вас ничего не требуется.',
      idle: true,
    });
  });

  it('ход за куратором — только у несданного этапа в работе', () => {
    assert.deepEqual(line('IN_PROGRESS'), { text: 'Ход за вами: этап в работе.', idle: false });
    assert.equal(line('NOT_STARTED').text, 'Ход за менеджером: этап ещё не запущен. Сейчас от вас ничего не требуется.');
    assert.equal(line('AWAITING_CLIENT').idle, true);
    assert.equal(line('DONE').text, 'Этап закрыт. Сейчас от вас ничего не требуется.');
  });

  it('сданный этап — «Этап сдан …: ход за менеджером»', () => {
    const handed = line('IN_PROGRESS', { handedOverAt: new Date(Date.UTC(2026, 8, 22, 9)) });
    assert.equal(handed.text, 'Этап сдан 22 сентября 2026: ход за менеджером. Сейчас от вас ничего не требуется.');
    assert.equal(handed.idle, true);
  });

  it('приостановленная и закрытая работа — curatorWorkLine', () => {
    assert.equal(line('IN_PROGRESS', { projectStatus: 'PAUSED' }).text, 'Работа приостановлена. Сейчас от вас ничего не требуется.');
    assert.equal(line('IN_APPROVAL', { projectStatus: 'COMPLETED' }).text, 'Работа закрыта. Сейчас от вас ничего не требуется.');
  });
});

describe('экран этапа', () => {
  const page = readFileSync(
    path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'stages', '[id]', 'page.tsx'),
    'utf8',
  );
  const start = page.indexOf('{curatorView ? (');
  const curator = page.slice(start, page.indexOf(") : (stage.summary ?? '').trim() === ''", start));

  it('практике — подсказка по фактам, версия на публикации ссылкой на этом экране', () => {
    assert.match(page, /staffStageTodo\(\{[\s\S]*handedOver: handover === 'handed',[\s\S]*pendingVersions: pendingVersions\.length,[\s\S]*returnedUnacked: lastReturn !== undefined && stage\.returnAckAt === null,[\s\S]*lateDays: late,/u);
    assert.match(page, /\{todo\.text\}/u);
    assert.match(page, /<a href=\{`#version-\$\{pendingVersions\[0\]\.id\}`\} style=\{FACT_LINK\}>/u);
    assert.match(page, /id=\{forStaff \? `version-\$\{version\.id\}` : undefined\}/u);
    assert.doesNotMatch(page, /: STAFF_TODO\[state\]/u, 'подсказка по одному состоянию');
  });

  it('куратору — первая строка хода, описание этапа для клиента, «Этап сдан» первым', () => {
    assert.ok(start > 0, 'блок куратора не найден');
    const first = curator.indexOf('curatorLine.text');
    assert.ok(first > 0 && first < curator.indexOf('Описание этапа (его читает клиент)'), 'ход — не первой строкой');
    assert.doesNotMatch(curator, />\s*Задание\s*</u);
    assert.equal(curator.match(/Отозвать сдачу/gu)?.length, 1);
    assert.ok(curator.indexOf('Отозвать сдачу') < curator.indexOf('Описание этапа (его читает клиент)'), 'сдача — не первой');
    assert.match(page, /mayUpload && !\(curatorView && curatorLine\.idle\)\s*\? 'Материалов по этапу пока нет — приложите первый\.'/u);
  });

  it('у сданного этапа приостановленной или закрытой работы пометка «Этап сдан …» не пропадает', () => {
    assert.match(page, /const handedLine = `\$\{turnLabel\(state, 'expert', stage\.project\.expertId !== null, stage\.handedOverAt\)\}\.`;/u);
    assert.match(page, /\{curatorWork === null \? curatorLine\.text : handedLine\}/u);
  });
});

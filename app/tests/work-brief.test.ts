/**
 * Сравнение «было — станет» для карточки работы (решение Р-557).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseBrief } from '../src/lib/cabinet/brief/parse.ts';
import { readBrief } from '../src/lib/cabinet/brief/read.ts';
import { variantFields, workBriefRows } from '../src/lib/cabinet/brief/work-rows.ts';
import { SAMPLES, makeDocx } from './helpers/make-docx.ts';

const empty = { topic: null, summary: null, university: null, speciality: null };

describe('сравнение для карточки работы (Р-557)', () => {
  it('тема и суть — заменить; вуз и направление — дополнить пустое', () => {
    const brief = parseBrief(readBrief(makeDocx(SAMPLES.thesis)).lines);
    const rows = workBriefRows({ ...empty, topic: 'Старая тема' }, brief.fields);
    const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));
    assert.equal(byKey.topic?.mode, 'replace');
    assert.equal(byKey.topic?.before, 'Старая тема');
    assert.match(byKey.summary?.after ?? '', /^Цель: Оценить эффективность/u);
    assert.equal(byKey.university?.mode, 'fill');
    assert.equal(byKey.university?.after, 'Технологический университет, Инженерных систем, Теплотехники');
  });

  it('заполненное у клиента не трогается; совпадающее — «уже так»', () => {
    const brief = parseBrief(readBrief(makeDocx(SAMPLES.thesis)).lines);
    const rows = workBriefRows(
      { topic: '«Оценка эффективности утилизации теплоты отходящих газов»', summary: null, university: 'Другой вуз', speciality: null },
      brief.fields,
    );
    const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));
    assert.equal(byKey.topic?.mode, 'same');
    assert.equal(byKey.university?.mode, 'keep');
  });

  it('варианты: поля выбранного варианта поверх шапки', () => {
    const brief = parseBrief(
      readBrief(makeDocx(['Вариант 1. Тема один', 'Цель работы: Цель один.', 'Вариант 2. Тема два', 'Цель работы: Цель два.', 'Университет: Вуз'])).lines,
    );
    assert.equal(variantFields(brief, 1).topic, 'Тема два');
    assert.equal(variantFields(brief, 1).university, 'Вуз');
    assert.equal(variantFields(brief, 0).goal, 'Цель один.');
    const rows = workBriefRows(empty, variantFields(brief, 1));
    assert.equal(rows.find((row) => row.key === 'topic')?.after, 'Тема два');
  });
});

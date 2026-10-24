/**
 * «Сегодня»: одна карточка на работу (решение Р-738, уточняет Р-304).
 * Сведение — в `attentionParts`, откуда берут и плашки, и число дел
 * (Р-342); на базе — `attention-one-card.db.test.ts`. Здесь — что карточки
 * называют обе беды и что прецедент «план работ не заведён» сохранён.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');
const attention = readFileSync(path.join(SRC, 'lib', 'cabinet', 'attention.ts'), 'utf8');
const page = readFileSync(path.join(SRC, 'app', 'cabinet', 'manage', 'page.tsx'), 'utf8');

describe('одна карточка на работу (Р-738)', () => {
  const parts = attention.slice(attention.indexOf('export function attentionParts'), attention.indexOf('export function attentionCount'));

  it('«нет плана» и «нет куратора» работы со сроком — не отдельными карточками', () => {
    assert.match(parts, /late: late\.map\(\(work\) => \(\{ \.\.\.work, noExpert: unassigned\.has\(work\.code\) \}\)\)/u);
    assert.match(parts, /noPlan: today\.noPlan\s*\.filter\(\(row\) => !lateCodes\.has\(row\.code\)\)/u);
    assert.match(parts, /noExpert: today\.noExpert\.filter\(\(row\) => !lateCodes\.has\(row\.code\) && !planless\.has\(row\.code\)\)/u);
  });

  it('карточка срока называет и план, и куратора', () => {
    const late = page.slice(page.indexOf('...parts.late.map('), page.indexOf('...parts.stalled.map('));
    assert.match(late, /work\._count\.stages === 0 \? 'план работ не заведён' : null,/u);
    assert.match(late, /work\.noExpert \? 'нет куратора' : null,/u);
  });

  it('без плана и без куратора — «нет плана этапов и куратора»', () => {
    const noPlan = page.slice(page.indexOf('...parts.noPlan.map('), page.indexOf('...parts.noExpert.map('));
    assert.match(noPlan, /mark: row\.noExpert \? 'нет плана этапов и куратора' : 'нет плана этапов',/u);
    assert.match(noPlan, /todo: row\.noExpert \? 'Завести план и назначить куратора' : 'Завести план — по шаблону или вручную',/u);
  });

  it('число дел и свёртка — по карточкам', () => {
    assert.match(attention, /return Object\.values\(attentionParts\(sources\)\)\.reduce\(\(acc, part\) => acc \+ part\.length, 0\);/u);
    assert.match(page, /const showAll = \(await searchParams\)\.attention === 'all' \|\| attention\.length <= 12;/u);
  });
});

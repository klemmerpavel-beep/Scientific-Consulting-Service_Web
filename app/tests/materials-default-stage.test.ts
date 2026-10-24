/**
 * «Приложить материал» в «Материалах работы» по умолчанию — с этапом,
 * ждущим клиента (решение Р-745). Прежде поле «Этап» открывалось на
 * «без привязки к этапу», и файл, приложенный без смены выбора, вставал
 * «вне этапов»: на экране этапа, ждущего данных, его не было. Теперь по
 * умолчанию — первый открытый этап «Ждём ваших данных», иначе текущий
 * незавершённый; «без привязки» — вариантом выбора (Р-284); в выборе по-
 * прежнему только открытые этапы (Р-293); отказ формы возвращает выбранное
 * (Р-722).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const page = readFileSync(
  path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'projects', '[code]', 'materials', 'page.tsx'),
  'utf8',
);

describe('этап по умолчанию в «Приложить материал» (Р-745)', () => {
  it('клиенту — первый открытый «Ждём ваших данных», иначе текущий незавершённый; куратору и практике — без привязки (Р-326)', () => {
    assert.match(page, /const currentStage = project\.stages\.find\(\(stage\) => stage\.state !== 'DONE'\) \?\? null;/u);
    assert.match(
      page,
      /const defaultStage =\s*actor\.role !== 'CLIENT'\s*\? null\s*: \(openStages\.find\(\(stage\) => stage\.state === 'AWAITING_CLIENT'\) \?\?\s*\(currentStage !== null && openStages\.includes\(currentStage\) \? currentStage : null\)\);/u,
    );
  });

  it('поле «Этап» открывается на нём; отказ формы возвращает выбранное', () => {
    assert.match(
      page,
      /<Select label="Этап" name="stageId" defaultValue=\{draft\.upload === 'new' \? \(draft\.stageId \?\? ''\) : \(defaultStage\?\.id \?\? ''\)\}>/u,
    );
  });

  it('«без привязки к этапу» остаётся вариантом; в выборе — только открытые этапы', () => {
    const form = page.slice(page.indexOf('<Select label="Этап" name="stageId"'), page.indexOf('</Select>'));
    assert.match(form, /<option value="">без привязки к этапу<\/option>/u);
    assert.match(form, /\{openStages\.map\(\(stage\) => \(/u);
  });
});

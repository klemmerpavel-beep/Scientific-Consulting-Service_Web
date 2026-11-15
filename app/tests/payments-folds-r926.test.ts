/**
 * Экран оплат: на виду — состояние и главное действие строки, формы — в
 * свёртках (решение Р-926).
 *
 * Аудит 15.11.2026, находка В-2: при трёх траншах экран был 3435 px, на
 * нём одновременно стояло больше десяти открытых форм, хотя правило §12
 * `CABINET.md` — одна форма на виду, остальное в свёртках.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const page = readFileSync(
  path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'projects', '[code]', 'payments', 'page.tsx'),
  'utf8',
);

/** Свёртка, в которой стоит форма действия. */
function foldOf(action: string, nth = 0): string {
  const forms = [...page.matchAll(new RegExp(`<Form\\s+action=\\{${action}\\}`, 'gu'))];
  const at = forms[nth]?.index ?? -1;
  assert.ok(at >= 0, action);
  const before = page.slice(0, at);
  const open = before.lastIndexOf('<Disclosure');
  assert.ok(open > before.lastIndexOf('</Disclosure>'), `${action}: форма стоит вне свёртки`);
  return page.slice(open, at);
}

describe('формы экрана оплат — в свёртках (Р-926)', () => {
  it('новый транш', () => {
    assert.match(foldOf('addContractTranche'), /<Disclosure title="Добавить транш" open=\{formsOpen\}/u);
  });

  it('документ к платежу — своя свёртка у каждой строки', () => {
    assert.match(foldOf('uploadFinanceDocument', 0), /title=\{`Приложить документ к платежу: \$\{tranche\.title\}`\} open=\{formsOpen\}/u);
  });

  it('документ к договору', () => {
    assert.match(foldOf('uploadFinanceDocument', 1), /<Disclosure title="Приложить документ к договору" open=\{formsOpen\}/u);
  });

  it('начисление вознаграждения', () => {
    assert.match(foldOf('accruePayout'), /<Disclosure title="Начислить вознаграждение" open=\{formsOpen\}/u);
  });

  it('после отказа без своей формы свёртки раскрыты: причина вверху, форма не спрятана', () => {
    assert.match(page, /const formsOpen = flags\.error !== undefined && failure\?\.slot === undefined;/u);
  });

  it('главное действие строки — смена состояния транша — остаётся на виду', () => {
    const at = page.indexOf('<Form key={next} action={changeTrancheStatus} inline>');
    assert.ok(at >= 0);
    const before = page.slice(0, at);
    assert.ok(before.lastIndexOf('<Disclosure') < before.lastIndexOf('</Disclosure>') || before.lastIndexOf('<Disclosure') < 0, 'смена состояния спрятана в свёртку');
  });
});

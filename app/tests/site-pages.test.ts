/**
 * Публичные страницы после аудита 04.10.2026: оглавление правовых
 * документов без сдвига вёрстки (Р-282) и цель Метрики «Заявка
 * отправлена» (Р-283). Проверка по исходникам: макет — источник правды,
 * перенесённый код — то, что уходит в сеть.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');

describe('оглавление правовых документов свёрнуто стилями с первой отрисовки (Р-282)', () => {
  for (const page of ['OfferPage', 'PrivacyPage', 'ConsentPage']) {
    it(`${page}: состояние в разметке, а не в сценарии после загрузки`, () => {
      for (const source of [read('design', `${page}.dc.html`), read('app', 'src', 'components', 'pages', `${page}.tsx`)]) {
        // Узкий экран: список скрыт стилем, пока оглавление не раскрыто.
        assert.match(source, /@media \(max-width:768px\)\{[^}]*\}*[^@]*\.doc-toc\[data-toc="closed"\] \.doc-toc-list\{display:none\}/u);
        // Сценарий не сворачивает оглавление после загрузки.
        assert.doesNotMatch(source, /matchMedia\('\(max-width:768px\)'\)/u);
        // Атрибут hidden со списка снят: его ставил сценарий, отсюда и сдвиг.
        assert.doesNotMatch(source, /id="toc-list"[^>]*hidden=/u);
      }
      const design = read('design', `${page}.dc.html`);
      assert.match(design, /state = \{ toc: false \};/u);
      assert.match(design, /<nav class="doc-toc" data-toc="\{\{ tocState \}\}"/u);
      assert.match(design, /tocState: this\.state\.toc \? 'open' : 'closed',/u);
      assert.match(read('app', 'src', 'components', 'pages', `${page}.tsx`), /data-toc=\{tocState\}/u);
    });
  }
});

describe('цель Метрики «Заявка отправлена» (Р-283)', () => {
  const metrika = read('app', 'src', 'components', 'Metrika.tsx');

  it('цель — по событию успешной отправки и только при согласии', () => {
    assert.match(metrika, /export const LEAD_GOAL = 'lead';/u);
    assert.match(metrika, /import \{ LEAD_SENT_EVENT \} from '\.\/LeadThanks';/u);
    assert.match(metrika, /if \(!METRIKA_ID \|\| cabinet \|\| choice !== 'yes'\) return;/u);
    assert.match(metrika, /ym\(Number\(METRIKA_ID\), 'reachGoal', LEAD_GOAL\)/u);
    assert.match(metrika, /window\.removeEventListener\(LEAD_SENT_EVENT, onSent\)/u);
  });

  it('в цель не уходит ничего из формы', () => {
    const call = /ym\(Number\(METRIKA_ID\), 'reachGoal', LEAD_GOAL([^)]*)\)/u.exec(metrika);
    assert.ok(call);
    assert.equal(call[1], '');
  });
});

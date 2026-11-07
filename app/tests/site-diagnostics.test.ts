/**
 * Сайт (Р-809, замечание владельца З-1 от 05.11.2026): раздел «Диагностика»
 * на «Аспирантам» — инфографика небольшого объёма вместо перечня с абзацами
 * и четырёх свойств. Карта «где работа останавливается → что делает разбор»
 * короткими метками, «Итог разбора» — три результата и шкала плана: от
 * 769 px по горизонтали, до 768 px вертикально (Р-796). Одна кнопка — к
 * прежней форме `#request` (Р-791, Р-96); тёмной панели и градиентов нет
 * (Р-51, Р-608). Проверка по макету — источнику правды — и по перенесённому
 * компоненту, который уходит в сеть.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { findForbidden } from '../src/lib/cabinet/text-guard.ts';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const MAIN = read('design', 'MainPage.dc.html');
const TSX = read('app', 'src', 'components', 'pages', 'PostgradPage.tsx');
const NB = / /gu;

/** Раздел «Диагностика»: от `<section` перед меткой до его `</section>`. */
function diagnostics(html: string, mark: string): string {
  const at = html.indexOf(mark);
  assert.ok(at > 0, 'нет раздела «Диагностика»');
  const start = html.lastIndexOf('<section', at);
  return html.slice(start, html.indexOf('</section>', at));
}
const SECTION = diagnostics(MAIN, '>Диагностика</span>');
/** Видимый текст шаблона раздела: без комментариев, тегов и выражений {{ }}. */
const templateText = SECTION.replace(/<!--[\s\S]*?-->/gu, '').replace(/<[^>]+>/gu, ' ').replace(/\{\{[^}]*\}\}/gu, ' ').replace(NB, ' ').replace(/\s+/gu, ' ').trim();
/** Строки массива данных логики `const name = [ … ].map` — кортежами строк. */
function rows(name: string): string[][] {
  const at = MAIN.indexOf(`const ${name} = [`);
  assert.ok(at > 0, `нет данных ${name}`);
  const body = MAIN.slice(at, MAIN.indexOf('].map', at));
  return [...body.matchAll(/^\s*\[('[^\n]*')\],?$/gmu)].map((m) => [...m[1]!.matchAll(/'([^']*)'/gu)].map((s) => s[1]!.replace(NB, ' ')));
}

describe('Р-809: «Диагностика» на «Аспирантам» — инфографика', () => {
  const stalls = rows('stalls');
  const outcomes = rows('outcomes');

  it('карта: шесть точек остановки, у каждой — что делает разбор, короткими метками без абзацев', () => {
    assert.equal(stalls.length, 6, 'точек остановки не шесть');
    for (const [title, fix, extra] of stalls) {
      assert.equal(extra, undefined, `у точки «${title}» больше двух полей — абзац вернулся`);
      assert.ok(title && title.length <= 46, `точка остановки длиннее метки: «${title}»`);
      assert.ok(fix && fix.length <= 40, `«что делает разбор» длиннее метки: «${fix}»`);
      assert.doesNotMatch(`${title} ${fix}`, /[.!?]$|[.!?] /u, `в метке предложение или восклицание: «${title} → ${fix}»`);
    }
    const volume = stalls.flat().join('').length;
    assert.ok(volume <= 380, `карта — ${volume} знаков, метки разрослись (было 690 у перечня с абзацами)`);
    assert.match(SECTION, /\{\{ p\.title \}\}[\s\S]*\{\{ p\.fix \}\}/u, 'строка карты без ячейки разбора');
    assert.doesNotMatch(SECTION, /\{\{ p\.text \}\}/u, 'в строке карты снова абзац');
    for (const label of ['Где работа обычно останавливается', 'Что делает разбор']) {
      assert.ok(templateText.includes(label), `нет метки «${label}»`);
    }
  });

  it('«Итог разбора» — три результата со значками из набора вместо четырёх свойств', () => {
    assert.equal(outcomes.length, 3, 'результатов разбора не три');
    for (const [icon, title, text] of outcomes) {
      assert.ok(existsSync(path.join(ROOT, 'design', 'assets', 'icons', `${icon}.svg`)), `нет значка ${icon}`);
      assert.ok(title && text && text.length <= 40, `результат «${title}» — не короткая метка`);
    }
    assert.ok(templateText.includes('Итог разбора'));
    for (const old of ['const gains = [', 'pd-gains', 'pd-solve', 'pd-problem', '{{ g.']) {
      assert.ok(!MAIN.includes(old), `осталось прежнее «${old}»`);
    }
  });

  it('одна кнопка — к прежней форме #request, полей и второй ссылки нет', () => {
    const links = SECTION.match(/<a\b[^>]*>/gu) ?? [];
    assert.equal(links.length, 1, `в разделе ${links.length} ссылок`);
    assert.match(links[0]!, /href="#request"/u);
    assert.ok(templateText.includes('Разобрать, где остановилась ваша работа'));
    assert.doesNotMatch(SECTION, /<(?:form|input|select|textarea)\b/u, 'в разделе появилась форма');
  });

  it('без тёмной панели и градиентов', () => {
    assert.doesNotMatch(SECTION, /--pd-accent-deep|gradient/u);
  });

  it('шкала плана: от 769 px по горизонтали (scaleX), до 768 px вертикально (scaleY)', () => {
    for (const [where, source] of [['макет', MAIN], ['компонент', TSX]] as const) {
      assert.ok(source.includes('@media (min-width:769px){.pd-plan-steps{display:grid!important;grid-template-columns:repeat(6,minmax(0,1fr));gap:0!important}.pd-plan-v{display:none!important}.pd-plan-h{display:block!important}'), `${where}: нет горизонтальной шкалы от 769 px`);
    }
    assert.equal((SECTION.match(/class="pd-plan-h"/gu) ?? []).length, 2, 'у горизонтальной шкалы нет линии связи и пройденной части');
    assert.equal((SECTION.match(/class="pd-plan-v"/gu) ?? []).length, 2, 'у вертикальной шкалы нет линии связи и пройденной части');
    assert.match(SECTION, /transform:\{\{ planLineX \}\}/u);
    assert.match(MAIN, /const planLineX = 'scaleX\(' \+ \(trackAt \/ \(trackTitles\.length - 1\)\) \+ '\)';/u);
    assert.match(SECTION, /<button type="button" class="pd-plan-step" aria-pressed="\{\{ t\.selected \}\}"/u, 'этап шкалы — не кнопка с aria-pressed');
  });

  it('объём раздела — около половины прежнего', () => {
    const data = [...stalls, ...outcomes.map(([, title, text]) => [title!, text!])].flat().join(' ');
    const volume = `${templateText} ${data}`.length;
    assert.ok(volume <= 820, `видимый текст раздела в макете — ${volume} знаков (было 1432)`);
  });

  it('тексты без запрещённых слов и антитез; перенос в компонент сохранил метки', () => {
    const all = [templateText, ...stalls.flat(), ...outcomes.map(([, t, x]) => `${t} ${x}`)].join('\n');
    assert.deepEqual(findForbidden(all, 'Диагностика'), []);
    assert.doesNotMatch(all, /не [а-яё]+, а |под ключ|гаранти|!/iu);
    const tsx = TSX.replace(NB, ' ');
    for (const [title, fix] of stalls) {
      assert.ok(tsx.includes(`'${title}', '${fix}'`), `в компоненте нет строки «${title} → ${fix}»`);
    }
  });
});

describe('Р-826: доработка «Диагностики» по замечанию владельца 06.11.2026', () => {
  it('пара «точка остановки → что делает разбор» — одной строкой-карточкой, ячейка разбора без своей рамки', () => {
    const li = SECTION.match(/<li class="([^"]+)">\s*<span[^>]*>\{\{ p\.num \}\}/u);
    assert.ok(li, 'нет строки карты с номером');
    assert.equal(li[1], 'pd-diag-row pd-diag-pair', 'строка карты — не карточка пары');
    assert.match(SECTION, /<span class="pd-diag-fix">\s*<span aria-hidden="true"[^>]*mask:\{\{ linkMask \}\}[^>]*><\/span>\s*<span[^>]*>\{\{ p\.fix \}\}<\/span>/u, 'ячейка разбора без стрелки-акцента');
    assert.doesNotMatch(SECTION, /min-height:38px;background:var\(--pd-ink-inverse\);border:1px solid var\(--pd-border\);border-radius:10px;padding:8px 12px/u, 'вернулась отдельная белая ячейка разбора');
  });

  it('переход к заявке — последней строкой карты на всю ширину, без пустого места справа', () => {
    const cta = SECTION.match(/<a class="pd-lift pd-diag-cta" href="#request"([^>]*)>/u);
    assert.ok(cta, 'нет строки-ссылки pd-diag-cta');
    assert.doesNotMatch(cta[1]!, /align-self:flex-start|max-width/u, 'ссылка снова по ширине надписи');
    assert.ok(SECTION.indexOf('pd-diag-cta') > SECTION.indexOf('</ol>'), 'ссылка не после перечня');
  });

  it('стили в макете и в компоненте: строка-карточка, линия ячейки разбора, ссылка-строка, телефон', () => {
    for (const [where, source] of [['макет', MAIN], ['компонент', TSX]] as const) {
      for (const rule of [
        '.pd-diag-pair,.pd-diag-cta{box-sizing:border-box;min-height:44px;padding:8px 14px;background:var(--pd-ink-inverse);border:1px solid var(--pd-border);border-radius:10px}',
        '.pd-diag-fix{align-self:stretch;display:flex;align-items:center;gap:10px;min-width:0;padding-left:14px;border-left:1px solid var(--pd-divider)}',
        '.pd-diag-cta{display:grid;grid-template-columns:28px minmax(0,1fr) 18px;column-gap:14px;align-items:center;',
        '.pd-diag-fix{padding-left:0;border-left:0}',
        '@media (max-width:480px){.pd-diag-map{padding:14px 12px 16px!important}',
      ]) assert.ok(source.includes(rule), `${where}: нет правила «${rule.slice(0, 48)}…»`);
    }
  });
});

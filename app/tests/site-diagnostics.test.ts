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

  it('карта: четыре главные точки остановки (Р-836), у каждой — что делает разбор, короткими метками без абзацев', () => {
    assert.equal(stalls.length, 4, 'точек остановки не четыре');
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
    for (const label of ['Где работа обычно останавливается', 'Итог разбора']) {
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

  it('шкалы плана «Как это выглядит у вас» нет (Р-836)', () => {
    for (const [where, source] of [['макет', MAIN], ['компонент', TSX]] as const) {
      const code = source.replace(/<!--[\s\S]*?-->|\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//gu, '');
      assert.doesNotMatch(code, /pd-plan-|trackAt|planLine|Как это выглядит у вас/u, `${where}: осталась шкала плана`);
    }
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

describe('Р-836: «Диагностика» — инфографика «где работа останавливается → итог разбора»', () => {
  // Владелец 07.11.2026: «уменьшить по высоте на 30 %, только важное +
  // инфографику добавить». Одна карточка с двумя панелями и стрелкой-узлом.
  it('карточка-инфографика: слева точки остановки со стрелкой-узлом, справа «Итог разбора»', () => {
    const left = SECTION.slice(SECTION.indexOf('<div class="pd-flow-in"'), SECTION.indexOf('<div class="pd-flow-out"'));
    const right = SECTION.slice(SECTION.indexOf('<div class="pd-flow-out"'), SECTION.indexOf('<!-- Р-791'));
    assert.ok(left.length > 0 && right.length > 0, 'нет двух панелей инфографики');
    assert.match(left, /Где работа обычно останавливается[\s\S]*\{\{ p\.title \}\}[\s\S]*\{\{ p\.fix \}\}[\s\S]*class="pd-flow-arrow" aria-hidden="true"/u);
    assert.match(right, /Итог разбора[\s\S]*\{\{ o\.title \}\}[\s\S]*\{\{ o\.text \}\}/u);
    assert.doesNotMatch(SECTION, /pd-diag-(?:map|row|pair|fix|head|out|res)\b/u, 'осталась прежняя карта строк-пар');
  });

  it('переход к заявке — строкой под карточкой, на всю ширину', () => {
    const cta = SECTION.indexOf('<a class="pd-lift pd-diag-cta" href="#request">');
    assert.ok(cta > SECTION.indexOf('<div class="pd-flow-out"'), 'ссылка не под инфографикой');
  });

  it('стили в макете и в компоненте: две панели от 769 px, столбец до 768 px, стрелка на границе', () => {
    for (const [where, source] of [['макет', MAIN], ['компонент', TSX]] as const) {
      for (const rule of [
        '.pd-flow{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(0,1fr)}',
        '.pd-flow-arrow{top:50%;right:-22px;transform:translateY(-50%)}',
        '@media (max-width:768px){.pd-flow{grid-template-columns:minmax(0,1fr)}',
        'transform:translateX(-50%) rotate(90deg)',
        '.pd-diag-cta{box-sizing:border-box;min-height:44px;padding:8px 14px;background:var(--pd-ink-inverse);border:1px solid var(--pd-border);border-radius:10px}',
      ]) assert.ok(source.includes(rule), `${where}: нет правила «${rule.slice(0, 48)}…»`);
    }
  });
});

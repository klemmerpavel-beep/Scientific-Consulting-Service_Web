/**
 * «Экспертам»: две кнопки «Заполнить анкету» в разделах (решение Р-981, задача
 * С-7, указание владельца 22.11.2026; вариант В-1 разбора 20.11.2026) — под
 * полосой «Автором работы всегда остаётся клиент…» в «Кураторах» и под
 * карточками «Трёх шагов», слева, в исполнении кнопки раздела Р-960 (как
 * «География»): 15/600, поля 14 × 32, стрелка 15 px. Ведут к анкете #anketa,
 * как прочие «Заполнить анкету». Меняет принятый эталон Р-839. Проверка — по
 * макету и компоненту.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { bind } from './helpers/short-words.ts';

/** Свойства встроенного стиля: `style="a:b;…"` макета или `style={{ a: "b", … }}` компонента (как в site-cta-look-r960). */
function styleOf(tag: string): Map<string, string> {
  const props = new Map<string, string>();
  const css = tag.match(/\sstyle="([^"]*)"/u);
  if (css) {
    for (const part of css[1]!.split(';')) {
      const i = part.indexOf(':');
      if (i > 0) props.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
    }
    return props;
  }
  const jsx = tag.match(/\sstyle=\{\{([^}]*)\}\}/u);
  if (jsx) {
    for (const m of jsx[1]!.matchAll(/(\w+):\s*(?:"([^"]*)"|([^,]+))/gu)) {
      props.set(m[1]!.replace(/[A-Z]/gu, (c) => `-${c.toLowerCase()}`), (m[2] ?? m[3]!).trim());
    }
  }
  return props;
}

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');

/** Раздел по началу открывающего тега — до его конца. */
const section = (source: string, head: RegExp) => {
  const at = source.search(head);
  assert.ok(at > 0, `нет раздела ${head}`);
  return source.slice(at, source.indexOf('</section>', at));
};
/** Кнопка «Заполнить анкету» последним элементом раздела после метки: открывающий тег. */
const tailButton = (part: string, after: string) => {
  const at = part.lastIndexOf(after);
  assert.ok(at > 0, `нет «${after}»`);
  const m = part.slice(at + after.length).match(/^\s*(?:<!--[^]*?-->\s*|\{\/\*[^]*?\*\/\}\s*)?(<a (?:className="[^"]*" )?href="#anketa" style=(?:"[^"]*"|\{\{[^}]*\}\})[^>]*>)Заполнить анкету<span aria-hidden="true" style=(?:"[^"]*width:15px;height:15px;[^"]*mask[^"]*"|\{\{ width: "15px", height: "15px",[^}]*[mM]ask[^}]*\}\})><\/span><\/a>\s*$/u);
  assert.ok(m, `после «${after}» нет кнопки «Заполнить анкету» со стрелкой последним элементом раздела`);
  return m[1]!;
};

describe('«Экспертам»: две кнопки «Заполнить анкету» в разделах (Р-981)', () => {
  for (const [where, source, strip, steps] of [
    ['макет', read('design', 'ExpertsPage.dc.html'), bind('Писать работу за клиента куратор не берётся.</span></p>'), '</li>\n</ol>'],
    ['компонент', read('app', 'src', 'components', 'pages', 'ExpertsPage.tsx'), bind('Писать работу за клиента куратор не берётся.</span></p>'), '</li></ol>'],
  ] as const) {
    it(`${where}: под полосой «Автором работы всегда остаётся клиент…» в «Кураторах» и под «Тремя шагами»`, () => {
      const who = section(source, /<section (?:className="[^"]*" )?id="who"/u);
      const join = section(source, /<section class(?:Name)?="[^"]*" aria-labelledby="ex-steps-title"/u);
      for (const tag of [tailButton(who, strip), tailButton(join, steps)]) {
        const s = styleOf(tag);
        assert.equal(s.get('background'), 'var(--pd-ink)', 'кнопка не тёмная');
        assert.equal(s.get('font-size'), '15px');
        assert.equal(s.get('font-weight'), '600');
        assert.equal(s.get('padding'), '14px 32px');
        assert.equal(s.get('gap'), '12px');
        assert.equal(s.get('align-self'), 'flex-start', 'кнопка не слева');
        assert.ok(!s.has('min-height'), 'у кнопки раздела min-height');
      }
    });
  }

  it('все кнопки страницы к анкете подписаны «Заполнить анкету» и ведут на #anketa', () => {
    const html = read('design', 'ExpertsPage.dc.html');
    const links = [...html.matchAll(/<a [^>]*href="#anketa"[^>]*>([^<]*)</gu)].map((m) => m[1]);
    assert.equal(links.length, 6, 'кнопок к анкете не шесть: шапка, первый экран, «Кураторы», тёмная панель, «Три шага», «География»');
    assert.ok(links.every((l) => l === 'Заполнить анкету'));
  });
});

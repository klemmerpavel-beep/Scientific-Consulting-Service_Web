/**
 * Кнопка действия — одно исполнение на всех страницах (решение Р-960, ответ
 * владельца 20.11.2026).
 *
 * - Текст 15 px / 600 у всех тёмных кнопок действия (на «Экспертам» было 14).
 * - Кнопка раздела, ведущая к форме заявки или анкете, — исполнение принятой
 *   кнопки «Географии» (Р-882): поля `14px 32px` (47 px), стрелка 15 px справа
 *   через 12 px; на тёмной панели — белая того же размера.
 * - Кнопка отправки формы (первый экран, заявка, отзыв, анкета, «Добавить в
 *   список») — `min-height: 52px`, поля `0 34px`, без стрелки; «Дальше» анкеты —
 *   той же высоты и полей, со стрелкой направления.
 * - Шапка и закреплённая полоса не меняются (`data-pd-stick-cta` не
 *   проверяется). Композиция первого экрана не меняется: у кнопки-ссылки
 *   первого раздела `<main>` проверяется только кегль 15 / 600 (ответ
 *   владельца 20.11.2026: «кегль 15/600 везде, включая «Экспертам»»), форма
 *   кнопки — крупная, как была.
 * - Вторичная кнопка в паре с крупной — той же высоты 52 px: «Назад» рядом с
 *   «Дальше» в анкете «Экспертам».
 *
 * Проверка идёт и по макету, и по перенесённому компоненту.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');

/** Свойства встроенного стиля: `style="a:b;…"` макета или `style={{ a: "b", … }}` компонента. */
export function styleOf(tag: string): Map<string, string> {
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

type Kind = 'section' | 'submit' | 'step' | 'hero';
type Button = { kind: Kind; label: string; tag: string; body: string };

const TO_FORM = /\shref="(?:#request|#anketa|\.\/index\.html#request|\/#request|\/index\.html#request)"/u;

/** Тёмные кнопки действия страницы с видом каждой; шапка, полоса и первый экран (кроме отправки формы) — вне правила. */
export function buttons(source: string): Button[] {
  const main = source.search(/<main\b/u);
  const firstStart = source.indexOf('<section', main);
  const firstEnd = source.indexOf('</section>', firstStart);
  const out: Button[] = [];
  for (const m of source.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gu)) {
    const tag = `<${m[1]} ${m[2]}>`;
    const body = m[3]!;
    const label = body.replace(/<[^>]*>/gu, '').trim();
    const s = styleOf(tag);
    const dark = s.get('background') === 'var(--pd-ink)';
    const white = s.get('background') === 'var(--pd-ink-inverse)' && s.get('color') === 'var(--pd-ink)' && s.get('border-radius') === '999px';
    if (/data-pd-stick-cta/u.test(tag)) continue;
    if (m[1] === 'a' && TO_FORM.test(tag) && (dark || (white && /#anketa/u.test(tag)))) {
      const at = m.index!;
      // первый экран: композиция и форма кнопки прежние, кегль — общий
      out.push({ kind: at > firstStart && at < firstEnd ? 'hero' : 'section', label, tag, body });
    } else if (m[1] === 'button' && dark && /\stype="submit"/u.test(tag)) {
      out.push({ kind: 'submit', label, tag, body });
    } else if (m[1] === 'button' && dark && /onClick=(?:"\{\{ next \}\}"|\{next\})/u.test(tag)) {
      out.push({ kind: 'step', label, tag, body });
    }
  }
  return out;
}

/** Что не так с видом кнопки; пустой список — исполнение по Р-960. */
export function problems(b: Button): string[] {
  const s = styleOf(b.tag);
  const bad: string[] = [];
  const want = (key: string, value: string) => { if (s.get(key) !== value) bad.push(`${key}: ${s.get(key) ?? '—'} вместо ${value}`); };
  want('font-size', '15px');
  want('font-weight', '600');
  if (b.kind === 'hero') return bad;
  const arrow = /<span aria-hidden="true" style=(?:"[^"]*width:15px;height:15px;[^"]*mask|\{\{ width: "15px", height: "15px",[^}]*[mM]ask)/u.test(b.body);
  if (b.kind === 'section') {
    want('padding', '14px 32px');
    want('gap', '12px');
    if (s.has('min-height')) bad.push('min-height у кнопки раздела: высоту задают поля 14px 32px');
    if (!arrow) bad.push('нет стрелки 15 px справа');
  } else {
    want('padding', '0 34px');
    want('min-height', '52px');
    if (s.has('height')) bad.push(`height: ${s.get('height')} — у отправки только min-height 52px`);
    if (b.kind === 'submit' && /<span\b/u.test(b.body)) bad.push('у кнопки отправки стрелка');
  }
  return bad;
}

const PAGES = [
  ['StartPage', 'StartPage', { section: 1, submit: 2 }],
  ['MainPage', 'PostgradPage', { section: 4, submit: 3 }],
  ['StudentsPage', 'StudentsPage', { section: 4, submit: 3 }],
  ['BusinessPage', 'BusinessPage', { section: 4, submit: 3 }],
  ['ExpertsPage', 'ExpertsPage', { section: 4, submit: 1 }],
  ['ToolsPage', 'ToolsPage', { section: 1, submit: 1 }],
] as const;

describe('кнопка действия — одно исполнение (Р-960)', () => {
  for (const [design, component, least] of PAGES) {
    for (const [where, source] of [
      ['макет', read('design', `${design}.dc.html`)],
      ['компонент', read('app', 'src', 'components', 'pages', `${component}.tsx`)],
    ] as const) {
      it(`${design}, ${where}: кнопки разделов — как «География», отправка форм — 52 px без стрелки`, () => {
        const list = buttons(source);
        const count = (k: Kind) => list.filter((b) => b.kind === k).length;
        assert.ok(count('section') >= least.section, `кнопок разделов ${count('section')}, ждали не меньше ${least.section} — проверьте разбор`);
        assert.ok(count('submit') >= least.submit, `кнопок отправки ${count('submit')}, ждали не меньше ${least.submit}`);
        const wrong = list.map((b) => [b, problems(b)] as const).filter(([, p]) => p.length).map(([b, p]) => `«${b.label}» (${b.kind}): ${p.join('; ')}`);
        assert.deepEqual(wrong, []);
      });
    }
  }

  it('«Экспертам»: «Дальше» анкеты — высоты отправки, со стрелкой направления, «Назад» рядом — тоже 52 px; кнопка в тёмной панели — белая, со стрелкой; кнопка первого экрана — 15 px', () => {
    const html = read('design', 'ExpertsPage.dc.html');
    const back = html.match(/<button type="button" onClick="\{\{ back \}\}"[^>]*>/u)?.[0];
    assert.ok(back, 'нет кнопки «Назад»');
    assert.equal(styleOf(back).get('min-height'), '52px', '«Назад» в паре с крупной «Дальше» — не 52 px');
    const list = buttons(html);
    assert.equal(list.filter((b) => b.kind === 'hero').length, 1, 'кнопка первого экрана не найдена');
    assert.equal(list.filter((b) => b.kind === 'step').length, 1, 'нет «Дальше»');
    assert.match(list.find((b) => b.kind === 'step')!.body, /<span aria-hidden="true"/u, '«Дальше» без стрелки');
    const white = list.filter((b) => b.kind === 'section' && styleOf(b.tag).get('background') === 'var(--pd-ink-inverse)');
    assert.equal(white.length, 1, 'белой кнопки в тёмной панели нет');
  });

  it('проба: прежние исполнения ловятся', () => {
    const old = [
      '<main><section><a href="#request" style="background:var(--pd-ink);font-size:14px;font-weight:600;min-height:52px;padding:0 34px">первый экран</a></section>',
      '<section><a href="#request" style="display:inline-flex;align-items:center;min-height:44px;background:var(--pd-ink);font-size:15px;font-weight:600;padding:12px 32px">Оставить заявку</a>',
      '<button type="submit" style="height:52px;background:var(--pd-ink);font-size:14px;font-weight:600;padding:0 32px">Отправить заявку<span aria-hidden="true" style="width:15px;height:15px;-webkit-mask:x;mask:x"></span></button>',
      '<a href="#request" style={{ display: "inline-flex", gap: "12px", background: "var(--pd-ink)", fontSize: "15px", fontWeight: "600", padding: "14px 32px" }}>Оставить заявку<span aria-hidden="true" style={{ width: "15px", height: "15px", display: "block", WebkitMask: linkMask, mask: linkMask }}></span></a></section></main>',
    ].join('\n');
    const list = buttons(old);
    assert.deepEqual(list.map((b) => b.kind), ['hero', 'section', 'submit', 'section']);
    assert.deepEqual(problems(list[0]!), ['font-size: 14px вместо 15px'], 'кегль 14 px на первом экране не пойман или проверено лишнее');
    assert.ok(problems(list[1]!).length >= 3, 'кнопка 44 px без стрелки не поймана');
    assert.ok(problems(list[2]!).length >= 4, 'отправка 14 px со стрелкой не поймана');
    assert.deepEqual(problems(list[3]!), []);
  });
});

/**
 * «Шесть задач компании и что делаем в каждой» на «Компаниям» (Р-806).
 *
 * Перед пакетами: задача компании → что делает сервис → требования к
 * документу → где на странице подробнее (приём dissertatsia.ru, разбор
 * конкурентов 03.11.2026; формулировки свои). Охраняется:
 *
 * - состав: ровно шесть строк, каждая — ссылка целиком не ниже 44 px;
 *   цели — карточки пакетов этой страницы (#pack-N) и шкала УГТ (#trl);
 * - честность подписи: номер и название пакета в строке совпадают с
 *   карточкой пакета, а требование строки есть в «Документах на выходе»
 *   этого пакета — задача, которой нет в пакете, в перечень не попадает;
 *   требование строки шкалы УГТ — стандарт, по которому шкала построена;
 * - переход к пакету подсвечивает его рамку (как «Подходящее предложение»
 *   шкалы), у строки шкалы обработчика нет;
 * - текст: проходит text-guard; без написания, уникальности, гарантий, цен
 *   и обещаний решения фонда, налогового органа или Роспатента; значение
 *   коэффициента не повторяется — оно уже названо на шкале (Р-258);
 * - границы: формы нет, обработчики не submit*, сетевых вызовов и хранилищ
 *   нет (Р-96); к заявке — одна ссылка на прежнюю форму #request; подсветки
 *   в заголовке нет (Р-32: она у «Пяти пакетов»); место — между шкалой УГТ
 *   и пакетами.
 *
 * Логика живёт в макете и переносится в компонент дословно, поэтому
 * выполняется сам сценарий макета с заглушкой DCLogic.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { findForbidden } from '../src/lib/cabinet/text-guard.ts';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');
const plain = (s: string) => s.replace(/[ ⁠]|&nbsp;/gu, ' ').replace(/\s+/gu, ' ').trim();

const html = read('design/BusinessPage.dc.html');
const tsx = read('app/src/components/pages/BusinessPage.tsx');
const script = html.match(/<script[^>]*data-dc-script[^>]*>([\s\S]*?)<\/script>/u)![1]!;

class DCLogic {
  state: any = {};
  setState(u: any) {
    const patch = typeof u === 'function' ? u(this.state) : u;
    this.state = { ...this.state, ...patch };
  }
}
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const Component = new Function('DCLogic', `${script}\nreturn Component;`)(DCLogic);

type Row = Record<string, any>;
const fresh = () => {
  const c: any = new Component();
  const vals = c.renderVals();
  return { c, tasks: vals.tasks as Row[], packs: vals.packs as Row[] };
};

const section = (() => {
  const at = html.indexOf('<section id="tasks"');
  assert.ok(at > 0, 'на странице нет раздела #tasks');
  return html.slice(at, html.indexOf('</section>', at) + '</section>'.length);
})();
const staticIds = new Set([...html.matchAll(/\sid="([\w-]+)"/gu)].map((m) => m[1]!));
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

describe('«Шесть задач компании»: состав и цели строк (Р-806)', () => {
  it('шесть строк, у каждой задача, действие, требование и цель', () => {
    const { tasks } = fresh();
    assert.equal(tasks.length, 6, 'в перечне шесть задач: седьмая — отдельным решением');
    for (const t of tasks) {
      for (const key of ['say', 'does', 'norm', 'kind', 'to', 'href'] as const) {
        assert.ok(plain(String(t[key] ?? '')), `${plain(t.say)}: пусто поле ${key}`);
      }
    }
    assert.equal(new Set(tasks.map((t) => plain(t.say))).size, 6, 'две строки с одной задачей');
  });

  it('строка — ссылка целиком не ниже 44 px, в перечне role="list"', () => {
    assert.match(section, /<ul class="bp-tasklist" role="list">\s*<sc-for list="\{\{ tasks \}\}" as="t"/u);
    const links = [...section.matchAll(/<a class="bp-taskrow bp-task"[^>]*>/gu)].map((m) => m[0]);
    assert.equal(links.length, 1, 'одна разметка строки на все шесть задач');
    assert.match(links[0]!, /href="\{\{ t\.href \}\}" onClick="\{\{ t\.go \}\}"/u);
    assert.match(css, /\.bp-task\{[^}]*min-height:44px/u, 'у строки нет min-height: 44px');
  });

  it('цели — карточки пакетов этой страницы и шкала УГТ', () => {
    const { tasks, packs } = fresh();
    const anchors = new Set(packs.map((p) => p.anchor));
    assert.match(html, /<article id="\{\{ p\.anchor \}\}" class="bp-pack"/u, 'у карточки пакета нет якоря');
    for (const t of tasks) {
      assert.match(t.href, /^#[\w-]+$/u, `${plain(t.say)}: цель — якорь этой страницы`);
      const id = t.href.slice(1);
      assert.ok(anchors.has(id) || (id === 'trl' && staticIds.has('trl')), `${plain(t.say)}: на странице нет ${t.href}`);
    }
    assert.equal(tasks.filter((t) => t.href === '#trl').length, 1, 'к шкале УГТ ведёт одна строка');
    assert.ok(tasks.filter((t) => t.href !== '#trl').every((t) => t.pack), 'строка без пакета и не к шкале');
  });

  it('подпись цели совпадает с карточкой пакета, требование есть в его документах', () => {
    const { tasks, packs } = fresh();
    for (const t of tasks.filter((x) => x.pack)) {
      const p = packs.find((x) => x.anchor === t.pack)!;
      assert.ok(p, `${plain(t.say)}: нет пакета ${t.pack}`);
      assert.equal(t.href, `#${p.anchor}`, `${plain(t.say)}: ссылка ведёт не к своему пакету`);
      assert.equal(plain(t.kind), `Пакет ${p.num}`, `${plain(t.say)}: номер пакета не совпадает с карточкой`);
      assert.equal(plain(t.to), plain(p.title), `${plain(t.say)}: название пакета не совпадает с карточкой`);
      const norms = (p.docs as Row[]).map((d) => plain(d.norm)).filter(Boolean);
      assert.ok(norms.includes(plain(t.norm)), `${plain(t.say)}: требования «${plain(t.norm)}» нет в документах пакета ${p.num} (${norms.join('; ')})`);
    }
    const trl = tasks.find((t) => t.href === '#trl')!;
    assert.equal(plain(trl.norm), 'ГОСТ Р 58048-2017', 'шкала УГТ построена по ГОСТ Р 58048-2017');
    assert.match(script, /Девять уровней готовности технологии по ГОСТ Р 58048-2017/u);
  });

  it('переход к пакету подсвечивает его рамку, у строки шкалы обработчика нет', () => {
    for (const t of fresh().tasks) {
      if (!t.pack) {
        assert.equal(t.go, undefined, `${plain(t.say)}: лишний обработчик`);
        continue;
      }
      const { c, tasks } = fresh();
      tasks.find((x) => x.say === t.say)!.go();
      assert.equal(c.state.highlight, t.pack, `${plain(t.say)}: подсвечен не тот пакет`);
      const p = (c.renderVals().packs as Row[]).find((x) => x.anchor === t.pack)!;
      assert.equal(p.border, 'var(--pd-accent-mark)', `${plain(t.say)}: рамка пакета не подсвечена`);
    }
  });
});

describe('«Шесть задач компании»: текст и границы блока', () => {
  const visible = plain(section.replace(/<!--[\s\S]*?-->/gu, '').replace(/<[^>]+>/gu, '\n').replace(/\{\{[^}]*\}\}/gu, ' '));
  const data = () => fresh().tasks.map((t) => ['say', 'does', 'norm', 'kind', 'to'].map((k) => plain(t[k])).join('\n')).join('\n');

  it('тексты проходят text-guard и не обещают результата', () => {
    const all = `${visible}\n${data()}`;
    assert.deepEqual(findForbidden(all, 'Шесть задач компании'), []);
    assert.doesNotMatch(all, /гарант|под ключ|напиш|пишем|уникальн|антиплагиат|оригинальн|₽|руб\.|100\s?%|одобр|получите|успешн|обязательно|быстр|лучш/iu);
    assert.doesNotMatch(all, /решени\p{L}*\s+(?:фонда|налогов|Роспатент|совета)/iu, 'решение получателя не обещается');
    assert.doesNotMatch(all, /коэффициент\p{L}*\s*\d/iu, 'значение коэффициента уже названо на шкале УГТ (Р-258)');
  });

  it('формы нет, обработчики не submit*, на сервер и в хранилища ничего не уходит (Р-96)', () => {
    assert.doesNotMatch(section, /<form|<input|<button|<select|<textarea|type="submit"|name="/u, 'раздел не форма заявки');
    const handlers = [...section.matchAll(/on[A-Z]\w*="\{\{\s*([\w.]+)\s*\}\}"/gu)].map((m) => m[1]!);
    assert.deepEqual(handlers, ['t.go']);
    const at = script.indexOf('const TASKS = [');
    assert.ok(at > 0, 'нет данных TASKS');
    const logic = script.slice(at, script.indexOf('})(),', at));
    assert.doesNotMatch(logic, /submit|\bfetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|document\.|window\./u);
  });

  it('к заявке — одна ссылка на прежнюю форму #request', () => {
    assert.equal(section.match(/href="#request"/gu)?.length, 1);
    assert.ok(fresh().tasks.every((t) => t.href !== '#request'), 'строка перечня ведёт к заявке');
    assert.match(html, /<section id="request"/u, 'на странице нет формы #request');
  });

  it('заголовок без подсветки: она у «Пяти пакетов» (Р-32)', () => {
    const h2 = section.slice(section.indexOf('<h2'), section.indexOf('</h2>'));
    assert.match(h2, /id="bp-tasks-title"/u);
    assert.doesNotMatch(h2, /--pd-accent-mark/u);
    assert.match(section, /aria-labelledby="bp-tasks-title"/u);
  });

  it('стоит между шкалой УГТ и пакетами', () => {
    const trl = html.indexOf('<section id="trl"');
    const here = html.indexOf('<section id="tasks"');
    const packs = html.indexOf('<section id="packs"');
    assert.ok(trl > 0 && trl < here && here < packs, 'порядок «шкала УГТ → задачи → пакеты» нарушен');
    assert.equal(html.slice(html.indexOf('</section>', trl), here).match(/<section/gu), null, 'между шкалой и #tasks другой раздел');
    assert.equal(html.slice(here + section.length, packs).match(/<section/gu), null, 'между #tasks и пакетами другой раздел');
  });

  it('перенесено в компонент', () => {
    assert.match(tsx, /id="tasks" aria-labelledby="bp-tasks-title"/u);
    assert.match(tsx, /<a className="bp-taskrow bp-task" href=\{t\.href\} onClick=\{t\.go\}/u);
    assert.match(tsx, /const TASKS = \[/u);
  });
});

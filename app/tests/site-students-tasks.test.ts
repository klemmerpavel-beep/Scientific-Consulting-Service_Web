/**
 * «Шесть случаев и первый шаг в каждом» на «Студентам» (Р-805).
 *
 * Раздел «Разбор ситуации» сразу за первым экраном: случай словами студента
 * → что делает сервис → куда ведёт карточка (приём dissertatsia.ru, разбор
 * конкурентов 03.11.2026; формулировки свои). Охраняется:
 *
 * - состав: ровно шесть карточек, каждая — ссылка целиком (pd-lift, цель
 *   не меньше 44 px); у каждой своя цель, к форме заявки ведёт ровно одна —
 *   шесть переходов к заявке в одном перечне отклонены как повтор (Р-258);
 * - цели: якорь существует на странице, /tools — страница оформителя
 *   (Р-793), карточка этапов включает ситуацию маршрута, которая есть
 *   в situationData (иначе ссылка привела бы к чужому маршруту);
 * - текст: действие — глаголом разбора или проверки (Р-771), без написания,
 *   уникальности, антиплагиата, гарантий и цен; проходит text-guard;
 * - границы: формы нет, обработчики не submit* (перенос обернул бы их
 *   в отправку заявки), сетевых вызовов и хранилищ нет (Р-96); место — между
 *   первым экраном и «Кто сопровождает».
 *
 * Логика живёт в макете и переносится в компонент дословно, поэтому
 * выполняется сам сценарий макета с заглушкой DCLogic.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { findForbidden } from '../src/lib/cabinet/text-guard.ts';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');
const plain = (s: string) => s.replace(/[\u00a0\u2060]|&nbsp;/gu, ' ');

const html = read('design/StudentsPage.dc.html');
const tsx = read('app/src/components/pages/StudentsPage.tsx');
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

const fresh = () => {
  const c: any = new Component();
  return { c, tasks: c.renderVals().tasks as Array<Record<string, any>> };
};

const section = (() => {
  const at = html.indexOf('<section id="tasks"');
  assert.ok(at > 0, 'на странице нет раздела #tasks');
  return html.slice(at, html.indexOf('</section>', at) + '</section>'.length);
})();
/** Разметка карточек: одна ветка sc-if на каждый вид цели. */
const cards = [...section.matchAll(/<a class="pd-lift pd-task"[^>]*>/gu)].map((m) => m[0]);
const ids = new Set([...html.matchAll(/\sid="([\w-]+)"/gu)].map((m) => m[1]!));
const situations = (() => {
  const at = script.indexOf('const situationData = [');
  return [...script.slice(at, script.indexOf('const sIdx', at)).matchAll(/^ {6}\['([^']+)', '[^']+',$/gmu)].map((m) => m[1]!);
})();

describe('«Шесть случаев»: состав и цели карточек (Р-805)', () => {
  it('шесть карточек, у каждой случай, действие и подпись перехода', () => {
    const { tasks } = fresh();
    assert.equal(tasks.length, 6, 'в разделе шесть карточек: седьмой случай — отдельным решением');
    for (const t of tasks) {
      for (const key of ['say', 'does', 'to'] as const) assert.ok(plain(String(t[key] ?? '')).trim(), `${t.say}: пусто поле ${key}`);
      assert.ok(Boolean(t.here) !== Boolean(t.tool), `${plain(t.say)}: карточка должна попасть ровно в одну ветку разметки`);
    }
  });

  it('карточка — ссылка целиком с подъёмом и целью не меньше 44 px', () => {
    assert.ok(cards.length >= 2, 'нет разметки карточек-ссылок');
    for (const a of cards) {
      assert.match(a, /min-height:44px/u);
      assert.match(a, /href="/u);
    }
    assert.match(section, /<ul class="pd-tasks" role="list">\s*<sc-for list="\{\{ tasks \}\}" as="t"/u);
  });

  it('у каждой карточки своя цель; якорь есть на странице, /tools — страница оформителя', () => {
    const { tasks } = fresh();
    for (const t of tasks) {
      if (t.tool) continue;
      assert.match(t.href, /^#[\w-]+$/u, `${plain(t.say)}: цель — якорь этой страницы`);
      assert.ok(ids.has(t.href.slice(1)), `${plain(t.say)}: на странице нет id="${t.href.slice(1)}"`);
    }
    assert.ok(cards.some((a) => a.includes('href="./tools.html"')), 'карточка оформителя ведёт не на /tools');
    assert.ok(existsSync(path.join(ROOT, 'app/src/app/tools/page.tsx')), 'нет страницы /tools');
    const targets = tasks.map((t) => (t.tool ? '/tools' : `${t.href}|${t.route}`));
    assert.equal(new Set(targets).size, tasks.length, 'две карточки ведут в одно место');
  });

  it('к форме заявки ведёт ровно одна карточка (Р-258), сама форма — прежняя #request', () => {
    const { tasks } = fresh();
    assert.equal(tasks.filter((t) => t.href === '#request').length, 1);
    assert.match(html, /<section id="request"/u, 'на странице нет формы #request');
  });

  it('карточка этапов включает свою ситуацию маршрута', () => {
    const { tasks } = fresh();
    const routed = tasks.filter((t) => t.route);
    assert.ok(routed.length > 0);
    for (const t of routed) {
      assert.equal(t.href, '#route', `${plain(t.say)}: ситуация маршрута — только у ссылки на #route`);
      const at = situations.indexOf(t.route);
      assert.ok(at >= 0, `${plain(t.say)}: в situationData нет ситуации «${t.route}»`);
      assert.equal(typeof t.go, 'function', `${plain(t.say)}: переход не переключает маршрут`);
      const { c, tasks: again } = fresh();
      c.setState({ situation: (at + 1) % situations.length, step: 3 });
      again.find((x) => x.say === t.say)!.go();
      assert.equal(c.state.situation, at, `${plain(t.say)}: включена не та ситуация`);
      assert.equal(c.state.step, 0, `${plain(t.say)}: маршрут открывается не с первого этапа`);
    }
    for (const t of tasks.filter((x) => !x.route)) assert.equal(t.go, undefined, `${plain(t.say)}: лишний обработчик`);
  });
});

describe('«Шесть случаев»: текст и границы блока', () => {
  it('действие — глаголом разбора или проверки (Р-771)', () => {
    const { tasks } = fresh();
    for (const t of tasks) {
      assert.match(plain(t.does), /(?<!\p{L})(?:Разбираем|Проверяем|Сверяем|Определяем|сверяем|проверяем|разбираем)(?!\p{L})/u, `${plain(t.say)}: «${plain(t.does)}»`);
    }
  });

  it('тексты проходят text-guard и не обещают результата', () => {
    const { tasks } = fresh();
    const visible = plain(section.replace(/<!--[\s\S]*?-->/gu, '').replace(/<[^>]+>/gu, '\n'));
    const data = tasks.map((t) => `${plain(t.say)}\n${plain(t.does)}\n${plain(t.to)}`).join('\n');
    const all = `${visible}\n${data}`;
    assert.deepEqual(findForbidden(all, 'Шесть случаев'), []);
    assert.doesNotMatch(all, /гарант|под ключ|напиш|пишем|уникальн|антиплагиат|оригинальн|курсов|₽|руб\.|100\s?%/iu);
  });

  it('формы нет, обработчики не submit*, на сервер и в хранилища ничего не уходит (Р-96)', () => {
    assert.doesNotMatch(section, /<form|<input|<button|type="submit"|name="/u, 'раздел не форма заявки');
    const handlers = [...section.matchAll(/on[A-Z]\w*="\{\{\s*([\w.]+)\s*\}\}"/gu)].map((m) => m[1]!);
    assert.deepEqual(handlers, ['t.go']);
    const logic = script.slice(script.indexOf('const TASKS = ['), script.indexOf('})(),', script.indexOf('const TASKS = [')));
    assert.doesNotMatch(logic, /submit|\bfetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB/u);
  });

  it('стоит между первым экраном и «Кто сопровождает»', () => {
    const works = html.indexOf('<section id="works"');
    const here = html.indexOf('<section id="tasks"');
    assert.ok(works > 0 && works < here, '#tasks не за первым экраном');
    assert.equal(html.slice(html.indexOf('</section>', works), here).match(/<section/gu), null, 'между первым экраном и #tasks другой раздел');
    const next = html.slice(here + section.length);
    const team = next.indexOf('<section');
    assert.match(plain(next.slice(team, next.indexOf('</h2>', team))), /Кто сопровождает работу$/u, 'за #tasks не «Кто сопровождает»');
  });

  it('перенесено в компонент', () => {
    assert.match(tsx, /id="tasks" aria-labelledby="sp-tasks-title"/u);
    assert.match(tsx, /<a className="pd-lift pd-task" href=\{t\.href\} onClick=\{t\.go\}/u);
    assert.match(tsx, /<a className="pd-lift pd-task" href="\/tools"/u);
    assert.match(tsx, /const TASKS = \[/u);
  });
});

/**
 * «Шесть случаев и первый шаг в каждом» на «Студентам» (Р-805; место
 * и облик — Р-812).
 *
 * Самопроверка перед «Вопросами» и заявкой: случай словами студента
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
 *   в отправку заявки), сетевых вызовов и хранилищ нет (Р-96);
 * - место (Р-812, решение по умолчанию): после «Как это выглядит внутри»,
 *   перед «Вопросами»;
 * - облик (Р-812): текст раздела прежний дословно; карточки на светлой
 *   подложке без тихой полосы, у каждого случая свой значок на плашке
 *   44 px (файл в обеих папках ассетов), объёмных изображений нет (Р-633);
 *   зоны — подсеткой, сетка 3 → 2 → 1 колонки; номер стандарта с годом
 *   не переносится по дефису.
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

  it('стоит после «Как это выглядит внутри», перед «Географией» и «Вопросами» (Р-812, Р-853)', () => {
    const inside = html.indexOf('<section id="inside"');
    const here = html.indexOf('<section id="tasks"');
    assert.ok(inside > 0 && inside < here, '#tasks не после «Как это выглядит внутри»');
    assert.equal(html.slice(html.indexOf('</section>', inside), here).match(/<section/gu), null, 'между #inside и #tasks другой раздел');
    // Р-853: раздел «Что закреплено в договоре» (Р-844) снят; за «Шестью
    // случаями» — «География» (Р-849), за ней — «Вопросы».
    const next = html.slice(here + section.length);
    assert.match(next, /^\s*(?:<!--[\s\S]*?-->\s*)?<section id="geo"/u, 'за #tasks не «География»');
    assert.match(html.slice(html.indexOf('</section>', html.indexOf('<section id="geo"')) + 10), /^\s*(?:<!--[\s\S]*?-->\s*)?<section id="faq"/u, 'за «Географией» не «Вопросы»');
    const works = html.indexOf('<section id="works"');
    const team = html.indexOf('<section', html.indexOf('</section>', works));
    assert.match(plain(html.slice(team, html.indexOf('</h2>', team))), /Кто сопровождает работу$/u, 'за первым экраном снова «Кто сопровождает», как до Р-805');
    const order = ['id="inside"', 'id="tasks"', 'id="faq"'].map((id) => tsx.indexOf(id));
    assert.ok(order[0] > 0 && order[0] < order[1] && order[1] < order[2], 'в компоненте порядок разделов не перенесён');
  });

  it('перенесено в компонент', () => {
    assert.match(tsx, /id="tasks" aria-labelledby="sp-tasks-title"/u);
    assert.match(tsx, /<a className="pd-lift pd-task" href=\{t\.href\} onClick=\{t\.go\}/u);
    assert.match(tsx, /<a className="pd-lift pd-task" href="\/tools"/u);
    assert.match(tsx, /const TASKS = \[/u);
    assert.match(tsx, /className="pd-tasks-tray"/u);
    assert.match(tsx, /\(t\.doesParts \?\? \[\]\)\.map\(\(d: any, _i1: number\) => \(<React\.Fragment key=\{_i1\}><span style=\{\{ whiteSpace: d\.ws \}\}>\{d\.text\}<\/span>/u);
  });
});

/** Тексты раздела, принятые Р-805: облик (Р-812) их не меняет ни на символ. */
const TEXTS = [
  ['Руководитель не согласовал план ВКР', 'Проверяем план и логику глав: как цель и задачи раскрываются в главах и выводах.', 'Состав работ'],
  ['Руководитель вернул работу с замечаниями', 'Разбираем замечания по пунктам и проверяем ваши правки по каждому из них.', 'Этапы доработки'],
  ['Нужно оформить список литературы по ГОСТ', 'Оформитель составляет записи по ГОСТ Р 7.0.100-2018 в браузере. Список целиком сверяем с методичкой кафедры.', 'Оформитель списка'],
  ['Работу вернули с нормоконтроля', 'Проверяем оформление по ГОСТ 7.32 и методичке кафедры: поля, нумерацию, таблицы и ссылки.', 'Нормоконтроль'],
  ['До защиты осталось меньше месяца', 'Определяем, какие этапы укладываются в ваш срок. Календарный план до сдачи фиксируем в Задании.', 'Этапы на короткий срок'],
  ['Нужно подготовить доклад и презентацию к защите', 'Разбираем ваш доклад и презентацию под регламент защиты и репетируем вопросы комиссии.', 'Обсудить доклад'],
];
/** Правило стилей макета по селектору (первое вхождение вне медиазапроса или внутри заданного). */
const rule = (css: string, sel: string) => {
  const at = css.indexOf(`${sel}{`);
  assert.ok(at >= 0, `нет правила ${sel}`);
  return css.slice(at + sel.length + 1, css.indexOf('}', at));
};
const styles = html.slice(html.indexOf('<style'), html.indexOf('</style>'));

describe('«Шесть случаев»: облик без смены текста (Р-812)', () => {
  it('текст карточек и шапки — прежний, в прежнем порядке', () => {
    const { tasks } = fresh();
    assert.deepEqual(tasks.map((t) => [plain(t.say), plain(t.does), plain(t.to)]), TEXTS);
    const head = plain(section.slice(0, section.indexOf('<div class="pd-tasks-tray"')).replace(/<[^>]+>/gu, '\n')).split('\n').map((x) => x.trim()).filter(Boolean);
    assert.deepEqual(head, ['С чего начать', 'Шесть случаев и первый шаг в каждом', 'Карточка ведёт к разделу, оформителю или заявке']);
    for (const t of tasks) assert.equal(t.doesParts.map((d: any) => d.text).join(''), t.does, `${plain(t.say)}: части действия не складываются в прежний текст`);
  });

  it('номер стандарта с годом — неразрывной частью, остальное переносится как прежде', () => {
    const { tasks } = fresh();
    const parts = tasks.flatMap((t) => t.doesParts as Array<{ text: string; ws: string }>);
    assert.deepEqual(parts.filter((d) => d.ws === 'nowrap').map((d) => d.text), ['7.0.100-2018']);
    for (const d of parts) assert.ok(d.ws === 'nowrap' || d.ws === 'normal', `неизвестное значение white-space: ${d.ws}`);
    assert.match(section, /<sc-for list="\{\{ t\.doesParts \}\}" as="d"[^>]*><span style="white-space:\{\{ d\.ws \}\}">\{\{ d\.text \}\}<\/span><\/sc-for>/u);
  });

  it('у каждого случая свой значок на плашке 44 px, файл — в обеих папках ассетов', () => {
    const { c, tasks } = fresh();
    const files = tasks.map((t) => {
      const m = String(t.icon).match(/^url\('\.\/assets\/icons\/([\w-]+)\.svg'\) center\/contain no-repeat$/u);
      assert.ok(m, `${plain(t.say)}: значок не по образцу mask()`);
      assert.equal(t.icon, c.mask(m[1]));
      for (const dir of ['design/assets/icons', 'app/public/assets/icons']) assert.ok(existsSync(path.join(ROOT, dir, `${m[1]}.svg`)), `${dir}/${m[1]}.svg нет`);
      return m[1];
    });
    assert.equal(new Set(files).size, 6, 'значки повторяются');
    const tiles = [...section.matchAll(/<span aria-hidden="true" class="pd-task-icon" style="([^"]+)"><span style="([^"]+)"><\/span><\/span>/gu)];
    assert.equal(tiles.length, 2, 'плашка значка — в обеих ветках разметки');
    for (const [, tile, glyph] of tiles) {
      assert.match(tile!, /width:44px;height:44px/u);
      assert.match(tile!, /border-radius:10px;background:var\(--pd-accent-tint\)/u);
      assert.match(glyph!, /width:22px;height:22px/u);
      assert.match(glyph!, /background:var\(--pd-accent\);-webkit-mask:\{\{ t\.icon \}\};mask:\{\{ t\.icon \}\}/u);
    }
  });

  it('тихой полосы нет, объёмных изображений нет (Р-633), подложка — светлая', () => {
    assert.doesNotMatch(section, /--pd-surface-quiet|--pd-accent-deep/u, 'в разделе тихая полоса или тёмная панель');
    assert.doesNotMatch(section, /<img|image-slot|assets\/art\//u, 'объёмные изображения на «Студентам» — только в блоке ролей');
    assert.match(section, /<div class="pd-tasks-tray" style="background:var\(--pd-accent-tint\);border-radius:14px">\s*<ul class="pd-tasks" role="list">/u);
    for (const a of cards) {
      assert.match(a, /background:var\(--pd-ink-inverse\);border:1px solid var\(--pd-border\);border-radius:14px/u);
      assert.doesNotMatch(a, /overflow:hidden/u);
    }
  });

  it('зоны — подсеткой, случай рядом со значком, сетка 3 → 2 → 1', () => {
    assert.match(rule(styles, '.pd-tasks>li'), /grid-row:span 3;grid-template-rows:subgrid/u);
    assert.match(rule(styles, '.pd-task'), /grid-row:span 3;grid-template-rows:subgrid/u);
    assert.match(rule(styles, '.pd-task-head'), /grid-template-columns:44px minmax\(0,1fr\);column-gap:12px;align-items:center/u);
    assert.match(rule(styles, '.pd-tasks'), /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/u);
    assert.match(styles, /@media \(max-width:1199px\)\{\.pd-tasks\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}\}/u);
    assert.match(styles, /@media \(max-width:768px\)\{\.pd-tasks\{grid-template-columns:minmax\(0,1fr\);gap:12px\}\}/u);
    const zones = [...section.matchAll(/<span class="pd-task-(head|does|to)"/gu)].map((m) => m[1]);
    assert.deepEqual(zones, ['head', 'does', 'to', 'head', 'does', 'to'], 'три зоны карточки в обеих ветках');
  });
});

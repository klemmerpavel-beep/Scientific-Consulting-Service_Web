/**
 * «Инструменты»: заголовки разделов в шкале содержательных страниц и видимый
 * отклик после «Добавить в список» (Р-994, указание владельца 22.11.2026,
 * С-9.1; разбор 20.11.2026, И-1 и И-2).
 *
 * - h2 разделов «Что учитывает оформитель», «Как выглядят записи разных
 *   видов», «Список — часть оформления работы» — `clamp(26px, 2.4vw, 34px)`
 *   / 1.24 (Р-607); заголовки панелей оформителя — прежние 22 px; над третьим
 *   разделом — метка «Сопровождение».
 * - После успешного добавления под кнопкой — строка 14 px
 *   `--pd-ink-secondary` «Запись добавлена. В списке N записей» и ссылка
 *   «К списку» (до 900 px). Голосом строку не объявляет: живая область
 *   `countText` у списка прежняя. Удаление записи и очистка списка строку
 *   убирают.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');

/** Стиль h2 макета по id. */
export function h2Style(html: string, id: string): string {
  const m = new RegExp(`<h2 id="${id}" style="([^"]*)"`, 'u').exec(html);
  assert.ok(m, `нет h2#${id}`);
  return m[1];
}

/** Класс логики макета с заглушкой DCLogic — как в `tools-bibliography`. */
function component(html: string): any {
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
  return new Component();
}

describe('«Инструменты»: шкала заголовков и отклик после добавления (Р-994)', () => {
  const html = read('design', 'ToolsPage.dc.html');
  const tsx = read('app', 'src', 'components', 'pages', 'ToolsPage.tsx');

  it('h2 трёх разделов — шкала содержательных страниц, панели оформителя — 22 px', () => {
    for (const id of ['tl-rules', 'tl-samples', 'tl-more']) {
      assert.match(h2Style(html, id), /font-size:clamp\(26px,2\.4vw,34px\);line-height:1\.24;font-weight:500;letter-spacing:-\.012em;/u, `h2#${id} не в шкале Р-607`);
    }
    for (const id of ['tl-new', 'tl-list']) assert.match(h2Style(html, id), /font-size:22px;line-height:1\.4;/u, `h2#${id} — панель, 22 px`);
    assert.equal((tsx.match(/fontSize: "clamp\(26px,2\.4vw,34px\)"/gu) ?? []).length >= 3, true, 'шкала не перенесена в компонент');
  });

  it('над «Список — часть оформления работы» — метка «Сопровождение»', () => {
    const at = html.indexOf('<h2 id="tl-more"');
    assert.match(html.slice(at - 400, at), /text-transform:uppercase;color:var\(--pd-ink-muted\)">Сопровождение<\/span>\n$/u);
  });

  it('строка отклика под кнопкой: 14 px --pd-ink-secondary, без живой области, ссылка «К списку» до 900 px', () => {
    const form = html.slice(html.indexOf('<form onSubmit="{{ addEntry }}"'), html.indexOf('</form>'));
    const at = form.indexOf('<sc-if value="{{ added }}"');
    assert.ok(at > form.indexOf('Добавить в список'), 'строки отклика нет под кнопкой');
    const line = form.slice(at, form.indexOf('</sc-if>', at));
    assert.match(line, /<p class="tl-added" style="[^"]*font-size:14px;line-height:1\.5;color:var\(--pd-ink-secondary\)">/u);
    assert.doesNotMatch(line, /role=|aria-live/u, 'строку не объявляют голосом: живая область уже у списка');
    assert.match(line, /<a class="tl-tolist" href="#tl-list" style="[^"]*min-height:44px/u);
    assert.ok(html.includes('@media (min-width:901px){.tl-tolist{display:none!important}}'), 'нет правила ссылки до 900 px');
    assert.ok(tsx.includes('@media (min-width:901px){.tl-tolist{display:none!important}}'), 'правило не перенесено');
    assert.match(html, /<p aria-live="polite"[^>]*>\{\{ countText \}\}<\/p>/u, 'живая область списка пропала');
  });

  it('логика: строка видна после добавления, считает записи, уходит при удалении и очистке', () => {
    const c = component(html);
    c.state = { kind: 0, items: [], sort: true, typeTag: true, copied: false, copyFail: false, added: false };
    assert.equal(c.renderVals().added, false);
    const item = (id: string) => ({ id, kind: 0, data: { authors: 'Иванов И. И.', title: `Название ${id}`, year: '2024' } });
    c.state = { ...c.state, items: [item('1'), item('2')], added: true };
    let v = c.renderVals();
    assert.equal(v.added, true);
    assert.equal(v.addedText, 'Запись добавлена. В списке 2 записи');
    v.list[0].remove();
    assert.equal(c.renderVals().added, false, 'после удаления строка осталась');
    c.state = { ...c.state, added: true };
    c.renderVals().clearList();
    assert.equal(c.renderVals().added, false, 'после очистки строка осталась');
    assert.match(html, /kind: k, data \}\], copied: false, copyFail: false, added: true \}\)\);\n\s*form\.reset\(\);/u, 'добавление не включает строку');
  });

  it('проба: прежний h2 22 px не проходит', () => {
    assert.doesNotMatch(h2Style('<h2 id="tl-rules" style="margin:0;font-size:22px;line-height:1.4;">', 'tl-rules'), /clamp\(26px/u);
  });
});

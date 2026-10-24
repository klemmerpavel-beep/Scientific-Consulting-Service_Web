/**
 * Ссылка «назад» называет экран, к которому ведёт (решение Р-703): к
 * «Деньгам» — «Деньги», к «Управлению» — «Управление» (Р-340), к
 * перечню анкет — «Анкеты кандидатов». Прежде к одному экрану вели
 * «Деньги» и «к расчётам», «Управление», «к управлению» и «к служебным
 * разделам». Пример суммы в подсказке «Итогов по годам» набран
 * неразрывными пробелами и не рвётся переносом между разрядами.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { TOOLS_HREF } from '../src/lib/cabinet/nav.ts';

const MANAGE = path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'manage');

const pages = readdirSync(MANAGE, { recursive: true })
  .map(String)
  .filter((name) => name.endsWith('page.tsx'))
  .map((name) => ({ name, body: readFileSync(path.join(MANAGE, name), 'utf8') }));

/** Пары «куда ведёт — как подписано» у шапок экранов. */
function backLinks(body: string): { href: string; label: string }[] {
  const constants = new Map<string, string>([['TOOLS_HREF', TOOLS_HREF]]);
  for (const match of body.matchAll(/const ([A-Z_]+) = '([^']+)';/gu)) constants.set(match[1]!, match[2]!);
  const links: { href: string; label: string }[] = [];
  for (const head of body.matchAll(/<ScreenHead\b([\s\S]*?)\/>/gu)) {
    const props = head[1]!;
    const href = /backHref=(?:"([^"]+)"|\{([A-Z_]+)\})/u.exec(props);
    const label = /backLabel="([^"]+)"/u.exec(props);
    if (href === null || label === null) continue;
    links.push({ href: href[1] ?? constants.get(href[2]!) ?? href[2]!, label: label[1]! });
  }
  return links;
}

const EXPECTED: Record<string, string> = {
  '/cabinet/manage/finance': 'Деньги',
  '/cabinet/manage/tools': 'Управление',
  '/cabinet/manage/experts': 'Анкеты кандидатов',
};

describe('ссылка «назад» — название экрана-цели (Р-703)', () => {
  it('к «Деньгам», «Управлению» и анкетам — одной подписью', () => {
    const seen: Record<string, number> = {};
    for (const page of pages) {
      for (const link of backLinks(page.body)) {
        const expected = EXPECTED[link.href];
        if (expected === undefined) continue;
        seen[link.href] = (seen[link.href] ?? 0) + 1;
        assert.equal(link.label, expected, `${page.name}: ссылка на ${link.href} подписана «${link.label}»`);
      }
    }
    // Проверка не проходит впустую: экраны денег, управления и анкеты найдены.
    assert.ok((seen['/cabinet/manage/finance'] ?? 0) >= 5);
    assert.ok((seen['/cabinet/manage/tools'] ?? 0) >= 7);
    assert.ok((seen['/cabinet/manage/experts'] ?? 0) >= 1);
  });

  it('прежних подписей «к расчётам» и «к служебным разделам» нет', () => {
    for (const page of pages) {
      assert.ok(!page.body.includes('к расчётам'), `${page.name}: «к расчётам»`);
      assert.ok(!page.body.includes('к служебным разделам'), `${page.name}: «к служебным разделам»`);
    }
  });

  it('пример суммы в подсказке «Итогов по годам» не рвётся между разрядами', () => {
    const years = pages.find((page) => page.name === path.join('finance', 'years', 'page.tsx'))!;
    const example = /«1\s250\s000,50»/u.exec(years.body)?.[0];
    assert.ok(example !== undefined, 'пример суммы в подсказке не найден');
    assert.doesNotMatch(example, /\d \d/u);
  });
});

/**
 * Возврат есть у каждого вложенного экрана и ведёт к его родителю
 * (решение Р-895).
 *
 * Аудит 15.11.2026 (находки Н-3, Н-4): у «Журнала», «Справочников»,
 * «Очереди отправки» и «Учётных записей» ссылки «назад» не было — у
 * соседних служебных экранов она вела на «Управление»; у карточки работы
 * возврата к перечню не было вовсе.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const CABINET = path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet');

/** Исходник без комментариев: проверяется разметка, а не пояснения. */
function code(...parts: string[]): string {
  return readFileSync(path.join(CABINET, ...parts), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/gu, '')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
}

describe('служебные экраны возвращают к «Управлению» (Р-895)', () => {
  for (const screen of ['audit', 'directory', 'outbox', 'users']) {
    it(`manage/${screen}`, () => {
      assert.match(
        code('manage', screen, 'page.tsx'),
        /<ScreenHead\s+backHref="\/cabinet\/manage\/tools"\s+backLabel="Управление"/u,
      );
    });
  }
});

describe('карточка работы возвращает к перечню работ (Р-895)', () => {
  const card = code('projects', '[code]', 'page.tsx');

  it('ссылка стоит перед названием работы и подписана пунктом меню роли', () => {
    assert.match(
      card,
      /<a\s+className="cab-mark"\s+href=\{worksHref\}[\s\S]{0,140}?>\s*\{menuLabel\(actor, '\/cabinet\/projects'\) \?\? 'Работы'\}\s*<\/a>\s*<Heading level=\{1\} size=\{2\}>\s*\{project\.title\}/u,
    );
  });

  it('клиенту — перечень целиком: без отбора единственная работа вела бы обратно (Р-311)', () => {
    assert.match(card, /const worksHref = forClient \? '\/cabinet\/projects\?state=all' : '\/cabinet\/projects';/u);
  });
});

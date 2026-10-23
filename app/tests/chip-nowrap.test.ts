/**
 * Пилюли и кнопки не переносят надпись на две строки (решение Р-681).
 *
 * Р-577 признал перенос подписи метки дефектом — пилюля становится овалом —
 * и закрепил `nowrap` для «Рекламы» (`ads-layout.test.ts`). Счётчик свёртки
 * блока, частота раздела «Управления», состояние отзыва и заявки на удаление
 * его не получили; кнопка «Отправить ещё раз» стояла в ячейке без запрета
 * переноса. Проверка — по исходникам, как `ads-layout.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');
const read = (...parts: string[]) => readFileSync(path.join(SRC, ...parts), 'utf8');
const SCREENS = ['app', 'cabinet', 'manage'];

describe('метки-пилюли в одну строку', () => {
  it('счётчик свёрнутого блока FoldCard', () => {
    const ui = read('components', 'cabinet', 'ui.tsx');
    const start = ui.indexOf('export function FoldCard(');
    const body = ui.slice(start, ui.indexOf('\nexport function ', start + 1));
    assert.match(body, /<Chip nowrap>\{count\}<\/Chip>/u);
  });

  it('частота раздела на «Управлении»', () => {
    assert.match(read(...SCREENS, 'tools', 'page.tsx'), /<Chip nowrap>\{tool\.often\}<\/Chip>/u);
  });

  it('состояние отзыва', () => {
    assert.match(read(...SCREENS, 'feedback', 'page.tsx'), /<Chip nowrap>\{STATUS_LABEL\[row\.status\]\}<\/Chip>/u);
  });

  it('состояние заявки на удаление', () => {
    assert.match(read(...SCREENS, 'erasure', 'page.tsx'), /<Chip nowrap>ожидает исполнения<\/Chip>/u);
  });
});

describe('кнопка повторной отправки в одну строку', () => {
  it('«Отправить ещё раз» не переносится', () => {
    assert.match(
      read(...SCREENS, 'outbox', 'page.tsx'),
      /<Button tone="quiet" style=\{\{ whiteSpace: 'nowrap' \}\}>Отправить ещё раз<\/Button>/u,
    );
  });
});

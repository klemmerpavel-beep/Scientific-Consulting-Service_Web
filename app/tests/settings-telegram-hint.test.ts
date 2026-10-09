/**
 * «Куда слать уведомления» (решения Р-485, Р-540): пояснение у
 * выключенного флажка Telegram говорит правду — подключить Telegram можно
 * только когда канал настроен на стороне сервиса — и связано с флажком
 * для читалки.
 *
 * Проверка ходит по исходнику, как `cabinet-markup.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const root = path.join(import.meta.dirname, '..', 'src');
const page = readFileSync(path.join(root, 'app', 'cabinet', 'settings', 'page.tsx'), 'utf8');
const ui = readFileSync(path.join(root, 'components', 'cabinet', 'ui.tsx'), 'utf8');

describe('пояснение у флажка Telegram (Р-540)', () => {
  it('без настройки на стороне сервиса не велит подключать Telegram', () => {
    const hint = page.slice(page.indexOf('id="notify-telegram-hint"'));
    assert.ok(hint.length > 0, 'пояснение не найдено');
    assert.match(hint.slice(0, 400), /mayBind\s*\?\s*'Сначала подключите Telegram в карточке «Telegram».'\s*:\s*'Telegram не настроен на стороне сервиса.'/u);
  });

  it('пояснение связано с флажком через aria-describedby', () => {
    assert.match(page, /describedBy=\{bound \? undefined : 'notify-telegram-hint'\}/u);
    assert.match(ui, /aria-describedby=\{describedBy\}/u);
  });
});

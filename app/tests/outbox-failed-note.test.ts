/**
 * Подпись недоставленного на экране очереди и в деле «Очередь уведомлений»
 * на «Сводке» (решение Р-665). Плитка «Не доставлено» считает все строки
 * в отказе: отключённый получателем канал закрывает строку без попытки,
 * отсутствие адреса и окончательный отказ сервера (Р-246, Р-252) — после
 * одной. Подпись «после пяти попыток» спорила с колонкой «Попыток» той же
 * таблицы, где у таких строк 0 или 1.
 *
 * Модуль экрана с JSX тестом не загружается, поэтому проверка — по тексту
 * экрана, как в `paused-stage-client.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const MANAGE = path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'manage');
const outbox = readFileSync(path.join(MANAGE, 'outbox', 'page.tsx'), 'utf8');
const summary = readFileSync(path.join(MANAGE, 'page.tsx'), 'utf8');

/** Исходник без комментариев: правило касается текстов, а не пояснений к ним. */
function code(text: string): string {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/gu, '')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
}

describe('недоставленное не подписано числом попыток (Р-665)', () => {
  it('плитка «Не доставлено» считает все отказы, а не только исчерпавшие попытки', () => {
    const start = outbox.indexOf('label="Не доставлено"');
    assert.ok(start > 0, 'плитки «Не доставлено» нет');
    const tile = outbox.slice(start, outbox.indexOf('/>', start));
    // Счёт — все строки FAILED, в том числе отказ получателя без попытки.
    assert.match(tile, /value=\{String\(digest\.failed\)\}/u);
    assert.doesNotMatch(tile, /пяти попыток/u);
    assert.match(tile, /'после всех попыток или отказа получателя'/u);
    assert.match(
      tile,
      /`после всех попыток или отказа получателя; ещё \$\{digest\.expiredLastDay\} за сутки устарели в очереди и не отправлялись`/u,
    );
  });

  it('на экране очереди нет «после пяти попыток»', () => {
    assert.doesNotMatch(code(outbox), /пяти попыток/u);
  });

  it('дело на «Сводке» говорит о недоставленном каналом, без числа попыток', () => {
    // Дело — по отказам доставки, а окончательный отказ сервера (Р-252)
    // закрывает строку после первой попытки.
    assert.doesNotMatch(code(summary), /пяти попыток/u);
    assert.match(summary, /detail: 'Письма и сообщения, которые канал не доставил'/u);
  });
});

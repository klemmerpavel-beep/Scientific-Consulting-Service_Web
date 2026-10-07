/**
 * Ежеминутный прогон не пересчитывает сводку руководителя и письмо месяца,
 * когда они за день (месяц) уже поставлены (решение Р-475): проверка ключа
 * по уникальному индексу стоит до сбора дел и рекомендаций.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const source = readFileSync(path.join(import.meta.dirname, '../src/lib/cabinet/head-digest.ts'), 'utf8');

function body(name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} не найдена`);
  return source.slice(start, source.indexOf('\n}\n', start));
}

describe('сводка руководителя не пересчитывается после постановки', () => {
  it('сводка дня: ключ проверяется до сбора дел', () => {
    const text = body('enqueueHeadDigest');
    const check = text.indexOf('alreadyQueued(`head-digest:');
    assert.ok(check >= 0 && check < text.indexOf('attentionSources('), 'дела собираются до проверки ключа');
  });

  it('письмо месяца: ключ проверяется до расчёта рекомендаций', () => {
    const text = body('enqueueHeadMonthly');
    const check = text.indexOf('alreadyQueued(`head-monthly:');
    assert.ok(check >= 0 && check < text.indexOf('recommendationsFor('), 'рекомендации считаются до проверки ключа');
  });

  it('проверка — точными ключами каналов, по уникальному индексу', () => {
    assert.match(source, /dedupKey: \{ in: keys \}/u);
    assert.doesNotMatch(body('enqueueHeadDigest'), /startsWith/u);
  });
});

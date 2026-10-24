/**
 * Срок у дела на плашке «Моих работ» (решение Р-650): этап
 * на согласовании ждёт клиента к сроку согласования, а не к сроку этапа
 * (требование Т-15, решение Р-290) — как ответ в шапке и блок «Требует
 * внимания». Прежде шапка писала «Срок согласования — до 27 октября», а
 * плашка той же работы — «Согласовать этап: … — до 10 октября».
 *
 * Модуль экрана с JSX тестом не загружается, поэтому проверка — по тексту
 * экрана, как в `moscow-day.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const page = readFileSync(
  path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'projects', 'page.tsx'),
  'utf8',
);

/** Исходник без комментариев: правило касается кода, а не пояснений к нему. */
function code(text: string): string {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/gu, '')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
}

describe('срок дела на плашке работы (Р-650)', () => {
  // Строка плашки — от призыва к действию до конца её абзаца.
  const source = code(page);
  const start = source.indexOf('{waitingLine(waiting)}');
  const line = source.slice(start, source.indexOf('</Text>', start));

  it('строка плашки найдена', () => {
    assert.ok(start >= 0, 'на плашке нет призыва `waitingLine(waiting)`');
  });

  it('этапу на согласовании — срок согласования', () => {
    assert.match(line, /waiting\.state === 'IN_APPROVAL' && waiting\.approvalDueOn !== null/u);
    assert.match(line, /срок согласования до \$\{formatDate\(waiting\.approvalDueOn\)\}/u);
  });

  it('срок этапа — только когда срока согласования нет', () => {
    const approval = line.indexOf('waiting.approvalDueOn');
    const due = line.indexOf('formatDate(waiting.dueOn)');
    assert.ok(approval >= 0 && due > approval, 'срок этапа стоит раньше срока согласования или без него');
  });
});

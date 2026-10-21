/**
 * Этап приостановленной работы глазами клиента (находка Р-654, решение
 * Р-654): у приостановленной работы этапы не меняются (Р-240), и клиент на
 * этапе «На согласовании» не видел ни кнопок, ни срока, ни объяснения —
 * пояснение о приостановке стояло только у того, кто переводит этапы.
 * Теперь клиенту сказано, что от него ничего не ждут, как на карточке
 * работы (Р-329), а на согласовании — что срок на это время стоит
 * (Т-15, Р-290: приостановка хранит остаток дней срока).
 *
 * Модуль экрана с JSX тестом не загружается, поэтому проверка — по тексту
 * экрана, как в `moscow-day.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const screen = readFileSync(
  path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'stages', '[id]', 'page.tsx'),
  'utf8',
);

/** Исходник без комментариев: правило касается кода, а не пояснений к нему. */
function code(text: string): string {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/gu, '')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
}

describe('клиенту на этапе приостановленной работы — пояснение (Р-654)', () => {
  const source = code(screen);
  const gate = "!live && actor.role === 'CLIENT' && stage.project.status === 'PAUSED'";
  const start = source.indexOf(gate);
  const branch = source.slice(start, source.indexOf(') : null}', start));

  it('у клиента своя ветка, не зависящая от права переводить этапы', () => {
    assert.ok(start >= 0, 'ветки для клиента у приостановленной работы нет');
    assert.doesNotMatch(branch, /STAGE_SET_STATE/u);
  });

  it('пояснение — что от клиента сейчас ничего не требуется', () => {
    assert.match(branch, /<Notice tone="quiet" role="status">/u);
    assert.match(branch, /'Работа приостановлена — сейчас от вас ничего не требуется\.'/u);
  });

  it('на согласовании — почему нет кнопок и срока', () => {
    assert.match(branch, /state !== 'IN_APPROVAL'/u);
    assert.match(
      branch,
      /Согласовать этап можно будет, когда работа продолжится: срок согласования на это время остановлен\./u,
    );
  });

  it('об остановленном сроке — только если срок был', () => {
    // Приостановка хранит остаток дней срока (Р-290); у этапа без срока
    // (вход клиенту открыли уже во время паузы) останавливать нечего.
    const stopped = branch.indexOf('срок согласования на это время остановлен');
    const guard = branch.indexOf('stage.approvalDaysLeft === null');
    assert.ok(guard >= 0 && guard < stopped, 'фраза об остановленном сроке без проверки остатка дней');
    assert.match(branch, /'Работа приостановлена — сейчас от вас ничего не требуется\. Согласовать этап можно будет, когда работа продолжится\.'/u);
  });
});

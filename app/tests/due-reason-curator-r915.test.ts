/**
 * Причина переноса срока куратору не показывается (решение Р-915).
 *
 * Аудит 15.11.2026, находка П-4: причину перевода этапа куратор не видит
 * (Р-414) — её пишут клиенту, и в ней бывают его обстоятельства и
 * контакты. Причина переноса срока шла мимо правила: стояла в истории
 * работы и уходила куратору письмом.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { presentClientReason, type Actor } from '../src/lib/cabinet/access.ts';

const SRC = path.join(import.meta.dirname, '..', 'src');
const projects = readFileSync(path.join(SRC, 'lib', 'cabinet', 'projects.ts'), 'utf8');
const card = readFileSync(path.join(SRC, 'app', 'cabinet', 'projects', '[code]', 'page.tsx'), 'utf8');

const actor = (role: Actor['role']): Actor => ({ id: 'a', role, status: 'ACTIVE', clientProfileId: null, expertNdaSignedAt: null });

/** Письма одного события: тело и ключ. */
const letters = (kind: string) =>
  [...projects.matchAll(/await enqueue\(tx, \{[\s\S]*?\n    \}\);/gu)]
    .map((match) => match[0])
    .filter((text) => text.includes(`eventKind: '${kind}'`));

describe('причина переноса срока — клиенту и практике, не куратору (Р-915)', () => {
  it('правило показа: куратору — null, остальным — текст', () => {
    assert.equal(presentClientReason(actor('EXPERT'), 'Клиент в больнице'), null);
    for (const role of ['CLIENT', 'MANAGER', 'HEAD'] as const) {
      assert.equal(presentClientReason(actor(role), 'Клиент в больнице'), 'Клиент в больнице');
    }
  });

  for (const kind of ['PROJECT_DUE_CHANGED', 'STAGE_DUE_CHANGED']) {
    it(`${kind}: письмо клиенту несёт причину, письмо куратору — нет`, () => {
      const found = letters(kind);
      assert.equal(found.length, 2, `писем ${found.length}`);
      const toExpert = found.filter((text) => text.includes('userId: expert.id'));
      const toClient = found.filter((text) => text.includes('userId: project.client.userId'));
      assert.equal(toExpert.length, 1);
      assert.equal(toClient.length, 1);
      assert.match(toClient[0]!, /Причина: \$\{reason\}/u);
      assert.doesNotMatch(toExpert[0]!.replace(/\/\/[^\n]*/gu, ''), /reason/u);
    });
  }

  it('история работы показывает причину переноса через общее правило', () => {
    for (const kind of ['STAGE_DUE_CHANGED', 'PROJECT_DUE_CHANGED']) {
      const start = card.indexOf(`if (kind === '${kind}') {`);
      const body = card.slice(start, card.indexOf('\n  }\n', start));
      assert.match(body, /const why = presentClientReason\(actor, data\.reason\);/u, kind);
      assert.doesNotMatch(body, /\$\{data\.reason\}/u, kind);
    }
  });
});

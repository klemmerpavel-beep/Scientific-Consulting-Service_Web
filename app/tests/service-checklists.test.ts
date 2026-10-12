/**
 * Чек-листы по видам работ и вкладки экрана чек-листов (решение Р-550).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { AccessDenied, type Actor } from '../src/lib/cabinet/access.ts';
import { CHECKLISTS, checklistView, checklistViews, checklistsForView } from '../src/lib/cabinet/checklists.ts';
import {
  SERVICE_CHECKLISTS,
  SERVICE_CODES,
  SERVICE_PHASES,
  serviceChecklist,
  serviceChecklistsFor,
} from '../src/lib/cabinet/service-checklists.ts';

const actor = (role: Actor['role']): Actor => ({
  id: `u-${role}`,
  role,
  status: 'ACTIVE',
  clientProfileId: role === 'CLIENT' ? 'c-1' : null,
  expertNdaSignedAt: null,
});

/** Коды видов из наполнения справочника — без базы, по тексту скрипта. */
const SEEDED = [
  ...readFileSync(path.join(import.meta.dirname, '..', 'scripts', 'seed-reference.ts'), 'utf8').matchAll(
    /^\s+code: '([a-z]+)',$/gmu,
  ),
].map((match) => match[1]);

describe('чек-листы по видам работ (Р-550)', () => {
  it('у каждого вида справочника — ровно один чек-лист', () => {
    assert.deepEqual([...SERVICE_CODES].sort(), [...SEEDED].sort());
    for (const code of SERVICE_CODES) {
      assert.equal(SERVICE_CHECKLISTS.filter((list) => list.serviceCode === code).length, 1, code);
      assert.equal(serviceChecklist(code)?.key, `service-${code}`);
    }
    assert.equal(serviceChecklist('unknown'), null);
  });

  it('шаги в трёх блоках, ключи шагов в чек-листе не повторяются', () => {
    for (const list of SERVICE_CHECKLISTS) {
      for (const phase of SERVICE_PHASES) {
        assert.ok(list.steps.filter((step) => step.phase === phase.key).length >= 2, `${list.key}: ${phase.title}`);
      }
      const keys = list.steps.map((step) => step.key);
      assert.equal(new Set(keys).size, keys.length, `${list.key}: повтор ключа`);
      for (const key of keys) assert.match(key, /^[a-z][a-z-]*$/u, `${list.key}: ключ ${key}`);
    }
    // Ключи чек-листов по видам не пересекаются с процессными.
    for (const list of SERVICE_CHECKLISTS) assert.ok(!CHECKLISTS.some((other) => other.key === list.key));
  });

  it('открыты куратору, менеджеру и руководителю; клиенту — нет', () => {
    for (const role of ['EXPERT', 'MANAGER', 'HEAD'] as const) {
      assert.equal(serviceChecklistsFor(actor(role)).length, SERVICE_CODES.length);
    }
    assert.throws(() => serviceChecklistsFor(actor('CLIENT')), AccessDenied);
  });
});

describe('вкладки экрана чек-листов (Р-550)', () => {
  it('руководителю — по адресату и по видам; остальным — свои и по видам', () => {
    assert.deepEqual(
      checklistViews(actor('HEAD')).map((view) => view.key),
      ['head', 'manager', 'curator', 'service'],
    );
    for (const role of ['MANAGER', 'EXPERT'] as const) {
      assert.deepEqual(
        checklistViews(actor(role)).map((view) => view.key),
        ['own', 'service'],
      );
    }
    assert.throws(() => checklistViews(actor('CLIENT')), AccessDenied);
  });

  it('незнакомая вкладка — первая вкладка роли; чужая вкладка не открывается', () => {
    assert.equal(checklistView(actor('HEAD'), undefined), 'head');
    assert.equal(checklistView(actor('HEAD'), 'service'), 'service');
    assert.equal(checklistView(actor('MANAGER'), 'head'), 'own');
    assert.equal(checklistView(actor('EXPERT'), 'curator'), 'own');
    assert.equal(checklistView(actor('EXPERT'), 'nonsense'), 'own');
  });

  it('руководитель видит чек-листы глазами адресата', () => {
    const head = actor('HEAD');
    const only = checklistsForView(head, 'head');
    assert.ok(only.length > 0);
    for (const list of only) assert.deepEqual(list.roles, ['HEAD']);
    assert.deepEqual(
      checklistsForView(head, 'manager').map((list) => list.key),
      checklistsForView(actor('MANAGER'), 'own').map((list) => list.key),
    );
    assert.deepEqual(
      checklistsForView(head, 'curator').map((list) => list.key),
      checklistsForView(actor('EXPERT'), 'own').map((list) => list.key),
    );
    // Каждый процессный чек-лист попадает хотя бы в одну вкладку.
    const shown = new Set(['head', 'manager', 'curator'].flatMap((view) => checklistsForView(head, view as 'head').map((list) => list.key)));
    assert.equal(shown.size, CHECKLISTS.length);
    assert.deepEqual(checklistsForView(head, 'service'), []);
  });
});

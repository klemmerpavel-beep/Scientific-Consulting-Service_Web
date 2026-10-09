/**
 * Производственный контур без базы — проход проверки кода 09.10.2026
 * (пакет «П5 Производственный контур»): куратор не видит текста,
 * адресованного клиенту; закрытая работа не порождает дел и ходов.
 *
 * Запуск: node --test tests/production-loop.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  AWAITING_CLIENT_FOR_CURATOR,
  presentBlockedReason,
  type Actor,
} from '../src/lib/cabinet/access.ts';

const APP = path.resolve(import.meta.dirname, '..');
const source = (file: string) => readFileSync(path.join(APP, file), 'utf8');

const as = (role: Actor['role']): Actor => ({
  id: `${role.toLowerCase()}-1`,
  role,
  status: 'ACTIVE',
  clientProfileId: role === 'CLIENT' ? 'client-1' : null,
  expertNdaSignedAt: role === 'EXPERT' ? new Date(Date.UTC(2026, 0, 10)) : null,
});

describe('причина «ждём материалы» куратору не показывается (Р-522)', () => {
  const why = 'Ждём выгрузку от вашего научного руководителя Иванова, тел. +7 900 000-00-00';

  it('клиент и практика видят причину целиком', () => {
    for (const role of ['CLIENT', 'MANAGER', 'HEAD'] as const) {
      assert.equal(presentBlockedReason(as(role), why), why);
    }
  });

  it('куратор видит нейтральную пометку, а не текст для клиента', () => {
    assert.equal(presentBlockedReason(as('EXPERT'), why), AWAITING_CLIENT_FOR_CURATOR);
    assert.doesNotMatch(AWAITING_CLIENT_FOR_CURATOR, /Иванов|\+7/u);
  });

  it('без причины пометки нет никому', () => {
    for (const role of ['CLIENT', 'MANAGER', 'HEAD', 'EXPERT'] as const) {
      assert.equal(presentBlockedReason(as(role), null), null);
    }
  });

  it('блок куратора «Что сделать сейчас» не выводит причину как есть', () => {
    const screen = source('src/app/cabinet/stages/[id]/page.tsx');
    const start = screen.indexOf('{curatorView ? (');
    const end = screen.indexOf(") : (stage.summary ?? '').trim() === ''", start);
    assert.ok(start > 0 && end > start, 'блок куратора найден');
    const block = screen.slice(start, end);
    assert.doesNotMatch(block, /\{stage\.blockedReason\}/u);
    assert.match(screen, /presentBlockedReason\(actor, stage\.blockedReason\)/u);
  });

  it('пометка шкалы этапов на карточке работы берёт причину по правилу Р-414', () => {
    const card = source('src/app/cabinet/projects/[code]/page.tsx');
    assert.doesNotMatch(card, /note: stage\.state === 'AWAITING_CLIENT' \? stage\.blockedReason/u);
    assert.match(card, /note: stage\.state === 'AWAITING_CLIENT' \? presentClientReason\(actor, stage\.blockedReason\)/u);
  });
});

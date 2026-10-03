/**
 * Путь возврата после входа и ссылка «Открыть кабинет» (требование Т-06,
 * решение Р-309): пропускается только путь внутри кабинета; ссылка письма
 * несёт экран и адрес, сигнал Telegram — только экран.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  defaultPath,
  openEmail,
  openLink,
  openPath,
  packOpen,
  safeNext,
  unpackOpen,
} from '../src/lib/cabinet/next-path.ts';
import { telegramNote } from '../src/lib/cabinet/events.ts';

describe('путь возврата — только внутри кабинета', () => {
  const rejected = [
    '//evil.com',
    '/\\evil',
    '/cabinet\\..\\x',
    'https://evil.com/cabinet',
    'javascript:alert(1)',
    '/cabinet/../admin',
    '/cabinet/./projects',
    '/cabinet/%2F%2Fevil.com',
    '/cabinet/%2e%2e/x',
    '/cabinet//evil.com',
    '/cabinetx',
    '/cabinet/open?to=/cabinet',
    '/cabinet/enter/abc.def',
    '/cabinet/stages/1\nSet-Cookie:x',
    '',
    null,
  ];
  for (const raw of rejected) {
    it(`отвергается ${JSON.stringify(raw)}`, () => {
      assert.equal(safeNext(raw), null);
    });
  }

  it('пути экранов проходят как есть', () => {
    for (const ok of ['/cabinet', '/cabinet/stages/cmx1', '/cabinet/projects/PD-2026-047/payments', '/cabinet/manage?page=2']) {
      assert.equal(safeNext(ok), ok);
    }
  });
});

describe('ссылка «Открыть кабинет»', () => {
  it('в письме — экран и адрес получателя, раскодируемые обратно', () => {
    const link = openLink('https://prodisser.ru/', '/cabinet/stages/cmx1', 'anna+test@example.org');
    const url = new URL(link);
    assert.equal(url.origin + url.pathname, 'https://prodisser.ru/cabinet/open');
    assert.equal(url.searchParams.get('to'), '/cabinet/stages/cmx1');
    assert.equal(url.searchParams.get('email'), 'anna+test@example.org');
  });

  it('чужой путь подменяется кабинетом', () => {
    assert.equal(openPath('//evil.com'), `/cabinet/open?to=${encodeURIComponent('/cabinet')}`);
  });

  it('путь по умолчанию — экран работы или кабинет', () => {
    assert.equal(defaultPath('PD-2026-001'), '/cabinet/projects/PD-2026-001');
    assert.equal(defaultPath(null), '/cabinet');
  });

  it('сигнал Telegram — экран через обработчик, без адреса почты', () => {
    const text = telegramNote('STAGE_IN_APPROVAL', 'PD-2026-001', '/cabinet/stages/cmx1');
    assert.ok(text.includes(`/cabinet/open?to=${encodeURIComponent('/cabinet/stages/cmx1')}`), text);
    assert.ok(!text.includes('@'), 'в сигнале адрес почты');
    assert.ok(!text.includes('email='), 'в сигнале адрес почты');
  });
});

describe('намерение открытия в cookie', () => {
  it('упаковывается и распаковывается; адрес — только похожий на адрес', () => {
    assert.deepEqual(unpackOpen(packOpen('/cabinet/stages/cmx1', 'Anna@Example.org')), {
      to: '/cabinet/stages/cmx1',
      email: 'anna@example.org',
    });
    assert.deepEqual(unpackOpen(packOpen('/cabinet', 'не адрес')), { to: '/cabinet', email: null });
    assert.equal(openEmail('a@b'), null);
  });

  it('подделка с чужим путём или испорченное значение — ничего', () => {
    const forged = Buffer.from(JSON.stringify({ to: '//evil.com', email: 'a@b.ru' }), 'utf8').toString('base64url');
    assert.equal(unpackOpen(forged), null);
    assert.equal(unpackOpen('%%%'), null);
    assert.equal(unpackOpen(undefined), null);
  });
});

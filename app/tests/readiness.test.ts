/**
 * Готовность кабинета к работе (решение Р-153).
 *
 * Проверяется то, от чего зависит поведение живого сайта: при незаданных
 * настройках раздел должен назвать их, а не молча подняться и упасть на
 * первом же запросе к базе.
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { cabinetReadiness, settingPurpose } from '../src/lib/cabinet/readiness.ts';

const KEYS = ['DATABASE_URL', 'SESSION_SECRET', 'CABINET_STORAGE_DIR'] as const;
const saved = new Map(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function set(values: Partial<Record<(typeof KEYS)[number], string | undefined>>): void {
  for (const key of KEYS) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe('готовность кабинета', () => {
  it('все настройки заданы — раздел готов', () => {
    set({
      DATABASE_URL: 'postgresql://localhost/x',
      SESSION_SECRET: 'z'.repeat(48),
      CABINET_STORAGE_DIR: '/var/lib/prodisser/materials',
    });
    assert.deepEqual(cabinetReadiness(), { ready: true, missing: [] });
  });

  it('пустое окружение называет все три настройки', () => {
    set({});
    const { ready, missing } = cabinetReadiness();
    assert.equal(ready, false);
    assert.deepEqual([...missing], ['DATABASE_URL', 'SESSION_SECRET', 'CABINET_STORAGE_DIR']);
  });

  it('короткий секрет сессии не считается заданным', () => {
    // Свёртка токенов на коротком секрете защищена только длиной случайной
    // части — это то же самое, что секрета нет.
    set({
      DATABASE_URL: 'postgresql://localhost/x',
      SESSION_SECRET: 'слишком короткий',
      CABINET_STORAGE_DIR: '/tmp/materials',
    });
    assert.deepEqual([...cabinetReadiness().missing], ['SESSION_SECRET']);
  });

  it('у каждой настройки названо назначение', () => {
    set({});
    for (const name of cabinetReadiness().missing) {
      assert.ok((settingPurpose(name) ?? '').length > 0, `у ${name} нет пояснения`);
    }
    assert.equal(settingPurpose('SMTP_HOST'), null);
  });
});

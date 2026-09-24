/**
 * Схема боевой базы не отстаёт от кода (решение Р-218).
 *
 * Образ миграций не пересобирался, и девять миграций кабинета на боевую
 * базу не легли ни разу, а проверка здоровья отвечала «здоров». Эти
 * проверки держат обе половины исправления.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { LATEST_MIGRATION } from '../src/lib/schema-version.ts';

const APP = path.join(import.meta.dirname, '..');
const ROOT = path.join(APP, '..');

describe('схема, которую ждёт код', () => {
  it('имя последней миграции совпадает с каталогом миграций', () => {
    // Иначе проверка здоровья сочла бы здоровой базу без новой миграции.
    const names = readdirSync(path.join(APP, 'prisma', 'migrations'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    assert.equal(LATEST_MIGRATION, names.at(-1));
  });

  for (const service of ['migrate', 'tools']) {
    it(`образ «${service}» собирается при каждом запуске`, () => {
      // `compose run` без `pull_policy: build` берёт образ первой сборки.
      const compose = readFileSync(path.join(ROOT, 'deploy', 'docker-compose.yml'), 'utf8');
      const block = compose.split(/\n  (?=[a-z]+:\n)/u).find((part) => part.startsWith(`${service}:`));
      assert.ok(block !== undefined, `в docker-compose.yml нет сервиса ${service}`);
      assert.match(block, /\n {4}pull_policy: build\n/u);
    });
  }
});

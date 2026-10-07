/**
 * Сбой шага планового прогона не останавливает отправку (решение Р-438).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { cronStep } from '../src/lib/cabinet/cron-step.ts';

describe('шаги планового прогона рассылки (Р-438)', () => {
  it('упавший шаг даёт ноль и записывается в отказы; удачный — своё число', async () => {
    const failed: string[] = [];
    const quiet = console.error;
    console.error = () => undefined;
    try {
      assert.equal(await cronStep('ломается', async () => { throw new Error('сбой базы'); }, failed), 0);
    } finally {
      console.error = quiet;
    }
    assert.equal(await cronStep('работает', async () => 3, failed), 3);
    assert.deepEqual(failed, ['ломается']);
  });

  it('маршрут обёртывает каждый шаг и отправляет при любом исходе шагов', () => {
    const route = readFileSync(
      path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'api', 'outbox', 'route.ts'),
      'utf8',
    );
    const steps = route.slice(route.indexOf('const stepsFailed'), route.indexOf('const report = await dispatch()'));
    const calls = [...steps.matchAll(/await (\w+)\(/gu)].map((match) => match[1]);
    assert.ok(calls.length >= 9, 'шаги не найдены');
    assert.ok(calls.every((name) => name === 'cronStep'), `шаг вне обёртки: ${calls.join(', ')}`);
    assert.match(route, /stepsFailed,\s*\.\.\.report/u);
  });
});

/**
 * Причина отказа действия — одноразовым сообщением, а не текстом в адресе
 * (решение Р-243): экран печатает текст, только если метка из адреса
 * совпала с cookie того, чьё действие отказало; ссылка с произвольной
 * фразой ничего не выводит.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { packFlash, unpackFlash } from '../src/lib/cabinet/flash-value.ts';

const APP = path.join(import.meta.dirname, '..');
const CABINET = path.join(APP, 'src/app/cabinet');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : full.endsWith('.tsx') || full.endsWith('.ts') ? [full] : [];
  });
}

describe('одноразовое сообщение об отказе', () => {
  it('текст возвращается по своей метке и не возвращается по чужой', () => {
    const raw = packFlash('0123456789ab', 'Остановка этапа без причины не принимается');
    assert.equal(unpackFlash(raw, '0123456789ab'), 'Остановка этапа без причины не принимается');
    assert.equal(unpackFlash(raw, 'ba9876543210'), undefined);
    assert.equal(unpackFlash(undefined, '0123456789ab'), undefined);
    assert.equal(unpackFlash('не base64 {', '0123456789ab'), undefined);
  });

  it('метка — только двенадцать шестнадцатеричных знаков: текст в адресе меткой не станет', () => {
    const raw = packFlash('0123456789ab', 'x');
    assert.equal(unpackFlash(raw, 'Позвоните по номеру'), undefined);
  });

  it('текст ограничен тремястами знаками', () => {
    const raw = packFlash('0123456789ab', 'я'.repeat(1000));
    assert.equal(unpackFlash(raw, '0123456789ab')?.length, 300);
  });

  it('ни одно действие не кладёт текст причины в адрес, ни один экран не печатает его из адреса', () => {
    const actions = readFileSync(path.join(CABINET, 'actions.ts'), 'utf8');
    assert.doesNotMatch(actions, /\?error=\$\{encodeURIComponent/u);
    for (const file of files(CABINET)) {
      const source = readFileSync(file, 'utf8');
      assert.doesNotMatch(source, /decodeURIComponent\((sp|flags|params)\.error\)/u, file);
      assert.doesNotMatch(source, /(?<!=)\{(sp|flags|params)\.error\}/u, file);
    }
  });
});

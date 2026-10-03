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

describe('отказ у своей формы и черновик (решение Р-279)', async () => {
  const { MAX_DRAFT_BYTES, packDraft, unpackDraft, unpackFlashEntry } = await import(
    '../src/lib/cabinet/flash-value.ts'
  );

  it('место вывода возвращается вместе с причиной, чужое имя места отбрасывается', () => {
    const raw = packFlash('0123456789ab', 'Экспертом может быть только действующий эксперт', 'expert');
    assert.deepEqual(unpackFlashEntry(raw, '0123456789ab'), {
      text: 'Экспертом может быть только действующий эксперт',
      slot: 'expert',
    });
    const forged = Buffer.from(
      JSON.stringify({ id: '0123456789ab', text: 'x', slot: '<script>' }),
      'utf8',
    ).toString('base64url');
    assert.deepEqual(unpackFlashEntry(forged, '0123456789ab'), { text: 'x' });
  });

  it('черновик формы возвращается по своей метке и не возвращается по чужой', () => {
    const raw = packDraft('0123456789ab', { title: 'Глава 2', dueOn: '2026-11-01' });
    assert.ok(raw !== null);
    assert.deepEqual(unpackDraft(raw, '0123456789ab'), { title: 'Глава 2', dueOn: '2026-11-01' });
    assert.equal(unpackDraft(raw, 'ba9876543210'), undefined);
  });

  it('черновик больше предела cookie не сохраняется', () => {
    assert.equal(packDraft('0123456789ab', { summary: 'я'.repeat(MAX_DRAFT_BYTES) }), null);
  });

  it('четыре действия «Управления работой» отказывают причиной, а не экраном сбоя', () => {
    const source = readFileSync(path.join(CABINET, 'actions.ts'), 'utf8');
    const body = (name: string) => {
      const start = source.indexOf(`export async function ${name}(`);
      assert.ok(start >= 0, `нет действия ${name}`);
      return source.slice(start, source.indexOf('\nexport ', start + 1));
    };
    for (const name of ['saveProject', 'setExpert', 'setManager']) {
      assert.match(body(name), /catch \(error\)[\s\S]*manageFailure\(/u, `${name} без перехвата отказа`);
    }
    // Смена состояния отказывает на экране подтверждения, с набранной
    // причиной (требование М-09, решение Р-299).
    assert.match(
      body('changeProjectStatus'),
      /catch \(error\)[\s\S]*withError\(`\/cabinet\/projects\/\$\{code\}\/status/u,
      'changeProjectStatus без перехвата отказа',
    );
  });

  it('ошибка перехода этапа называет состояния подписями, а не именами из базы', () => {
    const source = readFileSync(path.join(APP, 'src/lib/cabinet/projects.ts'), 'utf8');
    assert.doesNotMatch(source, /Переход этапа из «\$\{from\}»/u);
  });
});

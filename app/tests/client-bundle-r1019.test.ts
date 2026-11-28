/**
 * Библиотека zod не попадает в сборку страниц сайта (решение Р-1019).
 *
 * Клиентский модуль отправки заявки брал две постоянные из `lead-schema.ts`,
 * а тот описывает схему заявки на zod: в сборку каждой страницы уходила вся
 * библиотека — 111 КБ, 32 КБ в сжатом виде. Постоянные вынесены в
 * `lead-messages.ts`, у которого импортов нет. Заявку по-прежнему проверяет
 * сервер.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');
const read = (...parts: string[]) => readFileSync(path.join(SRC, ...parts), 'utf8');
/** Модули, которые описывают схемы на zod: в браузер им дороги нет. */
const ZOD_MODULES = ['lead-schema', 'expert-application'];
const importsZodModule = new RegExp(`from '[^']*/(?:${ZOD_MODULES.join('|')})(?:\\.ts)?'`, 'u');

describe('zod остаётся на сервере (Р-1019)', () => {
  it('схемы на zod — только в перечисленных модулях', () => {
    const withZod = readdirSync(path.join(SRC, 'lib')).filter((f) => f.endsWith('.ts') && /from 'zod'/u.test(read('lib', f)));
    assert.deepEqual(withZod.map((f) => f.replace(/\.ts$/u, '')).sort(), [...ZOD_MODULES].sort());
  });

  it('тексты формы — в модуле без импортов', () => {
    const messages = read('lib', 'lead-messages.ts');
    assert.doesNotMatch(messages, /^import /mu);
    assert.match(messages, /export const RATE_LIMIT_MESSAGE =/u);
    assert.match(messages, /export const FIELD_LABELS: Record<string, string> = \{/u);
  });

  it('клиентский модуль отправки берёт их оттуда, а не из схемы', () => {
    const submit = read('lib', 'submit-lead.ts');
    assert.match(submit, /^'use client';/u);
    assert.match(submit, /import \{ FIELD_LABELS, RATE_LIMIT_MESSAGE \} from '\.\/lead-messages';/u);
    assert.doesNotMatch(submit, importsZodModule);
  });

  it('схема выгружает те же постоянные: сервер и проверки берут их из прежнего места', async () => {
    const schema = await import('../src/lib/lead-schema.ts');
    const messages = await import('../src/lib/lead-messages.ts');
    assert.equal(schema.RATE_LIMIT_MESSAGE, messages.RATE_LIMIT_MESSAGE);
    assert.equal(schema.FIELD_LABELS, messages.FIELD_LABELS);
    assert.equal(messages.FIELD_LABELS.consent, 'Согласие на обработку персональных данных');
  });

  it('ни один клиентский компонент сайта не импортирует модуль со схемой', () => {
    const clientFiles = [
      ...readdirSync(path.join(SRC, 'components')).filter((f) => f.endsWith('.tsx')).map((f) => ['components', f]),
      ...readdirSync(path.join(SRC, 'components', 'pages')).filter((f) => f.endsWith('.tsx')).map((f) => ['components', 'pages', f]),
    ];
    assert.ok(clientFiles.length > 20);
    for (const parts of clientFiles) {
      const source = read(...parts);
      if (!/^'use client';/u.test(source)) continue;
      assert.doesNotMatch(source, importsZodModule, parts.join('/'));
      assert.doesNotMatch(source, /from 'zod'/u, parts.join('/'));
    }
  });
});

/**
 * Приём заявок с сайта (решение Р-241): отзыв уходит в доставку без
 * контакта, сообщения о длине — по-русски, ловушка для роботов не даёт
 * 422, адреса на кириллических доменах принимаются, счётчик частоты не
 * продлевает запрет отказами и не обнуляется переполнением, все ошибочные
 * поля помечаются, заявитель получает ответ до доставки.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  RATE_LIMIT_MESSAGE,
  forIntake,
  leadSchema,
  looksAutomated,
  looksLikeEmail,
} from '../src/lib/lead-schema.ts';
import { RateLimiter } from '../src/lib/rate-limit.ts';

const APP = path.join(import.meta.dirname, '..');

const request = (extra: Record<string, unknown> = {}) => ({
  source: 'postgrad',
  form: 'request',
  contactKind: 'email',
  contact: 'ivanova@example.org',
  consent: true,
  ...extra,
});

describe('приём заявки', () => {
  it('отзыв идёт в базу и в доставку одной записью без контакта', () => {
    const parsed = leadSchema.parse({
      source: 'postgrad',
      form: 'review',
      contactKind: 'email',
      contact: 'robot@example.org',
      name: 'аспирант',
      message: 'Спасибо за разбор методологии.',
    });
    const clean = forIntake(parsed);
    assert.equal(clean.contact, '');
    assert.equal(clean.name, 'аспирант', 'роль автора отзыва потеряна');
    assert.equal(clean.message, parsed.message);

    const ordinary = leadSchema.parse(request());
    assert.equal(forIntake(ordinary).contact, 'ivanova@example.org');
  });

  it('превышение длины называется по-русски', () => {
    const result = leadSchema.safeParse(request({ message: 'а'.repeat(4001) }));
    assert.equal(result.success, false);
    const issue = result.error!.issues.find((item) => item.path[0] === 'message');
    assert.equal(issue?.message, 'Не длиннее 4000 знаков');
    const name = leadSchema.safeParse(request({ name: 'б'.repeat(121) }));
    assert.equal(
      name.error!.issues.find((item) => item.path[0] === 'name')?.message,
      'Не длиннее 120 знаков',
    );
  });

  it('ловушка для роботов не отклоняет заявку ни длиной, ни типом, а помечает её', () => {
    for (const trap of ['x'.repeat(500), 12345, true]) {
      const result = leadSchema.safeParse(request({ company_website: trap }));
      assert.equal(result.success, true, `ловушка ${String(trap).slice(0, 10)} дала отказ`);
      assert.equal(looksAutomated(result.data!), 'заполнено скрытое поле');
    }
    const clean = leadSchema.parse(request());
    assert.equal(clean.company_website, '');
  });

  it('адрес на кириллическом домене принимается, явная опечатка — нет', () => {
    for (const good of ['мария@почта.рф', 'ivanova@university.ru', 'a.b+c@sub.domain.org']) {
      assert.equal(looksLikeEmail(good), true, good);
      assert.equal(leadSchema.safeParse(request({ contact: good })).success, true, good);
    }
    for (const bad of ['ivanova', 'ivanova@', 'ivanova@mail', 'ivanova@mail.', 'и в@почта.рф', 'a@b.1']) {
      assert.equal(looksLikeEmail(bad), false, bad);
    }
  });

  it('сообщение о частоте обещает столько, сколько длится окно', () => {
    assert.match(RATE_LIMIT_MESSAGE, /несколько минут/u);
  });
});

describe('счётчик частоты', () => {
  it('отказ не продлевает запрет: через окно после последнего принятого — снова можно', () => {
    const limiter = new RateLimiter({ windowMs: 1000, limit: 2, maxKeys: 10 });
    assert.equal(limiter.hit('a', 0), false);
    assert.equal(limiter.hit('a', 100), false);
    assert.equal(limiter.hit('a', 200), true);
    assert.equal(limiter.hit('a', 900), true);
    // Принятые попытки — 0 и 100; отказы в 200 и 900 окно не сдвинули.
    assert.equal(limiter.hit('a', 1050), false);
  });

  it('переполнение не обнуляет запрет тому, кто сейчас упирается в предел', () => {
    const limiter = new RateLimiter({ windowMs: 1000, limit: 1, maxKeys: 3 });
    assert.equal(limiter.hit('flood', 0), false);
    assert.equal(limiter.hit('flood', 10), true);
    for (let index = 0; index < 50; index += 1) limiter.hit(`other-${index}`, 20 + index);
    assert.ok(limiter.size <= 3);
    // Давний ключ вытеснен, но это вытеснение по давности, а не очистка:
    // свежие ключи остаются под счётом.
    assert.equal(limiter.hit('other-49', 80), true, 'свежий ключ потерял счёт');
  });

  it('ключи без попыток в окне уходят первыми', () => {
    const limiter = new RateLimiter({ windowMs: 100, limit: 1, maxKeys: 2 });
    limiter.hit('old', 0);
    limiter.hit('busy', 150);
    limiter.hit('new', 160);
    assert.equal(limiter.size, 2);
    assert.equal(limiter.hit('busy', 170), true, 'занятый ключ вытеснен вместо устаревшего');
  });
});

describe('ответ формы и разметка ошибок', () => {
  it('доставка идёт после ответа и получает очищенную запись', () => {
    const route = readFileSync(path.join(APP, 'src/app/api/lead/route.ts'), 'utf8');
    assert.match(route, /after\(async \(\) => \{\s*const results = await deliver\(lead, id\)/u);
    assert.match(route, /const lead = forIntake\(parsed\.data\)/u);
    assert.doesNotMatch(route, /lead\.form === 'review' \? '' :/u);
  });

  it('все поля с ошибкой получают aria-invalid, не только первое', () => {
    const source = readFileSync(path.join(APP, 'src/lib/submit-lead.ts'), 'utf8');
    assert.match(source, /for \(const name of Object\.keys\(fieldErrors\)\)/u);
  });
});

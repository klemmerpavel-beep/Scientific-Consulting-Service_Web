/**
 * Клавиатура и автозаполнение у полей кабинета (решение Р-910).
 *
 * Аудит 15.11.2026, находка Д-3: у общего `Field` не было ни `autocomplete`,
 * ни `inputmode` — сумму с телефона набирали буквенной клавиатурой, а
 * браузер сотрудника предлагал его собственную почту в карточку клиента
 * (WCAG 1.3.5). Правило закреплено по исходникам.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');
const read = (rel: string) => readFileSync(path.join(SRC, rel), 'utf8');

const files = ['app/cabinet', 'components/cabinet'].flatMap((dir) =>
  readdirSync(path.join(SRC, dir), { recursive: true })
    .map(String)
    .filter((name) => name.endsWith('.tsx'))
    .map((name) => path.join(dir, name).split(path.sep).join('/')),
);

/** Все поля общего `Field`: файл, имя, текст вызова. */
const fields = files.flatMap((file) =>
  [...read(file).matchAll(/<Field\b[\s\S]*?\/>/gu)].map((match) => ({
    file,
    name: /name="([^"]+)"/u.exec(match[0])?.[1] ?? '',
    call: match[0],
  })),
);

const MONEY = ['amount', 'basePrice', 'contractTotal', 'cost', 'costs', 'defaultPayout', 'paid', 'revenue', 'totalAmount'];

describe('клавиатура и автозаполнение полей (Р-910)', () => {
  it('общий Field передаёт оба свойства в поле ввода', () => {
    const ui = read('components/cabinet/ui.tsx');
    assert.match(ui, /autoComplete\?: string;/u);
    assert.match(ui, /inputMode\?: 'decimal' \| 'numeric' \| 'tel' \| 'email' \| 'search';/u);
    assert.match(ui, /<input id=\{id\} type=\{type\} \{\.\.\.shared\} autoComplete=\{autoComplete\} inputMode=\{inputMode\}/u);
  });

  it('каждое поле суммы открывает цифровую клавиатуру с разделителем', () => {
    const money = fields.filter(({ name }) => MONEY.includes(name));
    assert.ok(money.length >= 14, `полей сумм ${money.length}`);
    const bare = money.filter(({ call }) => !call.includes('inputMode="decimal"')).map(({ file, name }) => `${file}: ${name}`);
    assert.deepEqual(bare, []);
  });

  it('сумма остаётся текстовым полем: её набирают с пробелами', () => {
    const typed = fields.filter(({ name, call }) => MONEY.includes(name) && /type="number"/u.test(call));
    assert.deepEqual(typed.map(({ file }) => file), []);
  });

  it('вход по почте подставляет свой адрес', () => {
    const login = fields.find(({ file, name }) => file === 'app/cabinet/page.tsx' && name === 'email');
    assert.ok(login !== undefined);
    assert.match(login.call, /autoComplete="email"/u);
  });

  it('заявка клиента подставляет его имя, организацию и телефон', () => {
    const own = fields.filter(({ file }) => file === 'app/cabinet/request/page.tsx');
    for (const [name, token] of [['applicantName', 'name'], ['organization', 'organization'], ['phone', 'tel']]) {
      const field = own.find((item) => item.name === name);
      assert.ok(field !== undefined, name);
      assert.ok(field.call.includes(`autoComplete="${token}"`), name);
    }
  });

  it('данные другого человека сотрудник вносит без автозаполнения', () => {
    const staff = fields.filter(
      ({ file, name }) =>
        ['email', 'phone', 'fullName', 'customer'].includes(name) &&
        ['app/cabinet/manage/users/page.tsx', 'app/cabinet/manage/orders/new/page.tsx', 'app/cabinet/manage/leads/[id]/page.tsx'].includes(file),
    );
    assert.ok(staff.length >= 6, `полей ${staff.length}`);
    const open = staff.filter(({ call }) => !call.includes('autoComplete="off"')).map(({ file, name }) => `${file}: ${name}`);
    assert.deepEqual(open, []);
  });
});

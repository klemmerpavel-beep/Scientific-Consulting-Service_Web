/**
 * Почта менеджера — ссылкой «написать» там, где куратора отправляют к ней
 * (решение Р-749; Э-12, Р-331, Р-150).
 *
 * Прежде у этапа без описания куратор читал «спросите его письмом, почта —
 * в «О работе» на карточке работы»: вернуться к работе, раскрыть «О
 * работе», скопировать адрес (текст, не ссылка) и открыть почту — четыре-
 * пять действий, на телефоне — с выделением текста.
 *
 * Запуск: node --test tests/manager-mail-link.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { withoutStaffNames, type Actor } from '../src/lib/cabinet/access.ts';
import { managerMailHref } from '../src/lib/cabinet/staff-texts.ts';

const APP = path.resolve(import.meta.dirname, '..');
const source = (file: string) => readFileSync(path.join(APP, file), 'utf8');

const client: Actor = { id: 'c-1', role: 'CLIENT', status: 'ACTIVE', clientProfileId: 'cp-1', expertNdaSignedAt: null };

describe('ссылка письма менеджеру (Р-749)', () => {
  it('без этапа — просто адрес', () => {
    assert.equal(managerMailHref('manager@artboard.example'), 'mailto:manager@artboard.example');
  });

  it('с этапом — тема «Вопрос по этапу «…»», закодированная', () => {
    const href = managerMailHref('manager@artboard.example', 'Глава 2: обзор & выводы?#');
    const [address, query] = href.split('?subject=');
    assert.equal(address, 'mailto:manager@artboard.example');
    assert.doesNotMatch(query!, /[ «»&?#]/u, 'тема закодирована');
    assert.equal(decodeURIComponent(query!), 'Вопрос по этапу «Глава 2: обзор & выводы?#»');
  });

  it('клиенту адрес менеджера из выборки этапа затирается по роли', () => {
    const seen = withoutStaffNames(client, { project: { manager: { email: 'manager@artboard.example', role: 'MANAGER' } } });
    assert.equal(seen.project.manager.email, '');
  });
});

describe('где ссылка стоит (Р-749)', () => {
  it('выборка этапа берёт почту менеджера с ролью', () => {
    const queries = source('src/lib/cabinet/queries.ts');
    const start = queries.indexOf('export async function stageById(');
    const body = queries.slice(start, queries.indexOf('\nexport', start + 10));
    assert.match(body, /manager: \{ select: \{ email: true, role: true \} \},/u);
    assert.match(body, /return withoutStaffNames\(actor, stage\);/u);
  });

  it('карточка работы: почта в «О работе» — ссылкой, только куратору', () => {
    const page = source('src/app/cabinet/projects/[code]/page.tsx');
    assert.match(
      page,
      /value: forExpert \? \(\s*<>\s*\{`\$\{curatorLine\(project\.manager\)\} · `\}\s*<a className="cab-mark" href=\{managerMailHref\(project\.manager\.email\)\}>/u,
    );
  });

  it('«Ваша работа» и экран этапа — «написать менеджеру» с темой этапа', () => {
    const page = source('src/app/cabinet/projects/[code]/page.tsx');
    assert.match(page, /href=\{managerMailHref\(project\.manager\.email, current\.title\)\}>\s*написать менеджеру/u);
    const stage = source('src/app/cabinet/stages/[id]/page.tsx');
    assert.match(stage, /href=\{managerMailHref\(stage\.project\.manager\.email, stage\.title\)\}>\s*написать менеджеру/u);
    for (const text of [page, stage]) assert.doesNotMatch(text, /почта — в «О работе»/u);
  });

  it('на экране этапа ссылка — в блоке куратора', () => {
    const stage = source('src/app/cabinet/stages/[id]/page.tsx');
    const block = stage.indexOf('{curatorView ? (');
    const link = stage.indexOf('managerMailHref(stage.project.manager.email');
    // Конец блока куратора — ветка клиента и практики, как в проверке Р-522.
    const end = stage.indexOf(") : (stage.summary ?? '').trim() === ''", block);
    assert.ok(block > 0 && link > block, 'ссылка вне блока куратора');
    assert.ok(end > block && link < end, 'ссылка вне блока куратора');
  });

  it('ссылка внутри фразы — строчная, без cab-mark (DESIGN-SYSTEM §11)', () => {
    const page = source('src/app/cabinet/projects/[code]/page.tsx');
    const stage = source('src/app/cabinet/stages/[id]/page.tsx');
    assert.match(page, /<a href=\{managerMailHref\(project\.manager\.email, current\.title\)\}>/u);
    assert.match(stage, /<a href=\{managerMailHref\(stage\.project\.manager\.email, stage\.title\)\}>/u);
  });
});

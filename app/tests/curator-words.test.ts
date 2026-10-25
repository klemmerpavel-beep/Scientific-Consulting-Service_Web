/**
 * Одни слова у куратора (задача ВК-Кр09, решение Р-755).
 *
 * Чек-листы «Работы куратора» называют только то, что у куратора есть:
 * «Замечания приняты в работу» — действие практики по возврату клиентом
 * (Р-283), канала к руководителю у куратора с договором нет — путь к
 * менеджеру работы письмом. Состав и порядок шагов прежние (Р-552, Р-553).
 * Ссылка на перечень работ подписана пунктом меню куратора.
 *
 * Три формы загрузки куратора — «Ваша работа» на карточке, экран этапа,
 * «Материалы работы» — отправляются кнопкой «Приложить материал»;
 * «Без привязки к этапу» — последним вариантом; на экране этапа у
 * куратора — необязательное «Пояснение» (Р-326). Под версией у куратора —
 * «Замечание к текущей версии» (Р-327, Р-403), состояние — «ждёт
 * публикации менеджером».
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';
import { CHECKLISTS, checklistsFor, stepText } from '../src/lib/cabinet/checklists.ts';
import { navFor } from '../src/lib/cabinet/nav.ts';

const SRC = path.join(import.meta.dirname, '..', 'src');
const read = (...parts: string[]) => readFileSync(path.join(SRC, ...parts), 'utf8');

const CARD = read('app', 'cabinet', 'projects', '[code]', 'page.tsx');
const STAGE = read('app', 'cabinet', 'stages', '[id]', 'page.tsx');
const MATERIALS = read('app', 'cabinet', 'projects', '[code]', 'materials', 'page.tsx');
const ACTIONS = read('app', 'cabinet', 'actions.ts');
const UI = read('components', 'cabinet', 'ui.tsx');
const COMMENTS = read('components', 'cabinet', 'CommentList.tsx');

const actor = (role: Actor['role']): Actor => ({
  id: `u-${role}`,
  role,
  status: 'ACTIVE',
  clientProfileId: null,
  expertNdaSignedAt: new Date('2026-09-01T00:00:00Z'),
});

const steps = (key: string) => (CHECKLISTS.find((list) => list.key === key)?.steps ?? []).map(stepText);

/** Кусок исходника от метки до первого закрывающего тега после неё. */
function slice(source: string, from: string, to: string): string {
  const at = source.indexOf(from);
  assert.ok(at >= 0, `нет «${from}»`);
  return source.slice(at, source.indexOf(to, at));
}

describe('чек-листы куратора называют то, что у него есть', () => {
  it('состав и порядок шагов прежние (Р-552)', () => {
    assert.deepEqual(
      CHECKLISTS.filter((list) => list.group === 'curator').map((list) => [list.key, list.steps.length]),
      [
        ['expert-accept', 6],
        ['expert-brief', 9],
        ['expert-handover', 7],
        ['expert-remarks', 5],
      ],
    );
  });

  it('нет «Замечания приняты в работу», «Загрузить» и руководителя практики', () => {
    for (const list of CHECKLISTS.filter((item) => item.roles.includes('EXPERT'))) {
      for (const step of list.steps.map(stepText)) {
        assert.doesNotMatch(step, /Замечания приняты в работу|«Загрузить»|руководителю практики/u, `${list.key}: ${step}`);
      }
    }
  });

  it('возврат менеджером — причина в «Что сделать сейчас»; этот блок у куратора есть', () => {
    assert.equal(
      steps('expert-remarks')[4],
      'Менеджер вернул этап — причина в блоке «Что сделать сейчас» на экране этапа; исправить, приложить версию и сдать заново.',
    );
    const curatorBlock = slice(STAGE, '{curatorView ? (\n        <Card', '</Card>');
    assert.match(curatorBlock, /Что сделать сейчас/u);
    assert.match(curatorBlock, /`Менеджер вернул этап \$\{formatDay\(stage\.handbackAt\)\}`/u);
    assert.match(curatorBlock, /\{stage\.handbackReason\}/u);
  });

  it('работа не по специальности — письмо менеджеру работы, почта — в «О работе»', () => {
    assert.match(steps('expert-accept')[2]!, /написать менеджеру работы: почта — в «О работе» на карточке работы/u);
  });

  it('шаги называют кнопки и свёртки экрана этапа куратора', () => {
    assert.match(steps('expert-handover')[5]!, /«Приложить материал».*«Загрузить следующую версию»/u);
    assert.match(steps('expert-remarks')[0]!, /«Замечание к текущей версии»/u);
  });

  it('ссылки под чек-листами куратора — пунктом его меню', () => {
    const works = navFor(actor('EXPERT')).find((item) => item.href === '/cabinet/projects')!.label;
    assert.equal(works, 'Назначенные работы');
    for (const list of checklistsFor(actor('EXPERT'))) {
      for (const link of list.links.filter((item) => item.href === '/cabinet/projects')) {
        assert.equal(link.label, works, list.key);
      }
    }
    // Менеджеру и руководителю подписи прежние.
    const brief = (role: Actor['role']) => checklistsFor(actor(role)).find((list) => list.key === 'expert-brief')!.links;
    assert.deepEqual(brief('MANAGER').map((link) => link.label), ['Работы']);
    assert.deepEqual(brief('HEAD').map((link) => link.label), ['Работы']);
  });
});

describe('три формы загрузки куратора подписаны одинаково', () => {
  it('«Ваша работа» на карточке: «Приложить материал», «Без привязки к этапу» последним', () => {
    const form = slice(CARD, '<Form action={uploadMaterialWithNote}', '</Form>');
    assert.match(form, /<Button>Приложить материал<\/Button>/u);
    const select = slice(form, '<Select label="Этап"', '</Select>');
    assert.match(select, /\{uploadStages\.map[\s\S]*<option value="">Без привязки к этапу<\/option>\s*$/u);
  });

  it('«Материалы работы»: «Приложить материал», «без привязки к этапу» последним', () => {
    const form = slice(MATERIALS, '<Card id="new-material"', '</Card>');
    assert.match(form, /<Button>Приложить материал<\/Button>/u);
    assert.doesNotMatch(form, /<Button>Приложить<\/Button>/u);
    const select = slice(form, '<Select label="Этап"', '</Select>');
    assert.match(select, /\{openStages\.map[\s\S]*<option value="">без привязки к этапу<\/option>\s*$/u);
  });

  it('экран этапа: «Приложить материал», строка о запрещённых файлах и «Пояснение» куратора', () => {
    const form = slice(STAGE, 'title="Приложить новый материал"', '</Disclosure>');
    assert.match(form, /<Button tone="quiet">Приложить материал<\/Button>/u);
    assert.doesNotMatch(form, />Загрузить</u);
    // Перечень запрещённых файлов поле файла добавляет само, если у него
    // нет своего перечня расширений (Р-367).
    assert.doesNotMatch(form, /accept=/u);
    assert.match(UI, /const fullHint = accept === undefined \? \[hint, BLOCKED_HINT\]/u);
    assert.match(
      form,
      /\{curatorView \? \(\s*<Field\s+label="Пояснение"\s+name="note"\s+scope="new-material"\s+multiline\s+maxLength=\{COMMENT_MAX\}/u,
    );
    assert.match(form, /defaultValue=\{draft\.upload === 'new' \? draft\.uploadNote : undefined\}/u);
  });

  it('действие экрана этапа кладёт пояснение замечанием к версии и держит его в черновике', () => {
    const start = ACTIONS.indexOf('export async function uploadMaterial(');
    const action = ACTIONS.slice(start, ACTIONS.indexOf('\nexport ', start + 1));
    assert.match(action, /const note = String\(form\.get\('note'\) \?\? ''\);/u);
    assert.match(action, /title: title \|\| undefined,\s*note,/u);
    assert.match(action, /\{ title, uploadNote: note \}/u);
  });
});

describe('под версией у куратора — «замечание», состояние — одно написание', () => {
  it('свёртка и поле — «Замечание к текущей версии»', () => {
    assert.match(STAGE, /title=\{curatorView \? 'Замечание к текущей версии' : 'Оставить комментарий'\}/u);
    assert.match(STAGE, /label=\{curatorView \? 'Замечание к текущей версии' : 'Комментарий к текущей версии'\}/u);
  });

  it('своя версия и своё замечание — «ждёт публикации менеджером»', () => {
    assert.match(UI, /if \(moderation\.status === 'PENDING'\) return 'ждёт публикации менеджером';/u);
    assert.match(STAGE, /mayModerate \? 'ждёт публикации клиенту' : 'ждёт публикации менеджером'/u);
    assert.match(COMMENTS, /actor\.role === 'EXPERT'\s*\?\s*' · ждёт публикации менеджером'\s*:\s*' · ожидает публикации'/u);
  });
});

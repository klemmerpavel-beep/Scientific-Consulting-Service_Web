/**
 * После действия с последствиями — строка исхода и следующий шаг (решение
 * Р-725): «Согласовать этап», перевод на согласование, «Опубликовать
 * клиенту», перенос срока этапа, одобрение заявки и «Новый заказ».
 * Действие возвращает с признаком в адресе и якорем строки; экран
 * собирает строку по данным, показывает её один раз и не обещает письма,
 * которого не будет (Р-163, Р-267). При отказе признака нет.
 *
 * Тексты проверяются вызовом чистых функций, действия и экраны — по тексту
 * исходников: модули с JSX тест не загружает.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  OUTCOME_ANCHOR,
  OUTCOME_FLAGS,
  OUTCOME_WINDOW_MS,
  PUBLISHED_LINE,
  approvalSentLine,
  approvedLine,
  clientNextLabel,
  dueMovedLine,
  fateOf,
  inOutcomeWindow,
  outcomeSince,
  workCreatedLine,
} from '../src/lib/cabinet/outcome-lines.ts';

const APP = path.join(import.meta.dirname, '..');
const read = (...parts: string[]) => readFileSync(path.join(APP, ...parts), 'utf8');
const actions = read('src', 'app', 'cabinet', 'actions.ts');

function action(name: string): string {
  const start = actions.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `нет действия ${name}`);
  return actions.slice(start, actions.indexOf('\nexport ', start + 1));
}

describe('строки исхода', () => {
  it('клиенту — день согласования и следующее дело, без имён сотрудников', () => {
    assert.equal(approvedLine('23 сентября 2026'), 'Этап согласован 23 сентября 2026.');
    assert.equal(clientNextLabel({ state: 'AWAITING_CLIENT', title: 'Апробация' }), 'материалы к этапу «Апробация»');
    assert.equal(clientNextLabel({ state: 'IN_APPROVAL', title: 'Глава 3' }), 'согласование этапа «Глава 3»');
    assert.equal(clientNextLabel(null), 'к работе');
  });

  it('практике — перевод на согласование, публикация', () => {
    assert.equal(approvalSentLine('30 сентября 2026'), 'Этап отправлен клиенту на согласование до 30 сентября 2026.');
    assert.equal(approvalSentLine(null), 'Этап переведён на согласование у клиента.');
    assert.equal(PUBLISHED_LINE, 'Версия опубликована: клиент её видит.');
  });

  it('судьба уведомления — по каналу очереди и его настройке', () => {
    const on = { mail: true, telegram: true };
    const off = { mail: false, telegram: false };
    assert.equal(fateOf(['EMAIL'], on), 'email');
    assert.equal(fateOf(['EMAIL', 'TELEGRAM'], { mail: false, telegram: true }), 'telegram');
    assert.equal(fateOf(['EMAIL'], off), 'mail-off');
    // Строка Telegram без бота — «бот не настроен», а не «уведомлений нет».
    assert.equal(fateOf(['TELEGRAM'], off), 'telegram-off');
    assert.equal(fateOf(['TELEGRAM'], { mail: true, telegram: false }), 'telegram-off');
    assert.equal(fateOf([], on), 'none');
  });

  it('Telegram без бота: строка называет причину, а не «уведомления выключены»', () => {
    const line = workCreatedLine({ manager: 'Нечаева Ксения Ильинична', fate: 'telegram-off', files: null });
    assert.match(line, /сообщение в Telegram ему не уйдёт — бот не настроен, сообщите сами/u);
    assert.doesNotMatch(line, /выключены|ушло/u);
    const due = dueMovedLine('20 октября 2026', 'telegram-off');
    assert.match(due, /бот Telegram не настроен, сообщите ему сами/u);
    assert.doesNotMatch(due, /получит/u);
  });

  it('окно исхода — час по настоящим часам: старое действие признак не подтверждает', () => {
    const at = new Date('2026-10-24T12:00:00Z');
    assert.equal(OUTCOME_WINDOW_MS, 60 * 60 * 1000);
    assert.equal(outcomeSince(at).toISOString(), '2026-10-24T11:00:00.000Z');
    assert.equal(inOutcomeWindow(new Date('2026-10-24T11:30:00Z'), at), true);
    assert.equal(inOutcomeWindow(new Date('2026-10-24T10:59:59Z'), at), false);
    assert.equal(inOutcomeWindow(null, at), false);
    assert.equal(inOutcomeWindow(undefined, at), false);
  });

  it('перенос срока не обещает уведомления, которого не будет', () => {
    assert.equal(dueMovedLine('20 октября 2026', 'email'), 'Срок этапа перенесён на 20 октября 2026; клиент получит уведомление.');
    for (const fate of ['mail-off', 'none'] as const) {
      assert.doesNotMatch(dueMovedLine('20 октября 2026', fate), /получит/u, fate);
    }
    assert.match(dueMovedLine('20 октября 2026', 'mail-off'), /почта не настроена, сообщите ему сами/u);
  });

  it('работа заведена: менеджер, письмо ему, вложения', () => {
    assert.equal(
      workCreatedLine({ manager: 'Нечаева Ксения Ильинична', fate: 'email', files: 'lead' }),
      'Работа заведена; менеджер — Нечаева Ксения Ильинична; письмо ему ушло; вложения заявки — в «Материалах работы».',
    );
    const off = workCreatedLine({ manager: 'Нечаева Ксения Ильинична', fate: 'mail-off', files: null });
    assert.match(off, /письмо ему не уйдёт — почта не настроена, сообщите сами/u);
    assert.doesNotMatch(off, /ушло/u);
    // Сам себе менеджер — без письма.
    assert.equal(workCreatedLine({ manager: null, fate: 'none', files: 'order' }), 'Работа заведена; менеджер — вы; документ заказа — в «Материалах работы».');
  });
});

describe('действия возвращают с признаком исхода, при отказе — с причиной', () => {
  const cases: readonly (readonly [string, RegExp])[] = [
    ['approveStage', /redirect\(withOutcome\(`\/cabinet\/stages\/\$\{stageId\}`, 'done', 'approved'\)\)/u],
    ['changeStageState', /to === 'IN_APPROVAL'\s*\?\s*withOutcome\(`\/cabinet\/stages\/\$\{stageId\}`, 'done', 'approval'\)/u],
    ['moveStageDue', /redirect\(withOutcome\(`\/cabinet\/stages\/\$\{stageId\}`, 'done', 'due'\)\)/u],
    ['decideOnVersion', /decision === 'PUBLISHED' \? withOutcome\(target, 'published', versionId\) : target/u],
    ['moderateLead', /withOutcome\(`\/cabinet\/projects\/\$\{code\}`, 'created', 'lead'\)/u],
    ['createOrder', /redirect\(withOutcome\(`\/cabinet\/projects\/\$\{code\}`, 'created', '1'\)\)/u],
  ];
  for (const [name, rule] of cases) {
    it(name, () => {
      const body = action(name);
      assert.match(body, rule);
      // Отказ уходит раньше и без признака.
      assert.ok(body.indexOf('withError(') < body.indexOf('withOutcome('), `${name}: признак раньше отказа`);
    });
  }

  it('признак — с якорем строки исхода, текста в адресе нет', () => {
    assert.match(actions, /return `\$\{bare\}\$\{glue\}\$\{flag\}=\$\{encodeURIComponent\(value\)\}#\$\{OUTCOME_ANCHOR\}`;/u);
    assert.equal(OUTCOME_ANCHOR, 'action-outcome');
    assert.deepEqual([...OUTCOME_FLAGS], ['done', 'published', 'created']);
  });
});

/**
 * Якорь строки исхода не совпадает ни с одним `id` и `name` на экранах, где
 * стоит строка: прежний якорь `outcome` совпадал с полем «Итог этапа»
 * (`Field name="outcome"` даёт `id="outcome"`) — два одинаковых `id`,
 * подпись без поля, а обновление с якорем раскрывало «Поправить итог
 * этапа» и уводило окно к полю. Собираются все `id`, `name` и `scope` из
 * исходников экранов и их блоков; `Field` даёт `id` = имя или
 * `{scope}-{имя}` — проверяются все сочетания.
 */
describe('якорь строки исхода не совпадает с полями экранов', () => {
  const sources = [
    ['src', 'app', 'cabinet', 'stages', '[id]', 'page.tsx'],
    ['src', 'app', 'cabinet', 'projects', '[code]', 'page.tsx'],
    ['src', 'app', 'cabinet', 'projects', '[code]', 'materials', 'page.tsx'],
    ['src', 'app', 'cabinet', 'manage', 'leads', '[id]', 'page.tsx'],
    ['src', 'app', 'cabinet', 'manage', 'orders', 'new', 'page.tsx'],
    ['src', 'components', 'cabinet', 'ActionError.tsx'],
    ['src', 'components', 'cabinet', 'CommentList.tsx'],
    ['src', 'components', 'cabinet', 'AccessLink.tsx'],
    ['src', 'components', 'cabinet', 'LeadStatus.tsx'],
    ['src', 'components', 'cabinet', 'Shell.tsx'],
    ['src', 'components', 'cabinet', 'ui.tsx'],
  ].map((parts) => read(...parts));
  const grab = (pattern: RegExp) =>
    new Set(sources.flatMap((source) => [...source.matchAll(pattern)].map((match) => match[1]!)));
  const names = grab(/\b(?:name|field)=["'`]([^"'`$]+)["'`]/gu);
  const ids = grab(/\bid=["'`]([^"'`$]+)["'`]/gu);
  const scopes = grab(/\bscope=["'`]([^"'`$]+)["'`]/gu);

  it('имена полей собраны — проверка не пустая', () => {
    // «Итог этапа» и «Новый срок этапа» — на экране этапа.
    assert.ok(names.has('outcome'), 'не найдено поле «Итог этапа»');
    assert.ok(names.has('dueOn'));
    assert.ok(scopes.has('submit'));
    assert.ok(ids.has('main'));
  });

  it('якорь не совпадает ни с id, ни с name, ни с {scope}-{name}', () => {
    assert.ok(!names.has(OUTCOME_ANCHOR), `якорь «${OUTCOME_ANCHOR}» совпадает с именем поля`);
    assert.ok(!ids.has(OUTCOME_ANCHOR), `якорь «${OUTCOME_ANCHOR}» совпадает с id`);
    for (const scope of scopes) {
      for (const name of names) {
        assert.notEqual(`${scope}-${name}`, OUTCOME_ANCHOR, `якорь совпадает с полем ${name} области ${scope}`);
      }
    }
  });
});

describe('экраны: строка по данным, один раз, окно — к ней', () => {
  const stage = read('src', 'app', 'cabinet', 'stages', '[id]', 'page.tsx');
  const project = read('src', 'app', 'cabinet', 'projects', '[code]', 'page.tsx');
  const materials = read('src', 'app', 'cabinet', 'projects', '[code]', 'materials', 'page.tsx');

  it('экран этапа: признак подтверждается состоянием, при отказе строки нет', () => {
    assert.match(stage, /if \(errorId === undefined\) \{/u);
    // «Согласован» — у этапа, завершённого в окне исхода; «срок перенесён» —
    // по свежему событию переноса этого этапа на нынешний срок этим человеком.
    assert.match(
      stage,
      /done === 'approved' &&\s*actor\.role === 'CLIENT' &&\s*state === 'DONE' &&\s*stage\.completedAt !== null &&\s*inOutcomeWindow\(stage\.completedAt\)/u,
    );
    assert.match(stage, /done === 'approval' && forStaff && state === 'IN_APPROVAL'/u);
    assert.match(stage, /done === 'due' && forStaff && stage\.dueOn !== null && \(await dueMovedJustNow\(actor, stage\)\)/u);
    assert.match(stage, /noticeFate\(\s*stage\.project\.client\.userId,\s*'STAGE_DUE_CHANGED'/u);
    assert.match(stage, /version\.id === published && version\.moderation\?\.status === 'PUBLISHED'/u);
    assert.match(stage, /<Outcome id=\{OUTCOME_ANCHOR\}>\{outcome\}<\/Outcome>/u);
    assert.match(stage, /<DropFlag names=\{OUTCOME_FLAGS\} \/>/u);
  });

  it('карточка работы читает признак заведённой работы; клиенту и куратору строки нет', () => {
    assert.match(
      project,
      /created !== undefined &&\s*errorId === undefined &&\s*!forClient &&\s*!forExpert &&\s*inOutcomeWindow\(project\.createdAt\)/u,
    );
    // Внесённый договор в «Дальше» не зовёт.
    assert.match(project, /can\(actor, 'PAYMENT_EDIT', ref\) && \(await projectContract\(actor, project\.id\)\) === null/u);
    assert.match(project, /contractDue\s*\?\s*\{ what: 'договор'/u);
    assert.match(project, /noticeFate\(project\.managerId, 'CURATOR_ASSIGNED'/u);
    assert.match(project, /<Outcome id=\{OUTCOME_ANCHOR\}>/u);
    assert.match(project, /<DropFlag names=\{OUTCOME_FLAGS\} \/>/u);
  });

  it('«Материалы работы»: публикация', () => {
    assert.match(materials, /publishedShown \? <Outcome id=\{OUTCOME_ANCHOR\}>\{PUBLISHED_LINE\}<\/Outcome> : null/u);
  });

  it('признак убирается из адреса без перезагрузки', () => {
    const drop = read('src', 'components', 'cabinet', 'DropFlag.tsx');
    assert.match(drop, /^'use client';/u);
    assert.match(drop, /url\.searchParams\.delete\(name\)/u);
    assert.match(drop, /window\.history\.replaceState\(null, '', `\$\{url\.pathname\}\$\{url\.search\}\$\{url\.hash\}`\)/u);
  });
});

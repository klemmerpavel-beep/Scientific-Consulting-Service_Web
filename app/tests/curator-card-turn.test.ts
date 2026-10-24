/**
 * «Ваша работа» на карточке куратора говорит, чей ход и почему вернули;
 * панель хода ведёт на экран дела (решение Р-744; Р-200, Р-288, Р-329,
 * Р-527).
 *
 * Прежде колонка подписывала описание этапа «Что от вас ждут» при любом
 * ходе — и при ходе клиента, и после сдачи этапа менеджеру; причина
 * возврата менеджером стояла только в свёрнутой «Истории работы»; у панели
 * хода куратору не было кнопки на этап, и на телефоне до неё было два с
 * половиной экрана прокрутки.
 *
 * Запуск: node --test tests/curator-card-turn.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  curatorPanel,
  curatorReturnHead,
  curatorTasks,
  type CuratorStage,
  type CuratorWork,
} from '../src/lib/cabinet/curator-tasks.ts';

const APP = path.resolve(import.meta.dirname, '..');
const source = (file: string) => readFileSync(path.join(APP, file), 'utf8');

const day = (d: number) => new Date(Date.UTC(2026, 9, d));
const stage = (id: string, extra: Partial<CuratorStage> = {}): CuratorStage => ({
  id,
  title: `Этап ${id}`,
  state: 'IN_PROGRESS',
  dueOn: null,
  handedOverAt: null,
  handbackAt: null,
  returnedAt: null,
  ...extra,
});
const work = (stages: CuratorStage[], status = 'ACTIVE'): CuratorWork => ({ code: 'PD-1', title: 'Работа', status, stages });

describe('панель хода куратора (Р-744)', () => {
  it('ход за куратором у текущего этапа — кнопка на этап, подпись хода прежняя', () => {
    const tasks = curatorTasks([work([stage('a')])]);
    assert.deepEqual(curatorPanel(tasks, 'a', 'ACTIVE'), { action: null, href: '/cabinet/stages/a', label: 'Открыть этап' });
  });

  it('возврат менеджером у текущего этапа — та же кнопка', () => {
    const tasks = curatorTasks([work([stage('a', { handbackAt: day(3) })])]);
    assert.equal(tasks[0]!.kind, 'MANAGER_RETURN');
    assert.deepEqual(curatorPanel(tasks, 'a', 'ACTIVE'), { action: null, href: '/cabinet/stages/a', label: 'Открыть этап' });
  });

  it('дело не у текущего этапа — фраза называет дело', () => {
    const tasks = curatorTasks([work([stage('b')])]);
    assert.equal(curatorPanel(tasks, 'a', 'ACTIVE')?.action, 'Ход за вами: этап «Этап b» в работе.');
  });

  it('хода за куратором нет — кнопки нет: дел нет, работа приостановлена или закрыта', () => {
    assert.equal(curatorPanel([], 'a', 'ACTIVE'), null);
    const tasks = curatorTasks([work([stage('a')], 'PAUSED')]);
    assert.equal(tasks.length, 1, 'у приостановленной работы дело остаётся (Д-4)');
    assert.equal(curatorPanel(tasks, 'a', 'PAUSED'), null);
    for (const status of ['COMPLETED', 'CANCELLED']) assert.equal(curatorPanel(tasks, 'a', status), null, status);
  });

  it('дело знает свой этап', () => {
    const [task] = curatorTasks([work([stage('a', { returnedAt: day(2) })])]);
    assert.equal(task!.stageId, 'a');
  });
});

describe('строка о возврате — тем же текстом, что на экране этапа (Р-744)', () => {
  it('подписи возврата менеджером и клиентом', () => {
    assert.equal(curatorReturnHead('MANAGER_RETURN', '22 октября 2026'), 'Менеджер вернул этап 22 октября 2026');
    assert.equal(
      curatorReturnHead('CLIENT_RETURN', '22 октября 2026'),
      'Клиент вернул этап с замечаниями 22 октября 2026',
    );
    assert.equal(curatorReturnHead('STAGE', '22 октября 2026'), null);
    assert.equal(curatorReturnHead('VERSION_REJECTED', '22 октября 2026'), null);
  });

  it('экран этапа пишет те же слова', () => {
    const page = source('src/app/cabinet/stages/[id]/page.tsx');
    assert.match(page, /`Менеджер вернул этап \$\{formatDay\(stage\.handbackAt\)\}`/u);
    assert.match(page, /`Клиент вернул этап с замечаниями \$\{formatDay\(lastReturn\.createdAt\)\}`/u);
  });
});

describe('карточка работы глазами куратора (Р-744)', () => {
  const page = source('src/app/cabinet/projects/[code]/page.tsx');

  it('дела берутся по этой работе', () => {
    assert.match(page, /const myTasks = forExpert \? await curatorTasksData\(actor, project\.code\) : \[\];/u);
    assert.match(
      source('src/lib/cabinet/queries.ts'),
      /export async function curatorTasksData\(actor: Actor, code\?: string\)[\s\S]*?\.\.\.\(code === undefined \? \{\} : \{ code \}\),/u,
    );
  });

  it('«Что от вас ждут» — только при деле куратора, иначе «Описание текущего этапа»', () => {
    assert.match(page, /<Mono>\{myTasks\.length > 0 \? 'Что от вас ждут' : 'Описание текущего этапа'\}<\/Mono>/u);
    assert.doesNotMatch(page, /<Mono>Что от вас ждут<\/Mono>/u);
  });

  it('строка о возврате — с датой и причиной, причина клиента — через presentReturnText', () => {
    assert.match(page, /curatorReturnHead\('MANAGER_RETURN', formatDay\(returnStage\.handbackAt\)\), body: returnStage\.handbackReason/u);
    assert.match(page, /body: presentReturnText\(actor, clientReturn\)/u);
    assert.match(page, /\{returnNote === null \? null : \(/u);
  });

  it('панель хода получает кнопку куратора тем же свойством, что у клиента', () => {
    assert.match(page, /const curatorTurn = forExpert \? curatorPanel\(myTasks, current\?\.id \?\? null, project\.status\) : null;/u);
    assert.match(page, /actionHref=\{first === null \? \(curatorTurn\?\.href \?\? /u);
    assert.match(page, /actionLabel=\{first === null \? \(curatorTurn\?\.label \?\? /u);
  });
});

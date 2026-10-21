/**
 * Дела куратора (требование Э-04, решение Р-329): каждое дело появляется
 * при своём условии и исчезает после действия куратора; порядок — по
 * ближайшему сроку этапа, дела без срока — в конце; этап «Не начат»,
 * сданный этап и закрытая работа дел не дают.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { curatorTasks, type CuratorStage, type CuratorWork } from '../src/lib/cabinet/curator-tasks.ts';

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
const work = (code: string, stages: CuratorStage[], status = 'ACTIVE'): CuratorWork => ({
  code,
  title: `Работа ${code}`,
  status,
  stages,
});

describe('дела куратора по этапам', () => {
  it('«В работе» и не сдан — дело; «Не начат» и сданный — нет', () => {
    const tasks = curatorTasks([
      work('PD-1', [stage('a'), stage('b', { state: 'NOT_STARTED' }), stage('c', { handedOverAt: day(2) })]),
    ]);
    assert.deepEqual(
      tasks.map((task) => [task.kind, task.href]),
      [['STAGE', '/cabinet/stages/a']],
    );
    assert.equal(tasks[0]!.label, 'Этап «Этап a» в работе');
    assert.equal(tasks[0]!.work, 'Работа PD-1');
  });

  it('возврат менеджером и клиентом — свои подписи; возврат менеджером главнее', () => {
    const tasks = curatorTasks([
      work('PD-1', [
        stage('m', { handbackAt: day(3) }),
        stage('c', { returnedAt: day(3) }),
        stage('both', { handbackAt: day(4), returnedAt: day(3) }),
      ]),
    ]);
    assert.deepEqual(
      tasks.map((task) => task.kind),
      ['MANAGER_RETURN', 'CLIENT_RETURN', 'MANAGER_RETURN'],
    );
    assert.equal(tasks[1]!.label, 'Клиент вернул этап «Этап c» с замечаниями');
  });

  it('сдача этапа закрывает дело', () => {
    const before = curatorTasks([work('PD-1', [stage('a', { returnedAt: day(3) })])]);
    const after = curatorTasks([work('PD-1', [stage('a', { returnedAt: day(3), handedOverAt: day(5) })])]);
    assert.equal(before.length, 1);
    assert.equal(after.length, 0);
  });

  it('приостановленная работа дела сохраняет, закрытая — нет (Д-4)', () => {
    const tasks = curatorTasks([
      work('PD-P', [stage('p')], 'PAUSED'),
      work('PD-C', [stage('c')], 'COMPLETED'),
      work('PD-X', [stage('x')], 'CANCELLED'),
    ]);
    assert.deepEqual(tasks.map((task) => task.code), ['PD-P']);
  });

  it('порядок — по ближайшему сроку, без срока — в конце, в порядке работ', () => {
    const tasks = curatorTasks([
      work('PD-1', [stage('late', { dueOn: day(20) }), stage('none')]),
      work('PD-2', [stage('soon', { dueOn: day(10) }), stage('none2')]),
    ]);
    assert.deepEqual(
      tasks.map((task) => task.href.split('/').at(-1)),
      ['soon', 'late', 'none', 'none2'],
    );
  });

  it('длинное название сокращается', () => {
    const [task] = curatorTasks([work('PD-1', [stage('a', { title: 'Обзор '.repeat(30) })])]);
    assert.ok(task!.label.length < 80);
    assert.match(task!.label, /…»/u);
  });
});

describe('дела «отклонено менеджером»', () => {
  const base = { materialTitle: 'Глава 2', code: 'PD-1', stage: { id: 's1', dueOn: day(12) } };

  it('отклонённая последняя версия — дело; новая версия того же материала закрывает', () => {
    const rejected = { ...base, versionId: 'v1', materialId: 'm1', number: 1, status: 'REJECTED' };
    const open = curatorTasks([work('PD-1', [])], [rejected]);
    assert.deepEqual(open.map((task) => [task.kind, task.href, task.action]), [
      ['VERSION_REJECTED', '/cabinet/stages/s1', 'Открыть этап'],
    ]);
    assert.match(open[0]!.label, /вашу версию v1: «Глава 2»/u);
    const fixed = curatorTasks(
      [work('PD-1', [])],
      [rejected, { ...rejected, versionId: 'v2', number: 2, status: 'PENDING' }],
    );
    assert.equal(fixed.length, 0);
  });

  it('версия материала вне этапа ведёт на «Материалы работы»', () => {
    const [task] = curatorTasks(
      [work('PD-1', [])],
      [{ ...base, stage: null, versionId: 'v1', materialId: 'm1', number: 1, status: 'REJECTED' }],
    );
    assert.equal(task!.href, '/cabinet/projects/PD-1/materials');
    assert.equal(task!.action, 'Открыть материалы');
    assert.equal(task!.dueOn, null);
  });

  it('отклонённое последнее замечание — дело; новое замечание к той же версии закрывает', () => {
    const rejected = { ...base, versionId: 'v1', materialId: 'm1', createdAt: day(3), status: 'REJECTED', versionRejected: false };
    assert.equal(curatorTasks([work('PD-1', [])], [], [rejected])[0]!.kind, 'COMMENT_REJECTED');
    const fixed = curatorTasks([work('PD-1', [])], [], [rejected, { ...rejected, createdAt: day(4), status: 'PENDING' }]);
    assert.equal(fixed.length, 0);
  });

  it('замечание к новой версии материала закрывает дело по прежней (Р-647)', () => {
    // Форма замечания стоит только у новейшей версии: к v1 после выхода v2
    // замечание оставить негде.
    const rejected = { ...base, versionId: 'v1', materialId: 'm1', createdAt: day(3), status: 'REJECTED', versionRejected: false };
    const fixed = curatorTasks(
      [work('PD-1', [])],
      [],
      [rejected, { ...rejected, versionId: 'v2', createdAt: day(4), status: 'PENDING' }],
    );
    assert.deepEqual(fixed.map((task) => task.kind), []);
    // Замечание к другому материалу дела не закрывает.
    const other = curatorTasks(
      [work('PD-1', [])],
      [],
      [rejected, { ...rejected, versionId: 'v9', materialId: 'm2', createdAt: day(4), status: 'PENDING' }],
    );
    assert.deepEqual(other.map((task) => task.kind), ['COMMENT_REJECTED']);
  });

  it('пояснение к неопубликованной версии — одно дело, по версии (Р-646)', () => {
    const version = { ...base, versionId: 'v2', materialId: 'm1', number: 2, status: 'REJECTED' };
    const note = { ...base, versionId: 'v2', materialId: 'm1', createdAt: day(4), status: 'REJECTED', versionRejected: true };
    assert.deepEqual(curatorTasks([work('PD-1', [])], [version], [note]).map((task) => task.kind), ['VERSION_REJECTED']);
    // Оно же — последнее замечание к материалу: отклонённое прежде к v1 не
    // возвращается делом.
    const earlier = { ...note, versionId: 'v1', createdAt: day(3), versionRejected: false };
    assert.deepEqual(
      curatorTasks([work('PD-1', [])], [version], [earlier, note]).map((task) => task.kind),
      ['VERSION_REJECTED'],
    );
  });

  it('по закрытой работе отклонённое делом не считается', () => {
    const rejected = { ...base, versionId: 'v1', materialId: 'm1', number: 1, status: 'REJECTED' };
    assert.equal(curatorTasks([work('PD-1', [], 'COMPLETED')], [rejected]).length, 0);
  });
});

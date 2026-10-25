/**
 * Плашки «Назначенных работ» показывают дело куратора, «Ещё дел: N» ведёт
 * к делам (решение Р-730). Прежде ответ называл одно дело, остальные
 * стояли числом без ссылки; на плашках строки дела не было, а акцентную
 * рамку получала плашка, где ход за клиентом (Р-206: куратору чужие
 * действия не нужны); две работы «Сопровождение диссертационного
 * исследования» в ответе не различались. Код работы на экран не выводится
 * (Р-189); дела считает `curatorTasks` (Р-329).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { curatorTasks, moreTasksAnchor, type CuratorWork } from '../src/lib/cabinet/curator-tasks.ts';

const page = readFileSync(path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'projects', 'page.tsx'), 'utf8');

const day = (n: number) => new Date(Date.UTC(2026, 8, n));
const work = (code: string, title: string, client: string, stageId: string, extra: Partial<CuratorWork> = {}): CuratorWork => ({
  code,
  title,
  status: 'ACTIVE',
  client,
  stages: [
    { id: stageId, title: `Этап ${stageId}`, state: 'IN_PROGRESS', dueOn: day(10), handedOverAt: null, handbackAt: null, returnedAt: null },
  ],
  ...extra,
});

describe('одноимённые работы различаются заказчиком (Р-730)', () => {
  it('у дела — заказчик и пометка, что название не единственное', () => {
    const tasks = curatorTasks([
      work('PD-1', 'Сопровождение диссертационного исследования', 'Заказчик А.4', 'a'),
      work('PD-2', 'Сопровождение диссертационного исследования', 'Заказчик И.', 'b'),
      work('PD-3', 'Научные публикации и патентные материалы', 'Заказчик А.4', 'c'),
    ]);
    const byCode = new Map(tasks.map((task) => [task.code, task]));
    assert.equal(byCode.get('PD-1')?.namesake, true);
    assert.equal(byCode.get('PD-1')?.client, 'Заказчик А.4');
    assert.equal(byCode.get('PD-2')?.namesake, true);
    assert.equal(byCode.get('PD-3')?.namesake, false);
  });

  it('закрытая работа с тем же названием одноимённой не делает', () => {
    const tasks = curatorTasks([
      work('PD-1', 'Сопровождение диссертационного исследования', 'Заказчик А.4', 'a'),
      work('PD-2', 'Сопровождение диссертационного исследования', 'Заказчик И.', 'b', { status: 'COMPLETED' }),
    ]);
    assert.equal(tasks[0]?.namesake, false);
  });
});

describe('«Ещё дел: N» ведёт к плашке с делом другой работы (Р-730)', () => {
  const tasks = (...codes: string[]) => codes.map((code) => ({ code }));

  it('главное дело названо в ответе — якорь у первой плашки с делом другой работы', () => {
    assert.equal(moreTasksAnchor(['PD-1', 'PD-2', 'PD-3'], tasks('PD-1', 'PD-3', 'PD-2')), 'PD-2');
    assert.equal(moreTasksAnchor(['PD-9', 'PD-2', 'PD-1'], tasks('PD-1', 'PD-2')), 'PD-2');
  });

  it('других работ с делом на странице нет — первая плашка с делом', () => {
    assert.equal(moreTasksAnchor(['PD-1', 'PD-2'], tasks('PD-1', 'PD-1')), 'PD-1');
    assert.equal(moreTasksAnchor(['PD-2', 'PD-1'], tasks('PD-1', 'PD-3')), 'PD-1');
  });

  it('плашек с делом на странице нет — якоря нет', () => {
    assert.equal(moreTasksAnchor(['PD-5'], tasks('PD-1', 'PD-2')), null);
    assert.equal(moreTasksAnchor(['PD-5'], []), null);
  });
});

describe('«Назначенные работы»: дело на плашке и ссылка «Ещё дел» (Р-730)', () => {
  it('ответ у одноимённой работы — срок первым, затем заказчик и работа; «Ещё дел: N» — ссылкой', () => {
    const start = page.indexOf('const mainDue =');
    const answer = page.slice(start, page.indexOf('.join(\' \')', start));
    assert.match(answer, /const namesake = main !== null && main\.namesake && main\.client !== null;/u);
    // Срок стоит до заказчика: с заказчиком перед сроком пояснение на 390 и
    // 360 px занимало четыре строки, и срок срезался (Р-210).
    assert.match(
      answer,
      /namesake \? null : `Работа «\$\{clip\(main\.work, 60\)\}»\.`,\s*mainDue,\s*namesake \? `\$\{main\.client\}, работа «\$\{clip\(main\.work, 60\)\}»\.` : null,/u,
    );
    // Ссылка — рядом с кнопкой: в конце пояснения она уходила за срез (Р-210).
    assert.match(page, /className="cab-mark"\s+href="#curator-task"/u);
    assert.match(page, /\{`Ещё дел: \$\{tasks\.length - 1\}`\}\s*<\/a>/u);
    assert.match(page, /const taskAnchor = moreTasksAnchor\(\s*projects\.map\(\(project\) => project\.code\),\s*tasks,\s*\);/u);
    assert.match(page, /id=\{project\.code === taskAnchor \? 'curator-task' : undefined\}/u);
  });

  it('строка дела — из `curatorTasks`: подпись и срок ссылкой на экран дела', () => {
    assert.match(page, /const task = forExpert \? \(taskOf\.get\(project\.code\) \?\? null\) : null;/u);
    assert.match(page, /<a className="cab-mark" href=\{task\.href\}>\s*\{task\.label\}\s*<\/a>/u);
    assert.match(page, /\{task\.dueOn === null \? null : <span>\{`— до \$\{formatDate\(task\.dueOn\)\}`\}<\/span>\}/u);
  });

  it('сданный этап — «Этап сдан {дата}: ход за менеджером»', () => {
    assert.match(page, /stage\.state === 'IN_PROGRESS' && stage\.handedOverAt !== null/u);
    assert.match(page, /`Этап сдан \$\{formatDay\(handed\.handedOverAt\)\}: ход за менеджером`/u);
  });

  it('рамка куратору — только у плашки с его делом; прочим — как прежде', () => {
    assert.match(page, /const accent = forExpert \? task !== null : waiting !== null;/u);
    assert.match(page, /\.\.\.\(accent \? \{ borderColor: 'var\(--pd-accent-edge\)' \} : \{\}\)/u);
  });

  it('кода работы в тексте дела нет', () => {
    assert.doesNotMatch(page, /task\.code\}/u);
  });
});

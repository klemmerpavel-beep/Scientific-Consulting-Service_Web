/**
 * Пояснение в ответе «Сводки» (решения Р-207, Р-216, Р-695): сорванные
 * сроки и старший из них, действующие работы, что ждёт публикации,
 * заявки. Руководителю сорванные сроки — по всей практике, как и
 * «Действующих работ» рядом; плашки «Мои» — по своим работам (Р-337).
 * Числа на настоящей базе — в `summary-answer.db.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { answerDetail } from '../src/lib/cabinet/summary-answer.ts';

const SRC = path.join(import.meta.dirname, '..', 'src');
const page = readFileSync(path.join(SRC, 'app', 'cabinet', 'manage', 'page.tsx'), 'utf8');

const AT = new Date(Date.UTC(2026, 9, 23, 9));
const day = (d: number) => new Date(Date.UTC(2026, 9, d));
const quiet = { comments: 0, versions: 0, leads: 0, at: AT };

describe('пояснение ответа «Сводки» (Р-207, Р-216)', () => {
  it('сорванные этапы и работы складываются, старший — самый давний из тех и других', () => {
    const detail = answerDetail({
      light: {
        overdue: [{ title: 'Глава 2', dueOn: day(20) }],
        lateWorks: [{ title: 'Работа из книги', dueOn: day(13) }],
      },
      live: 10,
      ...quiet,
    });
    assert.equal(detail, 'Сорвано сроков этапов и работ — 2; старший — «Работа из книги», 10 дней. Действующих работ — 10.');
  });

  it('без сорванных сроков, публикаций и заявок — только действующие работы', () => {
    assert.equal(answerDetail({ light: { overdue: [], lateWorks: [] }, live: 3, ...quiet }), 'Действующих работ — 3.');
  });

  it('без права на деньги действующих не называет; пустое пояснение — `null`', () => {
    assert.equal(answerDetail({ light: { overdue: [], lateWorks: [] }, live: null, ...quiet }), null);
  });

  it('публикации и заявки — после сроков и работ', () => {
    assert.equal(
      answerDetail({ light: { overdue: [], lateWorks: [] }, live: null, comments: 2, versions: 1, leads: 1, at: AT }),
      'Ждут публикации: 2 замечания и 1 версия куратора. 1 заявка ждёт разбора.',
    );
    assert.equal(
      answerDetail({ light: { overdue: [], lateWorks: [] }, live: null, comments: 0, versions: 0, leads: 5, at: AT }),
      '5 заявок ждут разбора.',
    );
  });
});

describe('«Сводка» берёт для ответа светофор практики (Р-695)', () => {
  it('пояснение собирает `answerDetail` по `practiceLight`, а не по набору «Моих»', () => {
    assert.match(page, /const practice = await practiceLight\(actor, sources\);/u);
    assert.match(page, /answerDetail\(\{\s*light: practice,/u);
    assert.doesNotMatch(page, /light\.overdue\.length \+ light\.lateWorks\.length/u);
  });

  it('плашки «Мои» и «Контроль» — по-прежнему из частей набора (Р-337)', () => {
    assert.match(page, /const parts = attentionParts\(sources\);/u);
    assert.match(page, /\.\.\.parts\.overdue\.map\(/u);
  });
});

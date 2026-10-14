/**
 * «Разбор практики» на «Сводке» (план по образцу, К-2, решение Р-586):
 * три группы, их числа, главные строки и переходы.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { practiceReview } from '../src/lib/cabinet/practice-review.ts';

const line = (title: string, href = `/x/${title}`) => ({ title, note: `пометка ${title}`, href });

describe('«Разбор практики»', () => {
  it('три группы по порядку: «Сделать», «Наблюдать», «Возможность»', () => {
    const groups = practiceReview({ act: [], watch: [], chance: { count: 0, month: null } });
    assert.deepEqual(
      groups.map((group) => [group.key, group.label]),
      [
        ['act', 'Сделать'],
        ['watch', 'Наблюдать'],
        ['chance', 'Возможность'],
      ],
    );
  });

  it('число «Сделать» — все дела «Требует внимания», главная строка — первое дело', () => {
    const [act] = practiceReview({ act: [line('А'), line('Б'), line('В')], watch: [], chance: { count: 0, month: null } });
    assert.equal(act!.count, 3);
    assert.deepEqual(act!.first, line('А'));
    assert.deepEqual(act!.all, { href: '#attention', label: 'Все дела' });
  });

  it('«Наблюдать» — сроки недели, ближайший первым, переход к блоку недели', () => {
    const [, watch] = practiceReview({ act: [], watch: [line('Срок 1'), line('Срок 2')], chance: { count: 0, month: null } });
    assert.equal(watch!.count, 2);
    assert.equal(watch!.first!.title, 'Срок 1');
    assert.equal(watch!.all!.href, '#week');
  });

  it('«Возможность» — неотмеченные рекомендации, первой строкой — рекомендация месяца', () => {
    const month = { title: 'Подготовить продвижение «ВКР»', href: '/cabinet/manage/recommendations/calendar' };
    const [, , chance] = practiceReview({ act: [], watch: [], chance: { count: 4, month } });
    assert.equal(chance!.count, 4);
    assert.deepEqual(chance!.first, { title: month.title, note: 'рекомендация месяца', href: month.href });
    assert.equal(chance!.all!.href, '/cabinet/manage/recommendations');
  });

  it('пустая группа — ноль, строка о пустоте и без перехода к перечню, которого нет', () => {
    const groups = practiceReview({ act: [], watch: [], chance: { count: 0, month: null } });
    for (const group of groups) {
      assert.equal(group.count, 0);
      assert.equal(group.first, null);
      assert.equal(group.all, null);
      assert.ok(group.empty.length > 0);
    }
  });
});

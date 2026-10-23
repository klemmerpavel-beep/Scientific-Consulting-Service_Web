/**
 * Одно слово для отменённой работы (улучшение УК-10, решение Р-366):
 * строка перечня работ, метка состояния и история называют её
 * «отменена», а не «остановлена». Один глагол для Telegram (УК-17, Р-368).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { PROJECT_STATUS_LABEL } from '../src/lib/cabinet/project-status.ts';

const page = readFileSync(path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'projects', 'page.tsx'), 'utf8');

describe('отменённая работа — одним словом (УК-10)', () => {
  it('метка состояния — «Отменена»', () => {
    assert.equal(PROJECT_STATUS_LABEL.CANCELLED, 'Отменена');
  });
  it('строка перечня работ — «Работа отменена», без «остановлена»', () => {
    assert.ok(page.includes("'Работа отменена.'"));
    assert.ok(!page.includes('Работа остановлена'));
  });
});

describe('один глагол для Telegram (УК-17, Р-368)', () => {
  const read = (...parts: string[]) => readFileSync(path.join(import.meta.dirname, '..', 'src', ...parts), 'utf8');
  it('настройки, первый вход и ответ бота — «Подключить Telegram»', () => {
    for (const text of [read('app', 'cabinet', 'settings', 'page.tsx'), read('app', 'api', 'telegram', 'route.ts'), page]) {
      assert.ok(text.includes('Подключить Telegram'));
      assert.ok(!text.includes('Привязать Telegram'));
    }
  });
});

describe('корректировка суммы — и руководителю (УМ-07, Р-376)', () => {
  it('строка корректировки не скрыта от того, кто ведёт оплаты', () => {
    const payments = readFileSync(
      path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'projects', '[code]', 'payments', 'page.tsx'),
      'utf8',
    );
    assert.doesNotMatch(payments, /mayEdit \|\| money\.adjustment === 0n/u);
    // Сторнированное снова к оплате и в корректировку не входит (Р-450).
    assert.match(payments, /'списано по траншам ниже'/u);
    assert.doesNotMatch(payments, /сторнировано по траншам ниже/u);
  });

  it('списанное сверх договора названо под корректировкой числом (Р-700)', async () => {
    // Договор 300 000, оплачено 100 000, списан транш 250 000: корректировка —
    // 200 000 (в пределах остатка, Р-530), а строка транша — «списан
    // 250 000». Подпись называет разницу, чтобы плитка и транш не спорили.
    const { formatAmount, receivableOf, writtenOffBeyond } = await import('../src/lib/cabinet/money.ts');
    const total = 30_000_000n;
    const tranches = [
      { id: 'paid', amount: 10_000_000n, status: 'PAID', plannedDate: new Date('2026-03-01T00:00:00Z') },
      { id: 'off', amount: 25_000_000n, status: 'WRITTEN_OFF', plannedDate: new Date('2026-06-01T00:00:00Z') },
    ];
    const adjustment = total - 10_000_000n - receivableOf('ACTIVE', total, tranches);
    assert.equal(formatAmount(adjustment), formatAmount(20_000_000n));
    assert.equal(formatAmount(writtenOffBeyond(adjustment, tranches)), formatAmount(5_000_000n));
    assert.match(formatAmount(writtenOffBeyond(adjustment, tranches)), /^50\s000\s₽$/u);
    // Без превышения — прежняя подпись: разницы нет.
    const within = [tranches[0]!, { ...tranches[1]!, amount: 5_000_000n }];
    assert.equal(writtenOffBeyond(total - 10_000_000n - receivableOf('ACTIVE', total, within), within), 0n);

    const payments = readFileSync(
      path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'projects', '[code]', 'payments', 'page.tsx'),
      'utf8',
    );
    assert.match(payments, /writtenOffBeyond\(money\.adjustment, contract\.tranches\)/u);
    assert.match(payments, /списано по траншам ниже в пределах остатка договора; ещё \$\{formatAmount\(beyond\)\} сверх договора долгом не были/u);
  });
});

describe('вознаграждение куратора без начислений (Р-701)', () => {
  const payments = readFileSync(
    path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'projects', '[code]', 'payments', 'page.tsx'),
    'utf8',
  );
  it('не пишет «маржа равна сумме договора»: маржа уже показана числом', () => {
    assert.doesNotMatch(payments, /маржа равна/u);
    assert.doesNotMatch(payments, /У исторических проектов/u);
  });
  it('текст — по тому, указан ли куратор у работы', () => {
    const empty = /payouts\.length === 0 \? \(([\s\S]*?)\) : \(/u.exec(payments)?.[1] ?? '';
    assert.match(empty, /project\.expertId !== null/u);
    assert.match(empty, /Начислений нет: вознаграждение куратора ещё не начислено и в марже выше не учтено\./u);
    assert.match(empty, /Начислений нет: куратор у работы не указан\./u);
  });
});

describe('причина приостановки в шапке карточки (УК-13, Р-379)', async () => {
  const { pauseReasonOf } = await import('../src/lib/cabinet/project-status.ts');
  const events = [
    { kind: 'PROJECT_STATUS_CHANGED', payload: { from: 'ACTIVE', to: 'PAUSED', reason: 'Ждём решения диссовета' } },
    { kind: 'PROJECT_STATUS_CHANGED', payload: { from: 'PAUSED', to: 'ACTIVE' } },
    { kind: 'PROJECT_STATUS_CHANGED', payload: { from: 'ACTIVE', to: 'PAUSED', reason: 'Старая причина' } },
  ];
  it('последняя причина — клиенту и сотрудникам', () => {
    assert.equal(pauseReasonOf('PAUSED', events, false), 'Ждём решения диссовета');
  });
  it('куратору и у не приостановленной работы — ничего', () => {
    assert.equal(pauseReasonOf('PAUSED', events, true), null);
    assert.equal(pauseReasonOf('ACTIVE', events, false), null);
  });
});

describe('«Мои работы» с карточки клиента — на перечень (УК-20, Р-380)', async () => {
  const { soleWorkTarget } = await import('../src/lib/cabinet/nav.ts');
  it('карточка клиента ведёт пункт меню на перечень с отбором «Все»', () => {
    const card = readFileSync(
      path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'projects', '[code]', 'page.tsx'),
      'utf8',
    );
    assert.match(card, /listHref=\{forClient \? '\/cabinet\/projects\?state=all' : undefined\}/u);
  });
  it('с отбором в адресе перечень не уводит на единственную карточку', () => {
    const rows = [{ code: 'PD-1', status: 'ACTIVE' }];
    assert.equal(soleWorkTarget({ role: 'CLIENT', welcomeOpen: false, asked: false, all: 1, rows }), '/cabinet/projects/PD-1');
    assert.equal(soleWorkTarget({ role: 'CLIENT', welcomeOpen: false, asked: true, all: 1, rows }), null);
  });
});

describe('смена куратора у сданного этапа — предупреждение (УЭ-07, Р-384)', () => {
  it('у формы куратора названы сданные этапы и что пометка погаснет', () => {
    const card = readFileSync(
      path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'projects', '[code]', 'page.tsx'),
      'utf8',
    );
    const form = card.slice(card.indexOf('<Form action={setExpert}>'), card.indexOf('</Form>', card.indexOf('<Form action={setExpert}>')));
    assert.match(form, /stage\.handedOverAt !== null/u);
    assert.match(form, /пометка сдачи погаснет/u);
  });
});

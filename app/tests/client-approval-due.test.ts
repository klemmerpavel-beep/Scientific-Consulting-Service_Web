/**
 * Клиенту у этапа на согласовании — одна дата, срок согласования
 * (решение Р-741; Т-15, Р-290, Р-650).
 *
 * Прежде шкала карточки писала «срок этапа — 3 октября 2026» под фразой
 * «Срок согласования — до 28 сентября 2026», а шапка экрана этапа — «срок —
 * 3 октября 2026»: клиент ориентировался на позднюю дату и пропускал срок
 * ответа. Практике шапка и шкала не меняются.
 *
 * Запуск: node --test tests/client-approval-due.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { approvalDueLabel, clientApprovalDue } from '../src/lib/cabinet/approval-text.ts';

const APP = path.resolve(import.meta.dirname, '..');
const source = (file: string) => readFileSync(path.join(APP, file), 'utf8');

const day = new Date(Date.UTC(2026, 8, 28));

describe('какой срок назвать у этапа (Р-741)', () => {
  it('клиенту у этапа на согласовании — срок согласования', () => {
    assert.equal(clientApprovalDue({ state: 'IN_APPROVAL', approvalDueOn: day }, true), day);
    assert.equal(approvalDueLabel('28 сентября 2026'), 'согласовать до 28 сентября 2026');
  });

  it('практике — срок этапа, как прежде', () => {
    assert.equal(clientApprovalDue({ state: 'IN_APPROVAL', approvalDueOn: day }, false), null);
  });

  it('без срока согласования и у этапа в другом состоянии — срок этапа', () => {
    assert.equal(clientApprovalDue({ state: 'IN_APPROVAL', approvalDueOn: null }, true), null);
    for (const state of ['NOT_STARTED', 'IN_PROGRESS', 'AWAITING_CLIENT', 'DONE']) {
      assert.equal(clientApprovalDue({ state, approvalDueOn: day }, true), null, state);
    }
  });
});

describe('шкала карточки и шапка этапа берут срок согласования (Р-741)', () => {
  it('шкала: срок согласования стоит вместо строки «срок этапа», а не рядом с ней', () => {
    const ui = source('src/components/cabinet/ui.tsx');
    const start = ui.indexOf('export function ProgressPanel(');
    const body = ui.slice(start, ui.indexOf('\nexport function Disclosure', start));
    assert.match(
      body,
      /\{approvalDueOn != null \? \(\s*<span>\s*\{approvalDueLabel\(approvalDueOn\)\}[\s\S]*?\) : stageDueOn == null \? null : \(\s*<span>\s*срок этапа — \{stageDueOn\}/u,
    );
  });

  it('карточка работы передаёт шкале срок согласования только клиенту', () => {
    const page = source('src/app/cabinet/projects/[code]/page.tsx');
    assert.match(page, /const approvalDue = current === null \? null : clientApprovalDue\(current, forClient\);/u);
    assert.match(page, /approvalDueOn=\{formatDate\(approvalDue\)\}/u);
  });

  it('шапка экрана этапа: клиенту на согласовании — «согласовать до», иначе «срок —»', () => {
    const page = source('src/app/cabinet/stages/[id]/page.tsx');
    assert.match(page, /const approvalDue = clientApprovalDue\(stage, actor\.role === 'CLIENT'\);/u);
    assert.match(
      page,
      /aside=\{\s*approvalDue !== null\s*\? `\$\{approvalDueLabel\(formatDay\(approvalDue\)\)\}[\s\S]*?: stage\.dueOn === null\s*\? null\s*: `срок — \$\{formatDate\(stage\.dueOn\)\}/u,
    );
  });
});

describe('план работ клиента — та же одна дата (Р-741)', () => {
  it('у этапа на согласовании пункт плана клиента пишет «согласовать до», а не «срок»', async () => {
    const { readFileSync } = await import('node:fs');
    const { default: path } = await import('node:path');
    const src = path.join(import.meta.dirname, '..', 'src');
    const card = readFileSync(path.join(src, 'app', 'cabinet', 'projects', '[code]', 'page.tsx'), 'utf8');
    const ui = readFileSync(path.join(src, 'components', 'cabinet', 'ui.tsx'), 'utf8');
    assert.match(card, /dueText: \(\(\) => \{\s*const approval = clientApprovalDue\(stage, forClient\);/u);
    assert.match(ui, /\{item\.dueText \? ` · \$\{item\.dueText\}` : item\.dueOn \? ` · срок \$\{item\.dueOn\}` : ''\}/u);
  });
});

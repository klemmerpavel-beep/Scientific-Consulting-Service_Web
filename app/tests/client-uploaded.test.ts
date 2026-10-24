/**
 * После загрузки файла клиент не читает «От вас ждут материалы… стоит,
 * пока их нет» (решение Р-728). Версия клиента, приложенная после
 * перехода этапа в «Ждём ваших данных» (`Stage.awaitingClientSince`),
 * меняет формулировку на «Вы приложили материалы к этапу «…» {день}» на
 * «Моих работах», карточке, плашке и экране этапа; такие дела идут после
 * дел без загрузки. Состояние этапа, права и уведомления не меняются.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { clip } from '../src/lib/cabinet/text-clip.ts';
import {
  UPLOADED_NEXT,
  UPLOADED_TITLE_MAX,
  clientUploadedAt,
  uploadedLast,
  uploadedLine,
} from '../src/lib/cabinet/works-answer.ts';

const SRC = path.join(import.meta.dirname, '..', 'src');
const read = (...parts: string[]) => readFileSync(path.join(SRC, ...parts), 'utf8');

const at = (iso: string) => new Date(iso);
const since = at('2026-09-05T09:00:00Z');

describe('день загрузки клиента после просьбы менеджера (Р-728)', () => {
  it('последняя версия после перехода в «Ждём ваших данных» — её день', () => {
    const day = clientUploadedAt({ state: 'AWAITING_CLIENT', awaitingClientSince: since }, [
      at('2026-09-01T10:00:00Z'),
      at('2026-09-20T10:00:00Z'),
      at('2026-09-10T10:00:00Z'),
    ]);
    assert.equal(day?.toISOString(), '2026-09-20T10:00:00.000Z');
  });

  it('версия до перехода формулировку не меняет', () => {
    assert.equal(clientUploadedAt({ state: 'AWAITING_CLIENT', awaitingClientSince: since }, [at('2026-09-04T10:00:00Z')]), null);
  });

  it('этап в работе или на согласовании, а также без момента перехода — без загрузки', () => {
    assert.equal(clientUploadedAt({ state: 'IN_PROGRESS', awaitingClientSince: since }, [at('2026-09-20T10:00:00Z')]), null);
    assert.equal(clientUploadedAt({ state: 'IN_APPROVAL', awaitingClientSince: null }, [at('2026-09-20T10:00:00Z')]), null);
    assert.equal(clientUploadedAt({ state: 'AWAITING_CLIENT', awaitingClientSince: null }, [at('2026-09-20T10:00:00Z')]), null);
  });

  it('дела с загрузкой — после дел без неё, внутри — прежний порядок', () => {
    const rows = [
      { id: 'a', clientUploadedAt: at('2026-09-20T10:00:00Z') },
      { id: 'b', clientUploadedAt: null },
      { id: 'c', clientUploadedAt: null },
      { id: 'd', clientUploadedAt: at('2026-09-21T10:00:00Z') },
    ];
    assert.deepEqual(uploadedLast(rows).map((row) => row.id), ['b', 'c', 'a', 'd']);
  });

  it('формулировка — словами задачи, без «стоит, пока их нет»', () => {
    const text = `${uploadedLine('Апробация', '20 сентября 2026')}. ${UPLOADED_NEXT}`;
    assert.equal(
      text,
      'Вы приложили материалы к этапу «Апробация» 20 сентября 2026. Менеджер проверит и переведёт этап в работу; если нужно что-то ещё — напишет в переписке.',
    );
    assert.doesNotMatch(text, /стоит, пока/u);
  });

  it('фраза ответа не длиннее 90 знаков при любом названии этапа (Р-210)', () => {
    // Самый длинный день — «29 сентября 2026»; название в ответе сокращается.
    const day = '29 сентября 2026';
    for (const title of [
      'Подготовка автореферата и комплекта документов к предзащите',
      'Расчётная часть диссертационного исследования: первая редакция главы',
      'а'.repeat(120),
    ]) {
      const lead = `${uploadedLine(clip(title, UPLOADED_TITLE_MAX), day)}.`;
      assert.ok(lead.length <= 90, `${lead.length}: ${lead}`);
    }
  });
});

describe('экраны клиента берут день загрузки (Р-728)', () => {
  it('выборка дел — с днём загрузки; «без загрузки сначала» — только у клиента', () => {
    const queries = read('lib', 'cabinet', 'queries.ts');
    const body = queries.slice(queries.indexOf('export async function pendingActions'), queries.indexOf('export const LEAD_PAGE_SIZE'));
    assert.match(body, /uploadedBy: \{ role: 'CLIENT' \}/u);
    assert.match(body, /clientUploadedAt: clientUploadedAt\(/u);
    // У менеджера, руководителя и куратора плашки и «Требует внимания» —
    // по сроку, как прежде.
    assert.match(body, /return actor\.role === 'CLIENT' \? uploadedLast\(rows\) : rows;/u);
    assert.equal(body.match(/uploadedLast\(/gu)?.length, 1);
  });

  it('«Мои работы»: ответ, плашка и блок «Сейчас от вас требуется»', () => {
    const page = read('app', 'cabinet', 'projects', 'page.tsx');
    assert.match(page, /first !== null && first\.clientUploadedAt !== null\s*\?\s*\{/u);
    assert.match(page, /lead: `\$\{uploadedLine\(clip\(first\.title, UPLOADED_TITLE_MAX\), formatDay\(first\.clientUploadedAt\)\)\}\.`,/u);
    assert.match(page, /detail: UPLOADED_NEXT,/u);
    assert.match(page, /uploaded === null \? waitingLine\(waiting\) : uploadedLine\(waiting\.title, formatDay\(uploaded\)\)/u);
    assert.match(page, /forClient && stage\.clientUploadedAt !== null\s*\?\s*uploadedLine\(/u);
  });

  it('карточка работы и экран этапа', () => {
    const card = read('app', 'cabinet', 'projects', '[code]', 'page.tsx');
    assert.match(card, /first\.clientUploadedAt !== null\s*\?[\s\S]{0,200}`\$\{uploadedLine\(first\.title, formatDay\(first\.clientUploadedAt\)\)\}\. \$\{UPLOADED_NEXT\}`/u);
    const stage = read('app', 'cabinet', 'stages', '[id]', 'page.tsx');
    assert.match(stage, /actor\.role === 'CLIENT'\s*\?\s*clientUploadedAt\(/u);
    assert.match(stage, /\{`\$\{uploadedLine\(stage\.title, formatDay\(uploadedByClient\)\)\}\. \$\{UPLOADED_NEXT\}`\}/u);
  });
});

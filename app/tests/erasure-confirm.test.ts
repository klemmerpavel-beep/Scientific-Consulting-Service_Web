/**
 * «Исполнить» требование об удалении — второй формой (решение Р-716, по
 * образцу «Удалить год», Р-346).
 *
 * В строке требования стояла форма исполнения с одной кнопкой: одно
 * нажатие необратимо затирало данные. Теперь «Исполнить» в строке — ссылка
 * на подтверждение `?confirm=<требование>`, а форма исполнения выводится
 * только в подтверждении — с карточкой клиента и объёмом. Действие без
 * отметки подтверждения возвращает на подтверждение и данных не трогает.
 *
 * Модуль экрана с JSX тестом не загружается, поэтому проверка — по тексту
 * экрана и действия, как в `outbox-failed-note.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');
const page = readFileSync(path.join(SRC, 'app', 'cabinet', 'manage', 'erasure', 'page.tsx'), 'utf8');
const actions = readFileSync(path.join(SRC, 'app', 'cabinet', 'actions.ts'), 'utf8');

describe('исполнение требования об удалении — после подтверждения', () => {
  it('подтверждается только неисполненное требование из перечня, названное в адресе', () => {
    assert.match(
      page,
      /requests\.find\(\s*\(request\) => request\.executedAt === null && request\.id === flags\.confirm,?\s*\)/u,
    );
    assert.match(page, /erasureVolume\(actor, confirming\.id\)/u);
  });

  it('в строке требования — ссылка на подтверждение, а не форма исполнения', () => {
    const rows = page.slice(page.indexOf('rows={requests.map('));
    assert.ok(rows.length < page.length, 'перечня требований нет');
    assert.doesNotMatch(rows, /executeErasureRequest/u);
    assert.match(rows, /href=\{`\/cabinet\/manage\/erasure\?confirm=\$\{request\.id\}`\}/u);
  });

  it('форма исполнения одна — в подтверждении с объёмом', () => {
    assert.equal(page.match(/<Form action=\{executeErasureRequest\}/gu)?.length, 1);
    const start = page.indexOf('{volume === null ? null : (');
    const form = page.indexOf('<Form action={executeErasureRequest}');
    assert.ok(start >= 0 && start < form, 'форма исполнения стоит вне подтверждения');
    const card = page.slice(start, page.indexOf('</Card>', form));
    assert.match(card, /volume\.clientName/u);
    for (const count of ['projects', 'messages', 'files']) {
      assert.match(card, new RegExp(`volume\\.${count}`, 'u'));
    }
    assert.match(card, /<input type="hidden" name="requestId" value=\{volume\.requestId\} \/>/u);
    assert.match(card, /<input type="hidden" name="confirmed" value="1" \/>/u);
    assert.match(card, /<Button>Исполнить окончательно<\/Button>/u);
    assert.match(card, /<ButtonLink href="\/cabinet\/manage\/erasure" tone="quiet">\s*Отмена\s*<\/ButtonLink>/u);
  });

  it('действие без отметки подтверждения возвращает на подтверждение до исполнения', () => {
    const start = actions.indexOf('export async function executeErasureRequest');
    const body = actions.slice(start, actions.indexOf('\n}\n', start));
    const guard = body.indexOf("form.get('confirmed') !== '1'");
    assert.ok(guard > 0, 'действие не проверяет подтверждение');
    assert.ok(guard < body.indexOf('executeErasure(actor'), 'проверка подтверждения стоит после исполнения');
    assert.match(body, /redirect\(`\/cabinet\/manage\/erasure\?confirm=\$\{encodeURIComponent\(requestId\)\}`\)/u);
  });
});

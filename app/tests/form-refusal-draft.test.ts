/**
 * Отказ формы не стирает набранное; предел длины — при вводе (решение
 * Р-722). Приём Р-279, Р-326, Р-707 распространён на шесть действий:
 * при отказе действие возвращает черновик полей и якорь формы, экран
 * раскрывает свёртку, подставляет значения и ставит причину у формы.
 * Заготовка переписки ставится перед набранным текстом.
 *
 * Действия и экраны с JSX тестом не загружаются: правила проверяются по
 * тексту исходников, логика черновика и заготовки — вызовом функций.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { MAX_DRAFT_BYTES, markedDraft, packDraft } from '../src/lib/cabinet/flash-value.ts';
import { withTemplate } from '../src/lib/cabinet/message-drafts.ts';

const CABINET = path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet');
const read = (...parts: string[]) => readFileSync(path.join(CABINET, ...parts), 'utf8');
const actions = read('actions.ts');

/** Тело действия — от объявления до следующего экспорта. */
function action(name: string): string {
  const start = actions.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `нет действия ${name}`);
  return actions.slice(start, actions.indexOf('\nexport ', start + 1));
}

describe('действия возвращают черновик, место причины и якорь формы', () => {
  const cases: readonly (readonly [string, RegExp])[] = [
    ['postMessage', /withError\(target, failure, \{ slot: 'message', draft: \{ body \}, anchor: 'message' \}\)/u],
    ['commentOnVersion', /failedForm\(failure, \{ commentVersion: versionId \}, \{ comment: body \}\)[\s\S]*slot: 'comment'[\s\S]*anchor: `comment-\$\{mark\}`/u],
    ['returnStageWithRemarks', /slot: 'return',\s*draft: \{ remarks: text \},\s*anchor: 'return'/u],
    // Пояснение куратора к новому материалу — тоже (решение Р-755).
    ['uploadMaterial', /failedForm\(reason, \{ upload: [^}]+\}, \{ title, uploadNote: note \}\)[\s\S]*slot: 'upload'[\s\S]*anchor: `upload-\$\{mark\}`/u],
    ['addMaterialVersion', /failedForm\(reason, \{ upload: [^}]+, stageId \}, \{ title \}\)[\s\S]*slot: 'upload'/u],
    ['addContactChannel', /failedForm\(failure, \{ kind, preferred: [^}]+\}, \{ value, note \}\)[\s\S]*slot: 'contact', draft: back\.draft, anchor: 'new-contact'/u],
  ];
  for (const [name, rule] of cases) {
    it(name, () => assert.match(action(name), rule));
  }

  it('отказ загрузки называет, что файл нужно выбрать снова', () => {
    assert.match(actions, /const REPICK = 'Выберите файл ещё раз\.';/u);
    for (const name of ['uploadMaterial', 'addMaterialVersion']) {
      assert.match(action(name), /refuse\(joinReason\(failure, REPICK\)\)/u, name);
    }
  });
});

describe('черновик с приметой формы (Р-645 сохраняется)', () => {
  it('набранное до тысячи знаков сохраняется вместе с приметой', () => {
    const text = 'Замечание к расчёту. '.repeat(45).slice(0, 900);
    const { draft, kept } = markedDraft({ commentVersion: 'cmv0000000000000000000000' }, { comment: text });
    assert.equal(kept, true);
    assert.deepEqual(draft, { commentVersion: 'cmv0000000000000000000000', comment: text });
    assert.notEqual(packDraft('0123456789ab', draft), null);
  });

  it('текст в 3 000 знаков не хранится, а примета остаётся — причина называет потерю', () => {
    const text = 'я'.repeat(3000);
    assert.ok(Buffer.byteLength(JSON.stringify({ comment: text }), 'utf8') > MAX_DRAFT_BYTES);
    const { draft, kept } = markedDraft({ commentVersion: 'v1' }, { comment: text });
    assert.equal(kept, false);
    assert.deepEqual(draft, { commentVersion: 'v1' });
    assert.match(actions, /reason: kept \? reason : joinReason\(reason, TEXT_LOST\)/u);
    assert.match(actions, /const TEXT_LOST = 'Введённый текст слишком длинный и не сохранён — наберите его заново\.';/u);
  });
});

describe('экраны раскрывают свою форму и держат набранное', () => {
  const stage = read('stages', '[id]', 'page.tsx');
  const settings = read('settings', 'page.tsx');
  const materials = read('projects', '[code]', 'materials', 'page.tsx');
  const messages = read('projects', '[code]', 'messages', 'page.tsx');
  const project = read('projects', '[code]', 'page.tsx');

  it('экран этапа: возврат, комментарий, загрузки', () => {
    assert.match(stage, /title="Вернуть с замечаниями"\s*id="return"\s*open=\{failure\?\.slot === 'return'\}/u);
    assert.match(stage, /<ActionError id=\{errorId\} slot="return" \/>/u);
    assert.match(stage, /id=\{`comment-\$\{version\.id\}`\}\s*open=\{draft\.commentVersion === version\.id\}/u);
    assert.match(stage, /defaultValue=\{draft\.commentVersion === version\.id \? draft\.comment : undefined\}/u);
    assert.match(stage, /id=\{`upload-\$\{material\.id\}`\}\s*open=\{draft\.upload === material\.id\}/u);
    assert.match(stage, /id="upload-new"\s*open=\{draft\.upload === 'new'\}/u);
    assert.match(stage, /defaultValue=\{draft\.upload === 'new' \? draft\.title : undefined\}/u);
    // Формы нет на экране — причина вверху, а не пропадает.
    assert.match(stage, /<ActionError id=\{errorId\} unplaced=\{unplaced\} \/>/u);
  });

  it('«Материалы работы»: новый материал и новая версия', () => {
    assert.match(materials, /<Card id="new-material"/u);
    assert.match(materials, /id=\{`upload-\$\{material\.id\}`\}/u);
    assert.match(materials, /defaultValue=\{draft\.upload === 'new' \? \(draft\.stageId \?\? ''\) : \(defaultStage\?\.id \?\? ''\)\}/u);
    assert.match(materials, /unplaced=\{uploadPlaced \? \[\] : \['upload'\]\}/u);
    // Экран «Что подготовить» берёт то же действие: причина — вверху, как прежде.
    assert.match(read('projects', '[code]', 'prepare', 'page.tsx'), /unplaced=\{\['upload'\]\}/u);
  });

  it('«Настройки»: способ связи', () => {
    assert.match(settings, /title="Добавить способ связи" id="new-contact" open=\{contactFailed\}/u);
    assert.match(settings, /<Select label="Способ" name="kind" defaultValue=\{draft\.kind\}>/u);
    assert.match(settings, /defaultValue=\{draft\.value\}/u);
    assert.match(settings, /defaultValue=\{draft\.note\}/u);
    assert.match(settings, /defaultChecked=\{draft\.preferred === 'on'\}/u);
  });

  it('переписка и карточка работы: набранное в поле, причина у формы', () => {
    assert.match(messages, /<ActionError id=\{sp\.error\} slot="message" \/>/u);
    assert.match(messages, /defaultValue=\{fieldText\}/u);
    assert.match(project, /<ActionError id=\{errorId\} slot="message" \/>/u);
    assert.match(project, /defaultValue=\{draft\.body\}/u);
    assert.match(project, /unplaced=\{mayWrite \? \[\] : \['message'\]\}/u);
  });
});

describe('предел длины — при вводе', () => {
  const stage = read('stages', '[id]', 'page.tsx');
  const messages = read('projects', '[code]', 'messages', 'page.tsx');

  it('поля сообщения, комментария и замечаний ограничены 10 000 знаками', () => {
    assert.equal(messages.match(/maxLength=\{MESSAGE_MAX\}/gu)?.length, 2, 'обе ветки переписки');
    assert.match(read('projects', '[code]', 'page.tsx'), /maxLength=\{MESSAGE_MAX\}/u);
    assert.match(stage, /maxLength=\{COMMENT_MAX\}/u);
    assert.match(stage, /maxLength=\{RETURN_TEXT_MAX\}/u);
    assert.equal(read('settings', 'page.tsx').match(/maxLength=\{CONTACT_MAX\}/gu)?.length, 2);
  });

  it('подсказка называет предел, отказ пишет «10 000»', () => {
    assert.match(messages, /До \$\{LIMIT\} знаков; файлы — /u);
    assert.match(stage, /const TEXT_LIMIT = `До \$\{COMMENT_MAX\.toLocaleString\('ru-RU'\)\} знаков; файлы — в материалах работы\.`/u);
    const lib = path.join(import.meta.dirname, '..', 'src', 'lib', 'cabinet');
    assert.match(readFileSync(path.join(lib, 'messages.ts'), 'utf8'), /Сообщение длиннее \$\{MESSAGE_MAX\.toLocaleString\('ru-RU'\)\} знаков/u);
    assert.match(readFileSync(path.join(lib, 'materials.ts'), 'utf8'), /Замечание длиннее \$\{COMMENT_MAX\.toLocaleString\('ru-RU'\)\} знаков/u);
    assert.equal((10_000).toLocaleString('ru-RU').replace(/\s/gu, ' '), '10 000');
  });
});

describe('заготовка ставится перед набранным текстом (Р-316, Р-317)', () => {
  const template = 'Итог созвона 23 сентября 2026: договорились — ';

  it('набранное остаётся после заготовки', () => {
    assert.equal(withTemplate(template, 'Посмотрел вашу главу.'), 'Итог созвона 23 сентября 2026: договорились —\n\nПосмотрел вашу главу.');
  });

  it('пустое поле — только заготовка; без заготовки — набранное', () => {
    assert.equal(withTemplate(template, undefined), template);
    assert.equal(withTemplate(template, '  '), template);
    assert.equal(withTemplate(null, 'Текст'), 'Текст');
    assert.equal(withTemplate(null, undefined), undefined);
  });

  it('повторный выбор той же заготовки её не удваивает', () => {
    const once = withTemplate(template, 'Посмотрел вашу главу.') ?? '';
    assert.equal(withTemplate(template, once), once);
  });
});

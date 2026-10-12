/**
 * Шаблоны документов (решение Р-557): каждый шаблон читается тем же
 * разборщиком, все его поля узнаются, файл без автора и побайтно
 * повторяется.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { matchLabel, parseBrief } from '../src/lib/cabinet/brief/parse.ts';
import { readBrief } from '../src/lib/cabinet/brief/read.ts';
import { BRIEF_TEMPLATES, briefTemplate } from '../src/lib/cabinet/brief/templates.ts';
import { docx } from '../src/lib/cabinet/docx.ts';
import { documentAuthors } from '../src/lib/cabinet/identity-hint.ts';

describe('шаблоны документов (Р-557)', () => {
  for (const template of BRIEF_TEMPLATES) {
    it(`${template.file}: все поля узнаются разборщиком`, () => {
      const { lines, format } = readBrief(template.build());
      assert.equal(format, template.file.endsWith('.xlsx') ? 'xlsx' : 'docx');
      const found = new Set(
        lines.map((line) => (line.cells !== undefined ? matchLabel(`${line.cells[0]}:`) : matchLabel(line.text))?.key).filter(Boolean),
      );
      for (const key of template.fields) assert.ok(found.has(key), `${template.file}: не узнано поле ${key}`);
    });

    it(`${template.file}: пустой шаблон — без значений и без замечаний, кроме пустых полей`, () => {
      const brief = parseBrief(readBrief(template.build()).lines);
      // Пояснения стоят до первой метки и в поля не попадают.
      assert.deepEqual(Object.keys(brief.fields), [], JSON.stringify(brief.fields));
      assert.deepEqual(brief.issues.filter((issue) => !issue.startsWith('Не заполнено')), []);
    });

    it(`${template.file}: без автора в свойствах, побайтно повторяется`, () => {
      const bytes = template.build();
      assert.deepEqual(documentAuthors(bytes), []);
      assert.ok(bytes.equals(template.build()));
    });
  }

  it('статья узнаётся как статья', () => {
    const brief = parseBrief(readBrief(briefTemplate('iskhodnye-statya')!.build()).lines);
    assert.equal(brief.article, true);
  });

  it('ключи и имена файлов шаблонов не повторяются', () => {
    assert.equal(new Set(BRIEF_TEMPLATES.map((template) => template.key)).size, BRIEF_TEMPLATES.length);
    assert.equal(new Set(BRIEF_TEMPLATES.map((template) => template.ascii)).size, BRIEF_TEMPLATES.length);
    for (const template of BRIEF_TEMPLATES) assert.match(template.ascii, /^[a-z-]+\.(docx|xlsx)$/u);
    assert.equal(briefTemplate('nope'), null);
  });
});

describe('документ Word из кода (Р-557)', () => {
  it('текст экранируется, служебные символы убираются', () => {
    const bytes = docx('Проверка', [{ kind: 'paragraph', text: 'A & B <c> "d"\u0001' }]);
    const { lines } = readBrief(bytes);
    assert.deepEqual(lines.map((line) => line.text), ['A & B <c> "d"']);
  });

  it('пункт чек-листа — с квадратом для отметки', () => {
    const { lines } = readBrief(docx('Ч', [{ kind: 'check', text: 'Шаг' }]));
    assert.deepEqual(lines.map((line) => line.text), ['☐ Шаг']);
  });
});

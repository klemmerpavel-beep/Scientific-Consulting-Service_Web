/**
 * Письмо клиенту о заведённой работе не повторяет название темой
 * (решение Р-897; аудит 15.11.2026, находка Ф-13).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { workTitleLine } from '../src/lib/cabinet/work-title-line.ts';

describe('строка «название — тема» письма о работе (Р-897)', () => {
  it('тема дописывается, когда она отличается от названия', () => {
    assert.equal(workTitleLine('Диссертация', 'Надёжность горных машин'), 'Диссертация — Надёжность горных машин');
  });

  it('тема, равная названию, не повторяется', () => {
    assert.equal(workTitleLine('Надёжность горных машин', 'Надёжность горных машин'), 'Надёжность горных машин');
  });

  it('сравнение — без регистра, крайних пробелов и точки в конце', () => {
    assert.equal(workTitleLine('Статья в журнал', '  статья  в журнал. '), 'Статья в журнал');
  });

  it('без темы — только название', () => {
    assert.equal(workTitleLine('Статья в журнал', null), 'Статья в журнал');
    assert.equal(workTitleLine('Статья в журнал', '   '), 'Статья в журнал');
  });

  it('письмо «Заведена новая работа» собирается этой строкой', () => {
    const projects = readFileSync(path.join(import.meta.dirname, '..', 'src', 'lib', 'cabinet', 'projects.ts'), 'utf8');
    assert.match(projects, /`\$\{workTitleLine\(title, created\.topic\)\}\.\\n`/u);
    assert.doesNotMatch(projects, /created\.topic === null \? '' : ` — \$\{created\.topic\}`/u);
  });
});

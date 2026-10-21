/**
 * Мгновения на экранах — московским днём (решение Р-470): событие в 01:30
 * по Москве (22:30 UTC накануне) показывается сегодняшним днём. Экраны
 * пишут мгновения через `formatDay` (Москва), а не через `formatDate`
 * (UTC-день для дней, хранимых полночью). Модуль экранов с JSX тестом не
 * загружается, поэтому проверка — по тексту экранов; сам день по Москве
 * проверен в `turn-label.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const root = path.join(import.meta.dirname, '../src');

describe('мгновения — московским днём', () => {
  const files = [
    'components/cabinet/CommentList.tsx',
    'components/cabinet/RecommendationMarks.tsx',
    'app/cabinet/projects/[code]/materials/page.tsx',
    'app/cabinet/projects/[code]/page.tsx',
    'app/cabinet/projects/[code]/payments/page.tsx',
    'app/cabinet/stages/[id]/page.tsx',
    'app/cabinet/settings/page.tsx',
    'app/cabinet/manage/page.tsx',
    'app/cabinet/manage/users/page.tsx',
    'app/cabinet/manage/team/page.tsx',
    'app/cabinet/manage/leads/[id]/page.tsx',
    'app/cabinet/manage/disk/page.tsx',
    'app/cabinet/manage/import/page.tsx',
    'app/cabinet/manage/import/[batchId]/page.tsx',
    'app/cabinet/manage/assignments/page.tsx',
  ];

  it('метки времени на экранах не идут через UTC-день `formatDate`', () => {
    for (const file of files) {
      const source = readFileSync(path.join(root, file), 'utf8');
      // Договор поручения — день, а не мгновение: ему `formatDate` подходит.
      const stamps = [...source.matchAll(/formatDate\(([^)]*)\)/gu)]
        .map((match) => match[1]!)
        .filter((arg) => /(At|Since|since|Asked|\.at)\b/u.test(arg) && !/ndaSignedAt/u.test(arg));
      assert.deepEqual(stamps, [], `${file}: мгновение через formatDate`);
    }
  });

  it('`formatDay` на экранах — московский из ui, а не UTC-день срока согласования (Р-649)', () => {
    // Одноимённая функция из approval-text пишет день по UTC: она для
    // дней, хранимых полночью, и мгновение 01:30 по Москве уводит на
    // вчера. Экраны берут `formatDay` из ui — день мгновения по Москве.
    for (const file of files) {
      const source = readFileSync(path.join(root, file), 'utf8');
      assert.doesNotMatch(
        source,
        /import \{[^}]*\bformatDay\b[^}]*\} from '[^']*lib\/cabinet\/(approval|approval-text)'/u,
        `${file}: formatDay по UTC`,
      );
    }
  });

  it('год номера работы, черновик итога созвона и имена выгрузок — по Москве (Р-473)', () => {
    const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
    assert.match(read('lib/cabinet/projects.ts'), /nextProjectCode\(tx as never, moscowToday\(\)\.getUTCFullYear\(\)\)/u);
    assert.doesNotMatch(read('lib/cabinet/projects.ts'), /nextProjectCode\([^)]*new Date\(\)\.getUTCFullYear/u);
    assert.match(read('app/cabinet/projects/[code]/messages/page.tsx'), /today: formatDate\(moscowToday\(clockNow\(\)\)\)/u);
    for (const file of ['app/cabinet/manage/audit/export/route.ts', 'app/cabinet/manage/leads/export/route.ts']) {
      assert.doesNotMatch(read(file), /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/u, `${file}: имя выгрузки по UTC`);
      assert.match(read(file), /moscowToday\(\)\.toISOString\(\)\.slice\(0, 10\)/u);
    }
  });
});

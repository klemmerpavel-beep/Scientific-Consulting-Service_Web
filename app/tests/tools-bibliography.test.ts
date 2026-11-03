/**
 * «Инструменты» (Р-788): оформитель списка литературы по ГОСТ Р 7.0.100-2018.
 *
 * Логика живёт в макете design/ToolsPage.dc.html и переносится в компонент
 * дословно, поэтому проверяется сам сценарий макета: класс выполняется с
 * заглушкой DCLogic, и записи сверяются с образцами. Отдельно охраняются
 * границы страницы: введённое не уходит на сервер (нет обработчиков submit*,
 * сетевых вызовов и хранилищ), маршрут открыт поиску и стоит в карте сайта,
 * макет входит в перенос CI.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

const html = read('design/ToolsPage.dc.html');
const script = html.match(/<script[^>]*data-dc-script[^>]*>([\s\S]*?)<\/script>/u)![1]!;

class DCLogic {
  state: any = {};
  setState(u: any) {
    const patch = typeof u === 'function' ? u(this.state) : u;
    this.state = { ...this.state, ...patch };
  }
}
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const Component = new Function('DCLogic', `${script}\nreturn Component;`)(DCLogic);
const c: any = new Component();
const fmt = (kind: number, d: Record<string, string>, tag = true) => c.formatEntry(kind, d, tag);

describe('записи по ГОСТ Р 7.0.100-2018', () => {
  it('книга, два автора, сведения об издании и ISBN', () => {
    assert.equal(
      fmt(0, { authors: 'Иванов И.И.\nПетров Петр Петрович', title: 'Методология научного исследования.', other: 'учебное пособие', edition: '2-е изд., перераб. и доп.', city: 'Москва', publisher: 'Наука', year: '2020', pages: '256', isbn: 'ISBN 978-5-02-040000-0' }),
      'Иванов, И. И. Методология научного исследования : учебное пособие / И. И. Иванов, П. П. Петров. – 2-е изд., перераб. и доп. – Москва : Наука, 2020. – 256 с. – ISBN 978-5-02-040000-0. – Текст : непосредственный.',
    );
  });

  it('четыре автора — без заголовка, все в сведениях об ответственности', () => {
    assert.equal(
      fmt(0, { authors: 'Иванов И. И.;Петров П. П.;Сидоров С. С.;Алексеев А. А.', title: 'Название', city: 'Москва', publisher: 'Юрайт', year: '2021', pages: '120 с.' }),
      'Название / И. И. Иванов, П. П. Петров, С. С. Сидоров, А. А. Алексеев. – Москва : Юрайт, 2021. – 120 с. – Текст : непосредственный.',
    );
  });

  it('пять авторов — первые три и [и др.]', () => {
    assert.equal(
      fmt(0, { authors: 'Иванов И. И.;Петров П. П.;Сидоров С. С.;Алексеев А. А.;Борисов Б. Б.', title: 'Название', city: 'Москва', publisher: 'Юрайт', year: '2021', pages: '120' }),
      'Название / И. И. Иванов, П. П. Петров, С. С. Сидоров [и др.]. – Москва : Юрайт, 2021. – 120 с. – Текст : непосредственный.',
    );
  });

  it('статья: том и номер, страницы через тире, DOI без адреса', () => {
    assert.equal(
      fmt(1, { authors: 'Иванов, И. И.\nП. П. Петров', title: 'Модель отраслевой экономики', journal: 'Вопросы экономики', year: '2020', volume: '12', issue: '3', pages: '45-52', doi: 'https://doi.org/10.1234/ve.2020.3' }),
      'Иванов, И. И. Модель отраслевой экономики / И. И. Иванов, П. П. Петров. – Текст : непосредственный // Вопросы экономики. – 2020. – Т. 12, № 3. – С. 45–52. – DOI 10.1234/ve.2020.3.',
    );
  });

  it('статья на латинице: Vol., no., P.', () => {
    assert.equal(
      fmt(1, { authors: 'Smith J. A.', title: 'Quantum sensing', journal: 'Physical Review A', year: '2019', volume: '99', issue: '4', pages: '100-110' }),
      'Smith, J. A. Quantum sensing / J. A. Smith. – Текст : непосредственный // Physical Review A. – 2019. – Vol. 99, no. 4. – P. 100–110.',
    );
  });

  it('страница сайта: [сайт], URL и дата обращения', () => {
    assert.equal(
      fmt(2, { title: 'Перечень рецензируемых научных изданий', site: 'ВАК при Минобрнауки России', url: 'https://vak.minobrnauki.gov.ru', date: '2026-11-01' }),
      'Перечень рецензируемых научных изданий. – Текст : электронный // ВАК при Минобрнауки России : [сайт]. – URL: https://vak.minobrnauki.gov.ru (дата обращения: 01.11.2026).',
    );
  });

  it('диссертация: специальность, степень, организация', () => {
    assert.equal(
      fmt(3, { fullName: 'Иванов Иван Иванович', title: 'Развитие региональной экономики', specCode: '5.2.3', specName: 'Региональная и отраслевая экономика', workKind: 'thesis', degree: 'candidate', branch: 'экономических наук', org: 'Московский государственный университет', city: 'Москва', year: '2023', pages: '180' }),
      'Иванов, И. И. Развитие региональной экономики : специальность 5.2.3 «Региональная и отраслевая экономика» : диссертация на соискание ученой степени кандидата экономических наук / Иванов Иван Иванович ; Московский государственный университет. – Москва, 2023. – 180 с. – Текст : непосредственный.',
    );
  });

  it('автореферат доктора наук без вида содержания', () => {
    assert.equal(
      fmt(3, { fullName: 'Иванов Иван Иванович', title: 'Развитие', workKind: 'autoref', degree: 'doctor', branch: 'экономических', city: 'Москва', year: '2023', pages: '40' }, false),
      'Иванов, И. И. Развитие : автореферат диссертации на соискание ученой степени доктора экономических наук / Иванов Иван Иванович. – Москва, 2023. – 40 с.',
    );
  });

  it('без обязательных полей запись не составляется', () => {
    assert.equal(fmt(0, { authors: 'Иванов И. И.' }), '');
    assert.equal(fmt(1, { title: 'Статья' }), '');
    assert.equal(fmt(2, { title: 'Страница' }), '');
    assert.equal(fmt(3, { fullName: 'Иванов Иван Иванович', title: 'Тема' }), '');
  });

  it('разбор имени в разных написаниях', () => {
    for (const raw of ['Иванов И. И.', 'Иванов И.И.', 'Иванов, И. И.', 'Иванов Иван Иванович', 'И. И. Иванов']) {
      const a = c.parseName(raw);
      assert.equal(`${a.last}, ${a.init}`, 'Иванов, И. И.', raw);
    }
    assert.equal(c.parseName('Салтыков-Щедрин Михаил Евграфович').init, 'М. Е.');
    assert.equal(c.parseName('Петрова А.-М. С.').init, 'А.-М. С.');
  });

  it('сортировка: кириллица, затем латиница, по алфавиту', () => {
    c.state.sort = true;
    const rows = c.ordered([{ text: 'Smith, J.' }, { text: 'Петров, П.' }, { text: 'Абрамов, А.' }, { text: 'Adams, B.' }]);
    assert.deepEqual(rows.map((r: any) => r.text), ['Абрамов, А.', 'Петров, П.', 'Adams, B.', 'Smith, J.']);
  });

  it('склонение «запись»', () => {
    assert.deepEqual([1, 2, 5, 11, 21, 22, 112].map((n) => c.plural(n)), ['запись', 'записи', 'записей', 'записей', 'запись', 'записи', 'записей']);
  });
});

describe('границы страницы «Инструменты»', () => {
  it('введённое не уходит с устройства', () => {
    assert.doesNotMatch(script, /\bsubmit\w*\s*:/u, 'обработчик submit* перенос обернёт в отправку заявки');
    assert.doesNotMatch(script, /\bfetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB/u);
    const tsx = read('app/src/components/pages/ToolsPage.tsx');
    assert.match(tsx, /const LEAD_THANKS: Record<string, string> = \{\};/u, 'у страницы нет форм заявки');
  });

  it('маршрут открыт поиску и стоит в карте сайта', () => {
    const route = read('app/src/app/tools/page.tsx');
    assert.match(route, /canonical: '\/tools'/u);
    assert.doesNotMatch(route, /index: false/u);
    assert.match(read('app/src/app/sitemap.ts'), /path: '\/tools'/u);
  });

  it('описание для поиска — не длиннее 160 знаков (Р-775)', () => {
    const desc = html.match(/<meta name="description" content="([^"]+)">/u)![1]!;
    assert.ok(desc.length <= 160, `${desc.length} знаков`);
    assert.match(desc, /ГОСТ Р 7\.0\.100-2018/u);
  });

  it('макет входит в перенос CI и навыка', () => {
    assert.match(read('.github/workflows/ci.yml'), /"ToolsPage:ToolsPage:landing"/u);
    assert.match(read('.claude/skills/prodisser-visual-style/scripts/sync-check.sh'), /ToolsPage:ToolsPage:landing/u);
    assert.match(read('CONTRIBUTING.md'), /`design\/ToolsPage\.dc\.html` \| `ToolsPage\.tsx` \| `\/tools`/u);
  });

  it('на страницу ведут 404 и панель нормоконтроля «Студентам»', () => {
    assert.match(read('design/NotFoundPage.dc.html'), /<a href="\.\/tools\.html"[^>]*>Инструменты<\/a>/u);
    const stu = read('design/StudentsPage.dc.html');
    const panel = stu.slice(stu.indexOf('id="norm-panel"'), stu.indexOf('</sc-if>', stu.indexOf('id="norm-panel"')));
    assert.match(panel, /href="\.\/tools\.html"/u);
  });
});

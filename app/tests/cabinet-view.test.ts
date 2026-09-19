/**
 * Два правила облика проверяются машиной, а не глазами.
 *
 * Проверка идёт по снимкам прототипа `design/cabinet-prototype/`: это
 * разметка настоящих экранов, снятая обходом по ссылкам, и именно её видит
 * человек. Исходник тут не годится — обе проверки касаются того, что
 * оказалось на экране, а не того, как оно написано в коде.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const PROTOTYPE = path.join(import.meta.dirname, '..', '..', 'design', 'cabinet-prototype');

/**
 * Разметка экрана без обвязки прототипа.
 *
 * Сверху каждого снимка стоит полоса выбора роли — она принадлежит
 * прототипу, а не кабинету, и с появлением четвёртой роли (Р-150) слово
 * «Эксперт» оказалось на каждой странице, включая клиентские. Проверять
 * надо экран, поэтому обвязка вырезается. Кроме полосы обвязки больше нет:
 * плашки выбора роли на входной странице задваивали её и сняты (Р-164).
 */
function body(file: string): string {
  return readFileSync(file, 'utf8').replace(/<div class="pt-bar">[\s\S]*?<\/div>/u, '');
}

function screens(folder: string): string[] {
  const root = path.join(PROTOTYPE, folder);
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith('.html'))
    .map((name) => path.join(root, name));
}

describe('клиент не видит исполнителя', () => {
  // Состав привлечённых специалистов клиенту не показывается: ни подписью
  // автора, ни в тексте сообщения или замечания (решения Р-140, Р-143).
  for (const file of screens('client')) {
    it(path.relative(PROTOTYPE, file), () => {
      const html = body(file);
      assert.equal(/эксперт/iu.test(html), false, 'на клиентском экране назван исполнитель');
    });
  }
});

describe('зелёный и красный — только исход действия', () => {
  // Пара ok/err живёт в блоке подтверждения и блоке ошибки; в снимках
  // прототипа таких блоков нет, поэтому её применений быть не должно
  // (решение Р-146). Объявление токенов в таблице — не применение.
  for (const folder of ['client', 'expert', 'manager', 'head']) {
    for (const file of screens(folder)) {
      it(path.relative(PROTOTYPE, file), () => {
        const html = body(file);
        assert.equal(
          /var\(--pd-(ok|err)-/u.test(html),
          false,
          'семантический цвет применён к обычному блоку',
        );
      });
    }
  }
});

describe('уровни заголовков не пропускаются', () => {
  // Читалка строит по заголовкам оглавление экрана. Переход с h1 сразу на
  // h3 читается как потерянный раздел: пользователь клавиатуры не понимает,
  // куда делся уровень. Кегль при этом может быть любым — в кабинете
  // уровень и ступень кегля разведены (решение Р-148).
  for (const folder of ['client', 'expert', 'manager', 'head']) {
    for (const file of screens(folder)) {
      it(path.relative(PROTOTYPE, file), () => {
        const html = body(file);
        const levels = [...html.matchAll(/<h([1-6])[ >]/gu)].map((m) => Number(m[1]));
        let previous = 0;
        for (const level of levels) {
          assert.ok(
            previous === 0 || level <= previous + 1,
            `после h${previous} идёт h${level}: уровень пропущен`,
          );
          previous = level;
        }
      });
    }
  }
});

describe('каждое поле подписано', () => {
  // Подпись в placeholder исчезает при первом же символе, и человек теряет
  // смысл поля; читалке она не заменяет метку вовсе. Метка либо связана
  // через `for`, либо оборачивает поле, либо задана `aria-label`.
  for (const folder of ['client', 'expert', 'manager', 'head']) {
    for (const file of screens(folder)) {
      it(path.relative(PROTOTYPE, file), () => {
        const html = body(file);
        const forIds = new Set(
          [...html.matchAll(/<label[^>]*\bfor="([^"]+)"/gu)].map((m) => m[1]),
        );
        const wraps = [...html.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/gu)].map(
          (m) => [m.index, m.index + m[0].length] as const,
        );
        for (const field of html.matchAll(/<(input|select|textarea)\b([^>]*)>/gu)) {
          const attrs = field[2];
          if (/type="(hidden|submit)"/u.test(attrs)) continue;
          const id = /\bid="([^"]+)"/u.exec(attrs)?.[1];
          const wrapped = wraps.some(([from, to]) => field.index > from && field.index < to);
          assert.ok(
            wrapped || (id !== undefined && forIds.has(id)) || attrs.includes('aria-label'),
            `поле без подписи: ${field[0].slice(0, 80)}`,
          );
        }
      });
    }
  }
});

describe('идентификаторы на экране не повторяются', () => {
  // Повтор — не косметика: `<label for>` ведёт к первому совпадению, и
  // читалка называет не то поле, которое человек правит. Дубли заводились
  // формой, повторённой в перечне: имя поля одно на все строки. Отсюда
  // область в `Field`/`Select` (решение Р-158).
  for (const folder of ['client', 'expert', 'manager', 'head']) {
    for (const file of screens(folder)) {
      it(path.relative(PROTOTYPE, file), () => {
        const html = body(file);
        const seen = new Set<string>();
        const twice: string[] = [];
        for (const match of html.matchAll(/\bid="([^"]+)"/gu)) {
          const id = match[1];
          if (seen.has(id)) twice.push(id);
          seen.add(id);
        }
        assert.deepEqual(twice, [], `идентификатор встречается дважды: ${twice.join(', ')}`);
      });
    }
  }
});

describe('облик держится в границах дизайн-системы', () => {
  // Аудит по дизайн-системе (решение Р-165) прошёл по восьмидесяти четырём
  // снимкам и нашёл расхождения, которых не видели прежние правила: радиус
  // вне закрытого набора, знак-украшение вместо штрихового значка, столбец
  // заголовков таблицы без области действия. Каждое из них теперь заперто.
  const RADII = new Set(['6px', '10px', '14px', '999px', '50%']);
  const LEADING = new Set(['1.24', '1.4', '1.5', '1.55', '1.6', '1.65']);
  const SHADOWS = new Set([
    '0 1px 2px rgba(20,22,28,.05)',
    '0 6px 14px rgba(20,22,28,.06), 0 1px 2px rgba(20,22,28,.05)',
    '0 10px 20px rgba(20,22,28,.09)',
    '0 0 0 3px rgba(20,65,122,.16)',
  ]);

  for (const folder of ['client', 'expert', 'manager', 'head']) {
    for (const file of screens(folder)) {
      const name = path.relative(PROTOTYPE, file);

      it(`${name}: радиус из закрытого набора`, () => {
        for (const m of body(file).matchAll(/border-radius:\s*([^;"]+)/gu)) {
          for (const part of m[1].trim().split(/\s+/)) {
            assert.ok(RADII.has(part), `радиус вне набора: ${part}`);
          }
        }
      });

      it(`${name}: интерлиньяж коэффициентом из шкалы`, () => {
        for (const m of body(file).matchAll(/line-height:\s*([^;"]+)/gu)) {
          assert.ok(LEADING.has(m[1].trim()), `интерлиньяж вне шкалы: ${m[1].trim()}`);
        }
      });

      it(`${name}: тень по одной из трёх формул`, () => {
        for (const m of body(file).matchAll(/box-shadow:\s*([^"]+?)(?:;|")/gu)) {
          assert.ok(SHADOWS.has(m[1].trim()), `тень вне набора: ${m[1].trim()}`);
        }
      });

      it(`${name}: знаки штриховые, а не символы`, () => {
        const text = body(file).replace(/<[^>]+>/gu, ' ');
        assert.equal(
          /[←-⇿☀-➿✓✔✖\u{1F300}-\u{1FAFF}]/u.test(text),
          false,
          'в тексте экрана знак-украшение вместо штрихового значка',
        );
      });

      // Область прокрутки — вбок ли, вниз ли — мышью и пальцем работает
      // сама, с клавиатуры только когда у неё есть фокус и имя. Проверка
      // доступности нашла тринадцать таких экранов, где не было ни того,
      // ни другого (Р-168); с появлением колонок панели правило пошло и
      // по вертикальной оси (Р-169).
      it(`${name}: область прокрутки достижима с клавиатуры`, () => {
        for (const m of body(file).matchAll(/<(\w+)\b([^>]*overflow-[xy]:\s*auto[^>]*)>/gu)) {
          assert.ok(/tabindex="0"/u.test(m[2]), 'область прокрутки не получает фокус');
          assert.ok(/aria-label="[^"]+"/u.test(m[2]), 'область прокрутки не названа');
        }
      });

      // Свёртка, снятая раскрытой, сделала бы экран длиннее окна — а он
      // обещан помещающимся целиком (Р-169).
      it(`${name}: свёртка сомкнута и названа`, () => {
        for (const m of body(file).matchAll(/<details\b([^>]*)>/gu)) {
          assert.equal(/\bopen\b/u.test(m[1]), false, 'свёртка снята раскрытой');
        }
        for (const m of body(file).matchAll(/<summary\b[^>]*>([\s\S]*?)<\/summary>/gu)) {
          assert.ok(
            m[1].replace(/<[^>]+>/gu, '').trim().length > 0,
            'свёртка без названия',
          );
        }
      });

      it(`${name}: заголовок столбца называет свою область`, () => {
        for (const m of body(file).matchAll(/<th\b([^>]*)>/gu)) {
          assert.ok(/scope="(col|row)"/u.test(m[1]), 'заголовок таблицы без области действия');
        }
      });
    }
  }
});

describe('экран заказа помещается в окно', () => {
  /**
   * Заказчик потребовал одного: страница отдельного заказа не должна
   * прокручиваться (решение Р-169). Высоту по снимку не измерить — она
   * считается браузером, — но три условия проверяемы по разметке и вместе
   * запирают тот состав, под который бюджет посчитан:
   *
   * 1. панель на экране одна — второй ряд колонок не поместился бы;
   * 2. вне панели стоят только шапка, блок готовности и свёртки;
   * 3. форма на экране одна — отправка сообщения; у эксперта её нет.
   *
   * Высота проверяется в браузере при пересъёмке: 900 px при окне 900 у
   * всех четырёх ролей.
   */
  const orders = ['client', 'expert', 'manager', 'head'].flatMap((folder) =>
    screens(folder).filter((file) => /projects[\\/][^\\/]+[\\/]index\.html$/u.test(file)),
  );

  it('экраны заказа нашлись в снимках', () => {
    assert.ok(orders.length >= 4, `экранов заказа в снимках: ${orders.length}`);
  });

  for (const file of orders) {
    const name = path.relative(PROTOTYPE, file);
    it(`${name}: состав экрана не разросся`, () => {
      // Считается содержимое `main`: форма выхода живёт в шапке каркаса и
      // к составу экрана отношения не имеет.
      const html = body(file).match(/<main\b[\s\S]*?<\/main>/u)?.[0] ?? '';
      assert.ok(html.length > 0, 'содержимое экрана не найдено');
      assert.equal((html.match(/class="cab-board"/gu) ?? []).length, 1, 'панель не одна');
      assert.equal((html.match(/<h1\b/gu) ?? []).length, 1, 'заголовков работы не один');
      // Формы внутри свёрток места не занимают: свёртка сомкнута, и это
      // проверено правилом выше. Считаются те, что стоят на виду, — их
      // должна быть самое большее одна, отправка сообщения.
      const open = html.replace(/<details\b[\s\S]*?<\/details>/gu, '');
      const forms = (open.match(/<form\b/gu) ?? []).length;
      assert.ok(forms <= 1, `форм на виду: ${forms}`);
    });
  }
});

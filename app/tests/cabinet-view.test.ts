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

describe('перечень работ отбирается, а не листается', () => {
  /**
   * У руководителя работ пятьдесят пять — весь объём книги заказов, — и
   * перечень вырастал до шести экранов прокрутки. Отбор ложится поверх
   * `scopeProjects`, то есть разграничение ролей не трогает (Р-171).
   *
   * Полоса отбора появляется не всегда: при трёх работах она добавила бы
   * сотню пикселей и ничего не сообщила. Правило проверяет связь —
   * плашек на странице много, значит полоса обязана быть.
   */
  const lists = ['client', 'expert', 'manager', 'head'].flatMap((folder) =>
    screens(folder).filter((file) => /projects[^/\\]*[/\\]index\.html$/u.test(file)),
  );

  for (const file of lists) {
    const name = path.relative(PROTOTYPE, file);
    it(`${name}: при длинном перечне есть отбор`, () => {
      const html = body(file).match(/<main\b[\s\S]*?<\/main>/u)?.[0] ?? '';
      const cards = (html.match(/<li class="cab-card/gu) ?? []).length;
      // Граница та же, что у выборки: полоса появляется, когда работ
      // больше восьми (`PROJECT_FILTER_FROM`). Пока правило требовало её
      // начиная с восьми, снимок ровно с восемью работами валил проверку,
      // хотя экран вёл себя правильно.
      if (cards <= 8) return;
      assert.ok(
        /aria-label="Отбор работ"/u.test(html),
        `плашек ${cards}, а полосы отбора нет`,
      );
    });

    /**
     * Работа стоит на экране один раз.
     *
     * Блок «Требует внимания» и перечень считались порознь, и работа с
     * этапом в ожидании попадала в оба: строкой сверху и плашкой ниже, с
     * тем же состоянием в шкале. На вкладке «Ждут» это были два написания
     * одного списка (решение Р-175). Код работы уникален, и повтор виден
     * по нему.
     */
    it(`${name}: работа не показана дважды`, () => {
      const html = body(file).match(/<main\b[\s\S]*?<\/main>/u)?.[0] ?? '';
      const text = html.replace(/<[^>]*>/gu, ' ');
      const seen = new Map<string, number>();
      for (const code of text.matchAll(/PD-\d{4}-\d{3}/gu)) {
        seen.set(code[0], (seen.get(code[0]) ?? 0) + 1);
      }
      const twice = [...seen].filter(([, count]) => count > 1).map(([code]) => code);
      assert.deepEqual(twice, [], 'работа стоит в перечне и в блоке внимания разом');
    });

    it(`${name}: постраничность — цель нажатия 44 px`, () => {
      const html = body(file).match(/<nav\b[^>]*aria-label="Страницы[\s\S]*?<\/nav>/u)?.[0] ?? '';
      for (const m of html.matchAll(/<a\b([^>]*)>/gu)) {
        assert.ok(/class="[^"]*cab-mark/u.test(m[1]), 'ссылка постраничности мельче цели нажатия');
      }
    });
  }
});

describe('график не остаётся единственным носителем числа', () => {
  /**
   * График объявлен картинкой (`role="img"`), и читалка получает от него
   * только название: ни подсказки над столбцом, ни доли сектора до неё не
   * доходят. Значит рядом обязаны стоять те же числа текстом — таблицей,
   * свёрткой с таблицей или легендой со значениями. Требование записано в
   * шапке модуля графиков и в `docs/CABINET.md`, но до решения Р-175 ничем
   * не стереглось — и на экране обзора не выполнялось.
   */
  const charts = ['manager', 'head'].flatMap((folder) =>
    screens(folder).filter((file) => /<svg[^>]*role="img"/u.test(body(file))),
  );

  it('экраны с графиками нашлись в снимках', () => {
    assert.ok(charts.length >= 1, `экранов с графиками: ${charts.length}`);
  });

  for (const file of charts) {
    const name = path.relative(PROTOTYPE, file);
    it(`${name}: у каждого графика есть числа текстом`, () => {
      const html = body(file).match(/<main\b[\s\S]*?<\/main>/u)?.[0] ?? '';
      // Числа ищутся в пределах карточки графика, а не по всей странице.
      // Пока правило считало таблицы экрана целиком, вкладка «Деньги» с
      // двумя графиками и нулём чисел текстом проходила зелёной: внизу
      // стояла таблица совсем про другое (решение Р-176).
      const cards = html.match(/<section class="cab-card"[\s\S]*?<\/section>/gu) ?? [];
      const withChart = cards.filter((card) => /<svg[^>]*role="img"/u.test(card));
      assert.ok(withChart.length > 0, 'карточка с графиком не нашлась');
      for (const card of withChart) {
        const title = card.match(/<h2[^>]*>([^<]*)<\/h2>/u)?.[1] ?? '(без заголовка)';
        // Числами считается таблица рядом с графиком либо легенда со
        // значениями: и то и другое читается голосом.
        const numbers =
          (card.match(/<table\b/gu) ?? []).length + (card.match(/<li\b[\s\S]*?<\/li>/gu) ?? []).length;
        assert.ok(numbers > 0, `«${title}»: числа существуют только картинкой`);
      }
    });
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

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

describe('ни один экран не упал', () => {
  /**
   * Снимок снимается обходом по ссылкам, и упавший экран отдаёт не пустую
   * страницу, а `error.tsx` — «Не удалось показать раздел». Прежде это
   * ловилось лишь косвенно: правило счёта блоков спотыкалось о чужую
   * разметку. Теперь падение названо прямо (решение Р-185).
   */
  for (const folder of ['client', 'expert', 'manager', 'head']) {
    for (const file of screens(folder)) {
      it(path.relative(PROTOTYPE, file), () => {
        const html = body(file);
        assert.equal(
          /Не удалось показать раздел/u.test(html),
          false,
          'экран отдал состояние ошибки — выборка за ним бросает исключение',
        );
      });
    }
  }
});

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
      const cards = (html.match(/<li class="[^"]*cab-card/gu) ?? []).length;
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
      const cards = html.match(/<section class="(?:[^"]*\s)?cab-card(?:\s[^"]*)?"[\s\S]*?<\/section>/gu) ?? [];
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
      assert.equal((html.match(/class="(?:[^"]*\s)?cab-board(?:\s[^"]*)?"/gu) ?? []).length, 1, 'панель не одна');
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

describe('колонка сводки показывает столько, сколько обещает', () => {
  /**
   * Заголовок колонки несёт счётчик — «Требует внимания · 6», — и он
   * обязан совпадать с числом записей под ним. Прежде тело колонки
   * обрывалось на семи десятых окна и последняя запись резалась пополам:
   * счётчик обещал шесть, показаны были пять с половиной (решение Р-182).
   *
   * Проверяется по разметке: снимок снят с полной высоты страницы, и то,
   * что в нём есть, человек увидит прокруткой. Обратный случай — записей
   * больше, чем в счётчике, — тоже ошибка: он означал бы, что колонка
   * показывает чужое.
   */
  const summaries = ['manager', 'head']
    .map((folder) => path.join(PROTOTYPE, folder, 'manage', 'index.html'))
    .filter((file) => {
      try {
        readFileSync(file);
        return true;
      } catch {
        return false;
      }
    });

  it('сводки нашлись в снимках', () => {
    assert.equal(summaries.length, 2, `сводок в снимках: ${summaries.length}`);
  });

  for (const file of summaries) {
    const name = path.relative(PROTOTYPE, file);
    it(`${name}: счётчик колонки равен числу записей`, () => {
      const html = body(file).match(/<main\b[\s\S]*?<\/main>/u)?.[0] ?? '';
      const board = html.match(/<div class="(?:[^"]*\s)?cab-board(?:\s[^"]*)?"[\s\S]*<\/div>/u)?.[0] ?? '';
      assert.ok(board.length > 0, 'панель сводки не найдена');
      const columns = board.match(/<section class="(?:[^"]*\s)?cab-card(?:\s[^"]*)?"[\s\S]*?<\/section>/gu) ?? [];
      assert.ok(columns.length >= 2, `колонок в сводке: ${columns.length}`);
      let counted = 0;
      for (const column of columns) {
        const title = column.match(/<h2[^>]*>([^<]*)<\/h2>/u)?.[1] ?? '';
        const promised = title.match(/·\s*(\d+)\s*$/u);
        if (promised === null) continue;
        counted += 1;
        // Записи колонки — прямые дети её перечня; вложенных перечней в
        // колонках сводки нет.
        const rows = (column.match(/<li\b/gu) ?? []).length;
        assert.equal(rows, Number(promised[1]), `«${title}»: записей ${rows}`);
      }
      assert.ok(counted >= 1, 'ни одна колонка не несёт счётчика');
    });
  }

  for (const file of summaries) {
    const name = path.relative(PROTOTYPE, file);
    it(`${name}: колонка сводки не прокручивается внутри себя`, () => {
      const html = body(file).match(/<main\b[\s\S]*?<\/main>/u)?.[0] ?? '';
      const board = html.match(/<div class="(?:[^"]*\s)?cab-board(?:\s[^"]*)?"[\s\S]*<\/div>/u)?.[0] ?? '';
      // Свёртки в колонках сводки не стоят, и `cab-board-body` здесь
      // принадлежит только телу колонки.
      const scrolled = (board.match(/class="cab-board-body"[^>]*tabindex="0"/gu) ?? []).length;
      assert.equal(scrolled, 0, `прокручиваемых колонок: ${scrolled}`);
    });
  }
});

describe('страница не перегружена блоками', () => {
  /**
   * Требование заказчика: страница любой роли, кроме руководителя, несёт
   * не более пяти функциональных блоков. У руководителя предела нет —
   * его витрины (дашборд, аналитика, деньги) по устройству шире.
   *
   * Блок — прямой ребёнок `main`, несущий содержимое: карточка, панель
   * целиком, свёртка, группа плиток, блок готовности, перечень плашек.
   * Не считаются шапка экрана, полоса отбора и постраничность: они
   * управляют страницей, а не наполняют её. Панель из трёх колонок —
   * один блок, сомкнутая свёртка — блок; и то и другое решено заказчиком
   * (Р-183).
   *
   * Признак ставят общие части (`cab-block`, `cab-head`, `cab-filter`),
   * поэтому экран о нём не помнит. Второе условие ловит блок, собранный
   * мимо общих частей: такой ребёнок не имеет ни одного из признаков, и
   * счёт перестал бы быть верным.
   */
  const LIMIT = 5;
  const pages = ['client', 'expert', 'manager'].flatMap((folder) => screens(folder));

  it('экраны ролей нашлись в снимках', () => {
    assert.ok(pages.length >= 40, `экранов в снимках: ${pages.length}`);
  });

  /** Прямые дети `main` вместе с их классами. */
  function children(file: string): { tag: string; cls: string }[] {
    let html = body(file).match(/<main\b[^>]*>([\s\S]*)<\/main>/u)?.[1] ?? '';
    // Узкая колонка содержимого ширины не меняет смысла: блоки лежат в
    // ней, и считать надо их, а не обёртку.
    const column = html.match(/<div class="cab-column"[^>]*>([\s\S]*)<\/div>/u);
    if (column !== null) html = column[1] ?? html;
    const out: { tag: string; cls: string }[] = [];
    let depth = 0;
    let start = -1;
    const tagRe = /<(\/?)([a-z][a-z0-9]*)\b([^>]*)>/gu;
    const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'path', 'circle', 'rect', 'line', 'use', 'stop']);
    let match: RegExpExecArray | null;
    while ((match = tagRe.exec(html)) !== null) {
      const [whole, slash, tag, attrs] = match;
      if (VOID.has(tag) || whole.endsWith('/>')) continue;
      if (slash === '') {
        if (depth === 0) {
          start = match.index;
          out.push({ tag, cls: attrs.match(/class="([^"]*)"/u)?.[1] ?? '' });
        }
        depth += 1;
      } else {
        depth -= 1;
        if (depth === 0) start = -1;
      }
    }
    void start;
    return out;
  }

  for (const file of pages) {
    const name = path.relative(PROTOTYPE, file);
    it(`${name}: блоков не больше пяти`, () => {
      const kids = children(file);
      assert.ok(kids.length > 0, 'содержимое экрана не найдено');
      const blocks = kids.filter((kid) => / cab-block|^cab-block/u.test(` ${kid.cls}`));
      assert.ok(
        blocks.length <= LIMIT,
        `блоков на экране: ${blocks.length} (предел ${LIMIT})`,
      );
    });

    it(`${name}: каждый блок собран общей частью`, () => {
      const kids = children(file);
      const stray = kids.filter(
        (kid) =>
          kid.tag !== 'nav' &&
          kid.tag !== 'p' &&
          !/cab-block|cab-head|cab-filter/u.test(kid.cls),
      );
      assert.deepEqual(
        stray.map((kid) => `<${kid.tag} class="${kid.cls}">`),
        [],
        'на экране есть блок мимо общих частей — счёт блоков перестал быть верным',
      );
    });
  }
});

describe('карточки в ряду одного размера', () => {
  /**
   * Требование заказчика: карточки и блоки одного размера. Ряд из
   * карточек разной высоты читается как сбой раскладки, а не как
   * решение (решение Р-185).
   *
   * Проверяется по разметке: у сетки, где лежат карточки, не должно
   * стоять выравнивания по началу — оно и делает высоту разной. Точная
   * высота меряется в браузере при пересъёмке; здесь запирается то, чем
   * она задаётся.
   */
  it('сетки карточек не выравниваются по началу', () => {
    const root = path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet');
    const guilty: string[] = [];
    /**
     * Объектный литерал, внутри которого стоит `gridTemplateColumns`:
     * от его открывающей фигурной скобки до парной закрывающей.
     * Выравнивание ищется только в нём — выравнивание соседней строки
     * из чипов и кнопок к высоте карточек отношения не имеет.
     */
    const gridLiteral = (code: string, at: number): string => {
      let depth = 0;
      let open = -1;
      for (let i = at; i >= 0; i -= 1) {
        if (code[i] === '}') depth += 1;
        else if (code[i] === '{') {
          if (depth === 0) {
            open = i;
            break;
          }
          depth -= 1;
        }
      }
      if (open < 0) return '';
      depth = 0;
      for (let i = open; i < code.length; i += 1) {
        if (code[i] === '{') depth += 1;
        else if (code[i] === '}') {
          depth -= 1;
          if (depth === 0) return code.slice(open, i + 1);
        }
      }
      return code.slice(open);
    };
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.tsx')) {
          const code = readFileSync(full, 'utf8');
          for (const hit of code.matchAll(/gridTemplateColumns/gu)) {
            // `alignItems: 'start'` на самой сетке карточек означает
            // разную высоту в ряду.
            if (/alignItems:\s*'(start|flex-start)'/u.test(gridLiteral(code, hit.index))) {
              guilty.push(path.relative(root, full));
            }
          }
        }
      }
    };
    walk(root);
    assert.deepEqual(guilty, [], 'сетка карточек выравнена по началу — высота в ряду разная');
  });
});

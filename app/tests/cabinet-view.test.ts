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

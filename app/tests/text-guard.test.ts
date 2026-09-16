/**
 * Запрещённые формулировки. Проверяются две вещи: что перечень ловит именно
 * то, ради чего заведён, и что ни один экран кабинета, ни одно письмо и ни
 * один справочник его не нарушают.
 *
 * Проверка идёт по исходникам, а не по собранной странице: текст, которого
 * нет в исходнике, не появится и на экране, а разбирать собранную разметку
 * значило бы проверять сборщик, а не тексты.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { findForbidden, hasForbidden } from '../src/lib/cabinet/text-guard.ts';

describe('перечень ловит то, ради чего заведён', () => {
  const forbidden = [
    'Напишем вам диссертацию в срок',
    'Написание диссертации по вашей теме',
    'Диплом под ключ за две недели',
    'Рерайт статьи со скидкой',
    'Заказать работу онлайн',
    'Гарантия защиты или вернём деньги',
    'Повышение уникальности текста до 90%',
    'Обход антиплагиата вручную',
  ];
  for (const text of forbidden) {
    it(`ловит: ${text}`, () => {
      assert.equal(hasForbidden(text), true);
    });
  }
});

describe('законные обороты проверку проходят', () => {
  const allowed = [
    'Эксперт продолжит работу после загрузки протокола',
    'Проект сопровождения кандидатской диссертации',
    'Научное редактирование статьи и сопровождение подачи',
    'Оставшийся объём работы эксперта — два рабочих дня',
    'Тип сопровождения: научный консалтинг',
    'Работа остановлена до получения данных',
  ];
  for (const text of allowed) {
    it(`пропускает: ${text}`, () => {
      assert.equal(hasForbidden(text), false, `ложное срабатывание: ${text}`);
    });
  }
});

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('тексты кабинета соответствуют позиционированию', () => {
  const roots = [
    path.join(import.meta.dirname, '../src/app/cabinet'),
    path.join(import.meta.dirname, '../src/components/cabinet'),
    path.join(import.meta.dirname, '../src/lib/cabinet'),
  ];

  for (const root of roots) {
    it(path.basename(root), () => {
      const hits = collect(root).flatMap((file) =>
        // Сам перечень запрещённых оборотов по определению их содержит.
        file.endsWith('text-guard.ts')
          ? []
          : findForbidden(readFileSync(file, 'utf8'), path.relative(root, file)),
      );
      assert.deepEqual(
        hits.map((h) => `${h.where}:${h.line} — ${h.phrase}`),
        [],
        'в текстах кабинета найдены запрещённые формулировки',
      );
    });
  }
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { HIDDEN, PERSONAL_COLUMNS, anonymize, type Table } from '../src/lib/disk/sheet.ts';
import { xlsx } from '../src/lib/disk/xlsx.ts';
import { csv } from '../src/lib/disk/table.ts';

/**
 * Проверочный режим зеркала (решение Р-265): на личный Диск без договора
 * поручения уходят таблицы, в которых нельзя узнать человека.
 */
function sample(): Table {
  const head = ['Дата (МСК)', 'Имя', 'Контакт', 'Тема', 'Сумма', 'Состояние', 'Работа'];
  const data = [
    ['2026-09-27 12:00', 'Иванов Иван', 'ivan@example.org', 'Диссертация о кристаллах', { kopecks: 1_500_000n }, 'новая', 'PD-2026-057'],
    ['2026-09-26 09:30', '', '+7 900 000-00-00', '', '', 'в работе', ''],
  ] as const;
  return {
    file: 'Заявки.xlsx',
    name: 'zayavki.csv',
    rows: data.length,
    xlsx: xlsx({ title: 'Заявки', head, rows: data }),
    csv: csv(head, data),
    head,
    data,
  };
}

describe('обезличенная выгрузка на Диск', () => {
  it('закрывает имя, контакт и тему, пустое оставляет пустым', () => {
    const t = anonymize(sample());
    assert.deepEqual(t.data[0].slice(1, 4), [HIDDEN, HIDDEN, HIDDEN]);
    assert.deepEqual(t.data[1].slice(1, 4), ['', HIDDEN, '']);
  });

  it('даты, суммы, состояния и коды работ оставляет как есть', () => {
    const t = anonymize(sample());
    assert.equal(t.data[0][0], '2026-09-27 12:00');
    assert.deepEqual(t.data[0][4], { kopecks: 1_500_000n });
    assert.equal(t.data[0][5], 'новая');
    assert.equal(t.data[0][6], 'PD-2026-057');
  });

  it('в файлах, уходящих на Диск, персональных данных нет', () => {
    const t = anonymize(sample());
    for (const leak of ['Иванов', 'ivan@example.org', '+7 900', 'кристалл']) {
      assert.ok(!t.csv.includes(leak), `CSV: ${leak}`);
      assert.ok(!t.xlsx.includes(Buffer.from(leak, 'utf8')), `XLSX: ${leak}`);
    }
    assert.ok(t.csv.includes('PD-2026-057'));
  });

  it('закрывает столбцы всех реестров, где есть люди', () => {
    for (const col of ['Клиент', 'Менеджер', 'Исполнитель', 'Кем', 'Файл', 'Отзыв', 'Кто', 'Сообщение', 'Организация', 'Название']) {
      assert.ok(PERSONAL_COLUMNS.has(col), col);
    }
  });
});

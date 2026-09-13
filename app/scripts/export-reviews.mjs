/**
 * Выгрузка отзывов в таблицу.
 *
 * Отзывы копятся в базе вместе с заявками, помеченные `form: 'review'`.
 * Читать их там неудобно: нужен доступ к серверу и знание SQL. Этот скрипт
 * складывает их в один CSV, который открывается любой таблицей — облачной
 * или настольной, — и который можно положить на диск и вести как реестр:
 * что опубликовано, что нет, что отклонено.
 *
 * Личных данных в файле нет по устройству формы: она спрашивает роль и текст,
 * контакт не собирается вовсе (решение Р-110). Поэтому файл можно хранить в
 * облаке без оглядки на 152-ФЗ.
 *
 *   node scripts/export-reviews.mjs                  → ../deploy/exports/reviews.csv
 *   node scripts/export-reviews.mjs --stdout         → в поток вывода
 *   node scripts/export-reviews.mjs путь/к/файлу.csv → куда скажут
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const SOURCE_LABEL = {
  landing: 'Посадочная',
  postgrad: 'Аспирантам',
  students: 'Студентам',
  business: 'Компаниям',
};

/** Экранирование по RFC 4180: кавычки удваиваются, поле берётся в кавычки */
function cell(value) {
  const s = value == null ? '' : String(value);
  return '"' + s.replace(/"/g, '""') + '"';
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Не задан DATABASE_URL — подключаться некуда.');
  process.exit(1);
}
// Тот же драйвер, что у приложения (src/lib/db.ts): Prisma 7 без адаптера
// подключаться не умеет.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
try {
  const rows = await prisma.lead.findMany({
    where: { form: 'review' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true, source: true, name: true, message: true, status: true, notes: true },
  });

  const head = ['Дата', 'Страница', 'Кто', 'Отзыв', 'Состояние', 'Заметки', 'Идентификатор'];
  const lines = [head.map(cell).join(',')];
  for (const r of rows) {
    lines.push([
      r.createdAt.toISOString().slice(0, 16).replace('T', ' '),
      SOURCE_LABEL[r.source] ?? r.source,
      r.name ?? '',
      r.message ?? '',
      r.status ?? '',
      r.notes ?? '',
      r.id,
    ].map(cell).join(','));
  }
  // Разделитель строк CRLF и метка BOM: без них таблицы на Windows открывают
  // кириллицу вопросительными знаками, а строки — одной длинной ячейкой.
  const csv = '﻿' + lines.join('\r\n') + '\r\n';

  const arg = process.argv[2];
  if (arg === '--stdout') {
    process.stdout.write(csv);
  } else {
    const out = arg ?? path.join('..', 'deploy', 'exports', 'reviews.csv');
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, csv);
    console.error(`Выгружено отзывов: ${rows.length} → ${out}`);
  }
} finally {
  await prisma.$disconnect();
}

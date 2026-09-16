/**
 * Выгрузка заявок в таблицу.
 *
 * Пока не подключены почта и Telegram, заявка видна только в базе на сервере:
 * чтобы её прочитать, нужен доступ к серверу и запрос на SQL. Этот скрипт
 * складывает заявки в один CSV, который открывается любой таблицей.
 *
 * ВНИМАНИЕ: в файле персональные данные — имя, контакт, организация, текст
 * обращения. Это не выгрузка отзывов: её класть на облачный диск нельзя.
 * Файл хранится на сервере или на машине, с которой работает оператор, и
 * удаляется, как только перестал быть нужен. Выгрузка на сторонний сервис —
 * трансграничная передача, которой Политика не допускает.
 *
 *   node scripts/export-leads.mjs                  → ../deploy/exports/leads.csv
 *   node scripts/export-leads.mjs --stdout         → в поток вывода
 *   node scripts/export-leads.mjs путь/к/файлу.csv → куда скажут
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

// Имя формы складывается в submitLead из имени обработчика: submitTop → top.
const FORM_LABEL = {
  request: 'Основная',
  top: 'Вверху страницы',
  bottom: 'Внизу страницы',
  main: 'Главная',
};

const STATUS_LABEL = {
  NEW: 'Новая',
  IN_PROGRESS: 'В работе',
  CONSULTED: 'Консультация проведена',
  CONTRACTED: 'Договор заключён',
  DECLINED: 'Отказ',
  SPAM: 'Спам',
};

const CONTACT_LABEL = { email: 'Почта', phone: 'Телефон' };

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
  // Отзывы из выгрузки исключены: у них своя таблица и свой порядок работы
  // (scripts/export-reviews.mjs), а персональных данных в них нет.
  const rows = await prisma.lead.findMany({
    where: { NOT: { form: 'review' } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, createdAt: true, source: true, form: true,
      name: true, contactKind: true, contact: true, organization: true,
      topic: true, speciality: true, need: true, deadline: true,
      direction: true, message: true,
      consentGiven: true, consentVersion: true, termsAccepted: true,
      marketingOptIn: true, status: true, notes: true,
    },
  });

  const head = [
    'Дата', 'Страница', 'Форма', 'Имя', 'Контакт', 'Вид контакта', 'Организация',
    'Тема', 'Специальность', 'Что нужно', 'Срок', 'Направление', 'Сообщение',
    'Согласие', 'Редакция согласия', 'Акцепт оферты', 'Рассылка',
    'Состояние', 'Заметки', 'Идентификатор',
  ];
  const lines = [head.map(cell).join(',')];
  for (const r of rows) {
    lines.push([
      r.createdAt.toISOString().slice(0, 16).replace('T', ' '),
      SOURCE_LABEL[r.source] ?? r.source,
      FORM_LABEL[r.form] ?? r.form,
      r.name ?? '',
      r.contact ?? '',
      CONTACT_LABEL[r.contactKind] ?? r.contactKind ?? '',
      r.organization ?? '',
      r.topic ?? '',
      r.speciality ?? '',
      r.need ?? '',
      r.deadline ?? '',
      r.direction ?? '',
      r.message ?? '',
      r.consentGiven ? 'да' : 'нет',
      r.consentVersion ?? '',
      r.termsAccepted ? 'да' : 'нет',
      r.marketingOptIn ? 'да' : 'нет',
      STATUS_LABEL[r.status] ?? r.status ?? '',
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
    const out = arg ?? path.join('..', 'deploy', 'exports', 'leads.csv');
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, csv);
    console.error(`Выгружено заявок: ${rows.length} → ${out}`);
    console.error('В файле персональные данные: в облако не выкладывать.');
  }
} finally {
  await prisma.$disconnect();
}

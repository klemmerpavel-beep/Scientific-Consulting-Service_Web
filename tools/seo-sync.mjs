#!/usr/bin/env node
/**
 * Даты страниц для sitemap.xml и вопросы для разметки FAQPage — из макетов
 * (решение Р-1010).
 *
 * Запуск из корня репозитория:
 *   node tools/seo-sync.mjs            обновить порождаемые файлы
 *   node tools/seo-sync.mjs --check    только сверить; код 1 — расходятся
 *
 * Логика — в `app/scripts/seo-sync.mjs`: её импортирует
 * `tests/seo-sync.test.ts`, а образ приложения собирается из одного `app`.
 */

import { existsSync, readFileSync } from 'node:fs';

import {
  DATES_OUTPUT, FAQ_OUTPUT, expected, readDates, renderDates, renderFaq, writeAll,
} from '../app/scripts/seo-sync.mjs';

if (process.argv.includes('--check')) {
  const before = readDates();
  const { dates, faq } = expected();
  const stale = Object.keys(dates).filter((route) => dates[route].sha256 !== before[route]?.sha256);
  const faqStale = !existsSync(FAQ_OUTPUT) || readFileSync(FAQ_OUTPUT, 'utf8') !== renderFaq(faq);
  if (stale.length || faqStale) {
    if (stale.length) console.log(`Даты страниц устарели: ${stale.join(', ')} — макет изменён.`);
    if (faqStale) console.log('Вопросы для FAQPage расходятся с макетами.');
    console.log('Выполните: node tools/seo-sync.mjs');
    process.exit(1);
  }
  console.log('Даты страниц и вопросы FAQPage совпадают с макетами.');
} else {
  const before = existsSync(DATES_OUTPUT) ? readFileSync(DATES_OUTPUT, 'utf8') : '';
  const { dates, faq } = writeAll();
  const changed = before === renderDates(dates) ? 'даты прежние' : 'даты обновлены';
  const questions = Object.values(faq).reduce((sum, list) => sum + list.length, 0);
  console.log(`Поисковые данные: страниц ${Object.keys(dates).length} (${changed}), вопросов ${questions} -> ${DATES_OUTPUT}, ${FAQ_OUTPUT}`);
}

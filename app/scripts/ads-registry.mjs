#!/usr/bin/env node
/**
 * Реестр рекламы для кабинета руководителя (решение Р-550): проверка и
 * перенос в модуль приложения.
 *
 * Источник — `marketing/registry.json` и документы папки `marketing/`.
 * Образ приложения собирается из каталога `app/` и папки `marketing/` не
 * видит, поэтому реестр вместе с текстами документов переносится в модуль
 * `app/content/ads-registry.generated.ts`. Модуль лежит вне `src`: тексты
 * исследований цитируют конкурентов и списки минус-слов, и проверкам
 * формулировок кабинета (`text-guard`, `role-names`) их видеть незачем.
 *
 * Логика лежит в `app/scripts`, а не в `tools/`: её импортирует проверка
 * `tests/ads.test.ts`, и образ, собираемый из одного `app`, иначе не нашёл
 * бы модуль при проверке типов (как `cabinet-source.mjs`). Запуск — из
 * корня репозитория: `node tools/ads-registry.mjs`.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OUTPUT = path.join('app', 'content', 'ads-registry.generated.ts');

const CAMPAIGN = ['DRAFT', 'MODERATION', 'ACTIVE', 'PAUSED', 'FINISHED'];
const WORK = ['DONE', 'IN_PROGRESS', 'WAITING_OWNER', 'PLANNED'];
const SERVICE = ['NOT_CONNECTED', 'REQUESTED', 'READ_ONLY', 'ACTIVE', 'ERROR', 'NOT_PLANNED'];
const CONFIDENCE = ['sure', 'likely', 'risky'];
const DIRECTION = ['students', 'postgrad', 'all'];
const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const REPOSITORY = 'https://github.com/klemmerpavel-beep/Scientific-Consulting-Service_Web/blob/main/marketing/';

/**
 * Словарь экранов кабинета: те же правила, что проверки снимков
 * (`cabinet-view.test.ts`, `head-role-names.test.ts`) — без знаков-украшений
 * и прежних названий ролей. Документ, который их нарушает по существу
 * (цитаты конкурентов), в кабинете не разворачивается: помечается
 * `"cabinet": false` и открывается в репозитории.
 */
const SYMBOLS = /[←-⇿☀-➿✓✔✖\u{1F300}-\u{1FAFF}]/u;
const ROLE_NAMES = /[Ээ]ксперт(?!из)|[Ии]сполнител|Специалист практики/u;
const ID = /^[a-z0-9-]+$/u;

function fail(message) {
  throw new Error(`Реестр рекламы: ${message}`);
}

function check(condition, message) {
  if (!condition) fail(message);
}

function unique(rows, what) {
  const seen = new Set();
  for (const row of rows) {
    check(ID.test(row.id ?? row.slug), `${what}: идентификатор «${row.id ?? row.slug}» — только латиница, цифры и дефис`);
    const key = row.id ?? row.slug;
    check(!seen.has(key), `${what}: идентификатор «${key}» повторяется`);
    seen.add(key);
  }
}

function number(value, what) {
  check(typeof value === 'number' && Number.isFinite(value) && value >= 0, `${what}: ожидается неотрицательное число`);
}

/** Проверка реестра: незнакомое состояние, дата или ссылка — отказ с причиной. */
export function validateRegistry(source) {
  check(DAY.test(source.updated), 'дата обновления — ГГГГ-ММ-ДД');
  const test = source.test;
  check(DAY.test(test.from) && DAY.test(test.to) && test.from <= test.to, 'период теста задан неверно');
  number(test.budgetWithVat, 'бюджет теста');
  check(test.vatRate > 0 && test.vatRate < 1, 'ставка НДС — доля от 0 до 1');
  number(test.baselineDays, 'дни базового уровня');

  unique(source.docs, 'документ');
  const slugs = new Set(source.docs.map((doc) => doc.slug));
  const docRef = (value, what) => check(value === null || slugs.has(value), `${what}: нет документа «${value}»`);

  unique(source.campaigns, 'кампания');
  for (const row of source.campaigns) {
    check(CAMPAIGN.includes(row.status), `кампания ${row.id}: состояние «${row.status}»`);
    check(['students', 'postgrad'].includes(row.direction), `кампания ${row.id}: направление «${row.direction}»`);
    check(DAY.test(row.from) && DAY.test(row.to), `кампания ${row.id}: даты`);
    for (const field of ['budgetPlan', 'spend', 'impressions', 'clicks', 'leads']) number(row[field], `кампания ${row.id}, ${field}`);
    check(row.clicks <= row.impressions || row.impressions === 0, `кампания ${row.id}: кликов больше показов`);
    docRef(row.doc, `кампания ${row.id}`);
  }
  const campaignIds = new Set(source.campaigns.map((row) => row.id));
  for (const row of source.weeks) {
    check(DAY.test(row.week), 'неделя: дата понедельника — ГГГГ-ММ-ДД');
    check(campaignIds.has(row.campaign), `неделя ${row.week}: нет кампании «${row.campaign}»`);
    for (const field of ['spend', 'impressions', 'clicks', 'leads']) number(row[field], `неделя ${row.week}, ${field}`);
  }
  for (const row of source.conclusions) {
    check(DAY.test(row.date), 'вывод: дата');
    check(CONFIDENCE.includes(row.confidence), `вывод: уверенность «${row.confidence}»`);
    docRef(row.doc, 'вывод');
  }
  unique(source.proposals, 'предложение');
  for (const row of source.proposals) {
    check(DAY.test(row.date), `предложение ${row.id}: дата`);
    check(DIRECTION.includes(row.direction), `предложение ${row.id}: направление «${row.direction}»`);
    docRef(row.doc, `предложение ${row.id}`);
  }
  unique(source.works, 'работа');
  for (const row of source.works) {
    check(WORK.includes(row.status), `работа ${row.id}: состояние «${row.status}»`);
    check(row.due === null || DAY.test(row.due), `работа ${row.id}: срок`);
    docRef(row.doc, `работа ${row.id}`);
  }
  unique(source.services, 'сервис');
  for (const row of source.services) {
    check(SERVICE.includes(row.status), `сервис ${row.id}: состояние «${row.status}»`);
    check(DAY.test(row.updated), `сервис ${row.id}: дата обновления`);
  }
  // Выводы, предложения, работы и сервисы показываются на экранах
  // кабинета и держат его словарь так же, как документы.
  const { docs: _docs, ...screens } = source;
  const text = JSON.stringify(screens);
  const symbol = SYMBOLS.exec(text);
  check(symbol === null, `знак «${symbol?.[0]}» в тексте реестра — в кабинете знаки штриховые`);
  const role = ROLE_NAMES.exec(text);
  check(role === null, `«${role?.[0]}» в тексте реестра — прежнее название роли`);
  return source;
}

/** Проверенный реестр с текстами документов. */
export function loadRegistry(root = ROOT) {
  const base = path.join(root, 'marketing');
  const source = validateRegistry(JSON.parse(readFileSync(path.join(base, 'registry.json'), 'utf8')));
  const docs = source.docs.map((doc) => {
    const text = readFileSync(path.join(base, doc.path), 'utf8');
    const inCabinet = doc.cabinet !== false;
    if (inCabinet) {
      const symbol = SYMBOLS.exec(text);
      check(symbol === null, `документ ${doc.slug}: знак «${symbol?.[0]}» — в кабинете знаки штриховые`);
      const role = ROLE_NAMES.exec(text);
      check(role === null, `документ ${doc.slug}: «${role?.[0]}» — прежнее название роли; переформулируйте или пометьте "cabinet": false`);
    }
    return {
      slug: doc.slug,
      title: doc.title,
      group: doc.group,
      path: doc.path,
      // Документ вне кабинета показывается ссылкой на файл в репозитории.
      external: inCabinet ? null : REPOSITORY + doc.path.split('/').map(encodeURIComponent).join('/'),
      markdown: inCabinet ? text : '',
    };
  });
  return { ...source, docs };
}

/** Текст модуля: тот же для одинакового реестра, без даты сборки. */
export function renderModule(registry) {
  return [
    '// Сгенерировано tools/ads-registry.mjs из marketing/registry.json и документов',
    '// папки marketing/. Руками не править: правится источник, затем',
    '// `node tools/ads-registry.mjs` из корня репозитория (решение Р-550).',
    '',
    "import type { AdsRegistry } from '../src/lib/cabinet/ads/registry.ts';",
    '',
    `export const ADS_REGISTRY: AdsRegistry = ${JSON.stringify(registry, null, 2)};`,
    '',
  ].join('\n');
}

/** Перенос реестра в модуль приложения; возвращает проверенный реестр. */
export function writeRegistry(root = ROOT) {
  const registry = loadRegistry(root);
  mkdirSync(path.dirname(path.join(root, OUTPUT)), { recursive: true });
  writeFileSync(path.join(root, OUTPUT), renderModule(registry));
  return registry;
}

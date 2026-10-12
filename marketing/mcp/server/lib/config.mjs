/**
 * Конфигурация сервера — файл владельца, а не промт агента
 * (спецификация, раздел 1, принцип 2).
 *
 * В файле — потолки расхода и ставок по направлениям, режим записи и
 * песочница. Токены в файл не кладутся: только переменные окружения.
 */

import fs from 'node:fs';
import path from 'node:path';

export const DIRECTIONS = ['STU', 'PG'];

function fail(message) {
  throw new Error(`Конфигурация MCP: ${message}`);
}

function positive(value, where) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) fail(`${where} — положительное число`);
  return value;
}

/** Проверка и нормализация конфигурации; отказ называет поле. */
export function validateConfig(raw, { baseDir = process.cwd() } = {}) {
  if (!raw || typeof raw !== 'object') fail('ожидается объект');
  const config = {
    clientLogin: raw.clientLogin ?? null,
    sandbox: raw.sandbox !== false,
    apiVersion: raw.apiVersion ?? 'v5',
    write: raw.write === true,
    confirmTtlHours: raw.confirmTtlHours ?? 72,
    maxCodeAttempts: raw.maxCodeAttempts ?? 5,
    metrika: { counterId: raw.metrika?.counterId ?? null, goalId: raw.metrika?.goalId ?? null },
    journal: path.resolve(baseDir, raw.journal ?? 'var/journal.jsonl'),
    directions: {},
  };
  if (!/^v5\d*$/.test(config.apiVersion)) fail('apiVersion — v5 или v501');
  positive(config.confirmTtlHours, 'confirmTtlHours');
  positive(config.maxCodeAttempts, 'maxCodeAttempts');
  if (raw.autoStop?.enabled) fail('autoStop.enabled: остановка по порогу в каркас не входит, оставьте false');
  for (const key of DIRECTIONS) {
    const item = raw.directions?.[key];
    if (!item) fail(`directions.${key} не задано`);
    config.directions[key] = {
      title: item.title ?? key,
      bidMax: positive(item.bidMax, `directions.${key}.bidMax`),
      dailyBudgetMax: positive(item.dailyBudgetMax, `directions.${key}.dailyBudgetMax`),
      weeklySpendMax: positive(item.weeklySpendMax, `directions.${key}.weeklySpendMax`),
      monthlySpendMax: positive(item.monthlySpendMax, `directions.${key}.monthlySpendMax`),
    };
  }
  return config;
}

export function loadConfig(file) {
  const full = path.resolve(file);
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (error) {
    fail(`не читается ${full}: ${error.message}`);
  }
  return validateConfig(raw, { baseDir: path.dirname(full) });
}

/**
 * Направление кампании по имени: `PD_STU_…` — «Студентам», `PD_PG_…` —
 * «Аспирантам» (спецификация, раздел 3). Кампания вне схемы имён
 * направления не имеет, и предложения по ней сервер не принимает.
 */
export function directionOf(campaignName) {
  const match = /^PD_([A-Z]+)_/.exec(campaignName ?? '');
  return match && DIRECTIONS.includes(match[1]) ? match[1] : null;
}

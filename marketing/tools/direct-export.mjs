#!/usr/bin/env node
/**
 * Файлы загрузки кампаний Директа из `marketing/campaigns/direct.json`.
 *
 * Запуск из корня репозитория:
 *   node marketing/tools/direct-export.mjs
 *
 * Пишет в `marketing/campaigns/export/`:
 * - `<кампания>.tsv` — таблица для импорта в Директ Коммандер (UTF-8,
 *   табуляция, названия столбцов по-русски, порядок не важен) и для
 *   вставки на лист «Тексты» шаблона Excel. Строка — фраза; объявление в
 *   группе одно, его поля повторяются, Директ сводит одинаковые строки в
 *   одно объявление;
 * - `<кампания>-минус-слова.txt` — минус-слова кампании через запятую:
 *   их вводят при создании кампании, в таблицу они не входят;
 * - `тексты-объявлений.md` — все тексты для юриста и для ручного ввода.
 *
 * Параметры кампании (места показа, стратегия, расписание, счётчик) файл
 * не переносит: Директ их при загрузке не сохраняет, они задаются
 * вручную (`marketing/launch/05-загрузка-директа.md`).
 *
 * Перед записью источник проверяется; с замечаниями файлы не пишутся.
 */

import fs from 'node:fs';
import path from 'node:path';

import { loadCampaigns, ROOT, validateCampaigns } from './direct-campaigns.mjs';

export const OUTPUT = path.join(ROOT, 'marketing', 'campaigns', 'export');

/** Ссылка с метками: метки до якоря, иначе браузер не передаст их сайту. */
export function landingUrl(source, page, anchor) {
  return `${source.site}${page}?${source.utm}#${anchor}`;
}

function cell(value) {
  const text = String(value ?? '');
  if (/[\t\n\r]/.test(text)) throw new Error(`Табуляция или перевод строки в значении «${text}»`);
  return text;
}

export function campaignTable(source, campaign) {
  const headlines = Math.max(...campaign.groups.map((g) => g.ad.headlines.length));
  const texts = Math.max(...campaign.groups.map((g) => g.ad.texts.length));
  const columns = [
    'Доп. объявление группы',
    'Название группы',
    'Номер группы',
    'Фраза (с минус-словами)',
    ...Array.from({ length: headlines }, (_, i) => `Заголовок ${i + 1}`),
    ...Array.from({ length: texts }, (_, i) => `Текст ${i + 1}`),
    'Ссылка',
    'Отображаемая ссылка',
    'Регион',
    'Ставка',
    'Заголовки быстрых ссылок',
    'Описания быстрых ссылок',
    'Адреса быстрых ссылок',
    'Уточнения',
  ];
  const sitelinks = campaign.sitelinks;
  const rows = [];
  campaign.groups.forEach((group, index) => {
    for (const phrase of group.phrases) {
      rows.push([
        '-',
        group.name,
        index + 1,
        phrase,
        ...Array.from({ length: headlines }, (_, i) => group.ad.headlines[i] ?? ''),
        ...Array.from({ length: texts }, (_, i) => group.ad.texts[i] ?? ''),
        landingUrl(source, campaign.page, group.anchor),
        campaign.displayPath,
        campaign.regions.join(', '),
        group.bid ?? campaign.bid,
        sitelinks.map((s) => s.title).join('||'),
        sitelinks.map((s) => s.description).join('||'),
        sitelinks.map((s) => landingUrl(source, campaign.page, s.anchor)).join('||'),
        campaign.callouts.join('||'),
      ]);
    }
  });
  return [columns, ...rows].map((row) => row.map(cell).join('\t')).join('\n') + '\n';
}

export function negativesText(campaign) {
  return campaign.negative.join(', ') + '\n';
}

export function textsDocument(source) {
  const lines = [
    '# Тексты объявлений Директа',
    '',
    `Собрано из \`marketing/campaigns/direct.json\` (${source.updated}) командой`,
    '`node marketing/tools/direct-export.mjs`. Не править вручную: правка — в',
    'источнике, затем повторный запуск.',
    '',
    source.format + '.',
    '',
  ];
  for (const campaign of source.campaigns) {
    lines.push(
      `## ${campaign.name}`,
      '',
      `Страница — ${source.site}${campaign.page}; отображаемая ссылка — prodisser.ru/${campaign.displayPath}.`,
      `Период ${campaign.start} — ${campaign.end}; ${campaign.regions.join(', ')}; показы ${campaign.hours} по Москве.`,
      `Дневной бюджет ${campaign.dailyBudget} ₽ без НДС; ставка до ${campaign.bid} ₽.`,
      '',
    );
    campaign.groups.forEach((group, index) => {
      lines.push(`### ${index + 1}. ${group.name}${group.bid ? ` — ставка до ${group.bid} ₽` : ''}`, '');
      lines.push(`Ссылка: ${landingUrl(source, campaign.page, group.anchor)}`, '');
      lines.push('Фразы:', '', ...group.phrases.map((p) => `- ${p}`), '');
      lines.push('Заголовки:', '', ...group.ad.headlines.map((h, i) => `${i + 1}. ${h}`), '');
      lines.push('Тексты:', '', ...group.ad.texts.map((t, i) => `${i + 1}. ${t}`), '');
    });
    lines.push('### Быстрые ссылки', '', '| Заголовок | Описание | Якорь |', '|---|---|---|');
    for (const link of campaign.sitelinks) lines.push(`| ${link.title} | ${link.description} | #${link.anchor} |`);
    lines.push('', '### Уточнения', '', ...campaign.callouts.map((c) => `- ${c}`), '');
    lines.push('### Минус-слова кампании', '', campaign.negative.join(', '), '');
  }
  return lines.join('\n');
}

/** Все файлы выгрузки: имя — содержимое. */
export function exportFiles(source) {
  const files = { 'тексты-объявлений.md': textsDocument(source) };
  for (const campaign of source.campaigns) {
    files[`${campaign.name}.tsv`] = campaignTable(source, campaign);
    files[`${campaign.name}-минус-слова.txt`] = negativesText(campaign);
  }
  return files;
}

function main() {
  const source = loadCampaigns();
  const problems = validateCampaigns(source);
  if (problems.length) {
    console.error(`Кампании не прошли проверку:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  fs.mkdirSync(OUTPUT, { recursive: true });
  const files = exportFiles(source);
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(OUTPUT, name), content, 'utf8');
  console.log(`Выгрузка Директа: файлов ${Object.keys(files).length} -> ${path.relative(ROOT, OUTPUT)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

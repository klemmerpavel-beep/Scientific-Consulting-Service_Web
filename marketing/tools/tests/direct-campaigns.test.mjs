import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { bannedIn, loadCampaigns, negativeHits, ROOT, validateCampaigns } from '../direct-campaigns.mjs';
import { campaignTable, exportFiles, landingUrl, OUTPUT } from '../direct-export.mjs';

const source = loadCampaigns();

function copy() {
  return JSON.parse(JSON.stringify(source));
}

test('источник кампаний проходит все проверки', () => {
  assert.deepEqual(validateCampaigns(source), []);
});

test('минус-слово гасит свои словоформы, но не похожие слова', () => {
  assert.deepEqual(negativeHits('пример курсовой работы', ['курсовая']), ['курсовая']);
  assert.deepEqual(negativeHits('сопровождение кандидатской диссертации', ['диссертоп']), []);
  assert.deepEqual(negativeHits('нормоконтроль вкр', ['контрольная']), []);
  assert.deepEqual(negativeHits('сопровождение научной работы', ['работа']), ['работа']);
  assert.deepEqual(negativeHits('решение задач по физике', ['решение задач']), ['решение задач']);
  assert.deepEqual(negativeHits('решение по диплому', ['решение задач']), []);
});

test('запрещённые формулировки называют причину', () => {
  assert.match(bannedIn('Напишем ВКР за неделю').join(), /п\. 10 ст\. 7/);
  assert.match(bannedIn('Работаем с 2016 года').join(), /Р-01/);
  assert.match(bannedIn('Лучшие кураторы').join(), /превосходная степень/);
  assert.deepEqual(bannedIn('Научный коллектив с 2016 года'), []);
});

test('длина, минус-слово и формулировка ловятся с указанием места', () => {
  const broken = copy();
  const stu = broken.campaigns[0];
  stu.groups[0].ad.headlines[0] = 'Сопровождение выпускной квалификационной работы бакалавра';
  stu.groups[0].phrases.push('курсовая работа на заказ');
  stu.callouts[0] = 'Гарантия защиты';
  const problems = validateCampaigns(broken).join('\n');
  assert.match(problems, /STU_SUPPORT, заголовок: 57 знаков при пределе 56/);
  assert.match(problems, /фразу «курсовая работа на заказ» гасит минус-слово/);
  assert.match(problems, /уточнение: «Гарантия защиты» — гарантия результата/);
});

test('комбинаторное объявление: не больше 7 заголовков и 3 текстов, слово не длиннее 22 знаков', () => {
  const broken = copy();
  const group = broken.campaigns[1].groups[0];
  group.ad.headlines = Array.from({ length: 8 }, (_, i) => `Сопровождение диссертации ${i + 1}`);
  group.ad.texts = ['Один.', 'Два.', 'Три.', 'Четыре.'];
  broken.campaigns[1].groups[1].ad.headlines.push('Научно-консультационноесопровождение');
  const problems = validateCampaigns(broken).join('\n');
  assert.match(problems, /PG_SUPPORT: заголовков 8, нужно от 1 до 7/);
  assert.match(problems, /PG_SUPPORT: текстов 4, нужно от 1 до 3/);
  assert.match(problems, /PG_ADVISOR, заголовок: слово «Научно-консультационноесопровождение» длиннее 22/);
});

test('заголовки первых четырёх быстрых ссылок длиннее 66 знаков — отказ', () => {
  const broken = copy();
  broken.campaigns[0].sitelinks[2].title = 'Из чего складывается смета';
  assert.match(validateCampaigns(broken).join('\n'), /заголовки быстрых ссылок 1–4 — 78 знаков при пределе 66/);
});

test('якорь, которого нет на посадочной, — отказ', () => {
  const broken = copy();
  broken.campaigns[1].groups[0].anchor = 'prices';
  assert.match(validateCampaigns(broken).join('\n'), /якоря #prices нет на \/main/);
});

test('описание для чтения расходится с источником — отказ', () => {
  const broken = copy();
  broken.campaigns[0].groups[1].ad.texts[0] = 'Разбор плана и глав по этапам.';
  assert.match(validateCampaigns(broken).join('\n'), /direct-студенты\.md: нет текста «Разбор плана и глав по этапам\.»/);
});

test('объявление Авито без запрещённых формулировок', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'marketing', 'campaigns', 'avito-студенты.md'), 'utf8');
  const text = doc.slice(doc.indexOf('## 2. Текст'), doc.indexOf('## 3.'));
  assert.ok(text.length > 200, 'раздел текста найден');
  assert.deepEqual(bannedIn(text.replace(/\n/g, ' ')), []);
});

test('метки в ссылке стоят до якоря', () => {
  const url = landingUrl(source, '/students', 'norm');
  assert.ok(url.startsWith('https://prodisser.ru/students?utm_source=yandex&'));
  assert.ok(url.endsWith('#norm'));
  assert.equal(url.indexOf('#'), url.length - '#norm'.length);
});

test('таблица загрузки: строка на фразу, одно объявление на группу, ставка группы B', () => {
  const pg = source.campaigns.find((c) => c.direction === 'PG');
  const [header, ...rows] = campaignTable(source, pg).trim().split('\n').map((line) => line.split('\t'));
  assert.equal(rows.length, pg.groups.reduce((sum, g) => sum + g.phrases.length, 0));
  assert.ok(rows.every((row) => row.length === header.length));
  const bid = header.indexOf('Ставка');
  const group = header.indexOf('Название группы');
  assert.ok(rows.filter((r) => r[group] === 'PG_GRANTS').every((r) => r[bid] === '300'));
  assert.ok(rows.filter((r) => r[group] === 'PG_SUPPORT').every((r) => r[bid] === '360'));
  assert.equal(rows[0][header.indexOf('Доп. объявление группы')], '-');
});

test('файлы выгрузки совпадают с источником', () => {
  for (const [name, content] of Object.entries(exportFiles(source))) {
    const file = path.join(OUTPUT, name);
    assert.ok(fs.existsSync(file), `${name} не выгружен: node marketing/tools/direct-export.mjs`);
    assert.equal(fs.readFileSync(file, 'utf8'), content, `${name} устарел: node marketing/tools/direct-export.mjs`);
  }
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { bannedIn, loadCampaigns, negativeHits, ROOT, validateCampaigns } from '../direct-campaigns.mjs';

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
  stu.groups[0].ads[0].title2 = 'Очень длинный второй заголовок объявления';
  stu.groups[0].phrases.push('курсовая работа на заказ');
  stu.callouts[0] = 'Гарантия защиты';
  const problems = validateCampaigns(broken).join('\n');
  assert.match(problems, /STU_SUPPORT, заголовок 2: 41 знаков при пределе 30/);
  assert.match(problems, /фразу «курсовая работа на заказ» гасит минус-слово/);
  assert.match(problems, /уточнение: «Гарантия защиты» — гарантия результата/);
});

test('якорь, которого нет на посадочной, — отказ', () => {
  const broken = copy();
  broken.campaigns[1].groups[0].anchor = 'prices';
  assert.match(validateCampaigns(broken).join('\n'), /якоря #prices нет на \/main/);
});

test('описание для чтения расходится с источником — отказ', () => {
  const broken = copy();
  broken.campaigns[0].groups[1].ads[0].text = 'Разбор плана и глав по этапам.';
  assert.match(validateCampaigns(broken).join('\n'), /direct-студенты\.md: нет текста «Разбор плана и глав по этапам\.»/);
});

test('объявление Авито без запрещённых формулировок', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'marketing', 'campaigns', 'avito-студенты.md'), 'utf8');
  const text = doc.slice(doc.indexOf('## 2. Текст'), doc.indexOf('## 3.'));
  assert.ok(text.length > 200, 'раздел текста найден');
  assert.deepEqual(bannedIn(text.replace(/\n/g, ' ')), []);
});

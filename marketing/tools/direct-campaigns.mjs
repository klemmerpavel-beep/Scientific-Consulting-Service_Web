/**
 * Кампании Директа: проверка источника `marketing/campaigns/direct.json`.
 *
 * Источник — один на обе кампании; описания для чтения —
 * `direct-студенты.md` и `direct-аспиранты.md`, и проверка следит, чтобы
 * тексты объявлений в них совпадали с источником.
 *
 * Что проверяется до загрузки, а не на модерации:
 * - длины заголовков, текста, быстрых ссылок, уточнений, отображаемой ссылки;
 * - фразы, которые гасит собственное минус-слово кампании;
 * - формулировки, запрещённые п. 10 ст. 7 38-ФЗ по разбору Р-549, и
 *   «работаем с 2016 года» о компании (Р-01: ООО зарегистрировано в 2025);
 * - якоря посадочных страниц в макетах.
 */

import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const SOURCE = path.join(ROOT, 'marketing', 'campaigns', 'direct.json');

/**
 * Пределы Директа для комбинаторного объявления ЕПК на поиске
 * (`marketing/research/07-директ-загрузка-и-api.md`, раздел 7). Знаки
 * препинания текст в 81 знак не увеличивают: проверка считает их, с запасом.
 */
export const LIMITS = {
  headline: 56,
  headlines: 7,
  headlineWord: 22,
  text: 81,
  texts: 3,
  textWord: 23,
  sitelinkTitle: 30,
  sitelinkDescription: 60,
  sitelinkTitlesPerFour: 66,
  callout: 25,
  calloutsTotal: 132,
  displayPath: 20,
  phraseWords: 7,
  phraseChars: 4096,
  groupPhrases: 200,
  campaignNegativeChars: 20000,
  negativeWords: 7,
};

/**
 * Запрещённые формулировки. Каждая — с причиной: отказ должен объяснять,
 * что не так, а не только где.
 */
export const BANNED = [
  { pattern: /напиш|написан|написать/i, why: 'выполнение работы за клиента, п. 10 ст. 7 (Р-549)' },
  { pattern: /под ключ/i, why: 'выполнение работы за клиента, п. 10 ст. 7 (Р-02, Р-549)' },
  { pattern: /на заказ/i, why: 'выполнение работы за клиента, п. 10 ст. 7 (Р-549)' },
  { pattern: /готов(ая|ые|ую) работ/i, why: 'продажа готовых работ, п. 10 ст. 7' },
  { pattern: /гарант/i, why: 'гарантия результата защиты или публикации не подтверждается' },
  { pattern: /антиплагиат|уникальност|оригинальност/i, why: 'обход проверки заимствований' },
  { pattern: /лучш|№\s?1|номер один|самый/i, why: 'превосходная степень без подтверждения, ч. 3 ст. 5 (Р-02)' },
  { pattern: /работаем с 2016|компания работает с|с 2016 года работаем/i, why: 'год коллектива приписан компании: ООО зарегистрировано 02.06.2025 (Р-01)' },
  { pattern: /!/, why: 'восклицательные знаки не используются в объявлениях проекта' },
];

const MARKUP = { STU: 'StudentsPage.dc.html', PG: 'MainPage.dc.html' };

function normalize(word) {
  return word.toLowerCase().replace(/ё/g, 'е');
}

/** Окончания, отбрасываемые при сравнении словоформ, — от длинных к коротким. */
const ENDINGS = [
  'ами', 'ями', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ать', 'ять', 'еть', 'ить', 'ешь', 'ете', 'ите',
  'ала', 'али', 'ало', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ой', 'ый', 'ий', 'ом', 'ем', 'ам', 'ям', 'ах',
  'ях', 'ов', 'ев', 'ей', 'ую', 'юю', 'ет', 'ит', 'ут', 'ют', 'ат', 'ят', 'ал', 'ть',
  'а', 'я', 'о', 'е', 'ы', 'и', 'у', 'ю', 'ь', 'й',
];

function stemOf(word) {
  for (const ending of ENDINGS) {
    if (word.endsWith(ending) && word.length - ending.length >= 3) return word.slice(0, -ending.length);
  }
  return word;
}

/**
 * Гасит ли минус-слово фразу. Директ отсекает все словоформы минус-слова;
 * словоформа здесь — та же основа после отбрасывания окончания. Слово не
 * из словаря («диссертоп») совпадает только целиком, как и в Директе.
 */
export function negativeHits(phrase, negatives) {
  const words = phrase.split(/\s+/).map(normalize);
  const hits = [];
  for (const negative of negatives) {
    const parts = negative.split(/\s+/).map(normalize);
    const matches = parts.every((part) => words.some((word) => word === part || stemOf(word) === stemOf(part)));
    if (matches) hits.push(negative);
  }
  return hits;
}

export function bannedIn(text) {
  return BANNED.filter((rule) => rule.pattern.test(text)).map((rule) => rule.why);
}

/** Все проверки; возвращает список замечаний, пустой — источник годен. */
export function validateCampaigns(source, { root = ROOT } = {}) {
  const problems = [];
  const check = (condition, message) => {
    if (!condition) problems.push(message);
  };
  const length = (value, max, where) => check(typeof value === 'string' && value.length > 0 && value.length <= max, `${where}: ${value?.length ?? 0} знаков при пределе ${max} — «${value}»`);
  const clean = (value, where) => {
    for (const why of bannedIn(value)) problems.push(`${where}: «${value}» — ${why}`);
  };
  const words = (value, max, where) => {
    const long = (value ?? '').split(/[\s,.:;«»"()]+/).find((word) => word.length > max);
    check(!long, `${where}: слово «${long}» длиннее ${max} знаков`);
  };

  check(Array.isArray(source.campaigns) && source.campaigns.length > 0, 'нет кампаний');
  const names = new Set();
  for (const campaign of source.campaigns ?? []) {
    const at = campaign.name;
    check(!names.has(at), `${at}: имя повторяется`);
    names.add(at);
    check(/^PD_(STU|PG)_SRCH_[A-Z-]+_[A-Z]+_v\d+$/.test(at), `${at}: имя вне схемы PD_{направление}_SRCH_{гео}_{вариант}_v{n}`);
    check(at.startsWith(`PD_${campaign.direction}_`), `${at}: направление ${campaign.direction} не совпадает с именем`);
    check(campaign.start <= campaign.end, `${at}: начало позже окончания`);
    check(campaign.dailyBudget > 0 && campaign.bid > 0, `${at}: бюджет и ставка — больше нуля`);
    length(campaign.displayPath, LIMITS.displayPath, `${at}, отображаемая ссылка`);
    check(/^[\p{L}\d\-№/%#]+$/u.test(campaign.displayPath ?? ''), `${at}: в отображаемой ссылке допустимы буквы, цифры и - № / % #`);

    const markupFile = path.join(root, 'design', MARKUP[campaign.direction] ?? '');
    const markup = fs.existsSync(markupFile) ? fs.readFileSync(markupFile, 'utf8') : '';
    check(markup !== '', `${at}: нет макета посадочной для направления ${campaign.direction}`);
    const anchor = (name, where) => check(markup.includes(`id="${name}"`), `${where}: якоря #${name} нет на ${campaign.page}`);

    const sitelinks = campaign.sitelinks ?? [];
    check(sitelinks.length >= 4 && sitelinks.length <= 8, `${at}: быстрых ссылок ${sitelinks.length}, нужно от 4 до 8`);
    for (const link of sitelinks) {
      length(link.title, LIMITS.sitelinkTitle, `${at}, быстрая ссылка`);
      length(link.description, LIMITS.sitelinkDescription, `${at}, описание быстрой ссылки`);
      check(!/[!?[\]]/.test(link.title + link.description), `${at}, быстрая ссылка «${link.title}»: знаки ! ? [ ] не допускаются`);
      anchor(link.anchor, `${at}, быстрая ссылка «${link.title}»`);
      clean(link.title, `${at}, быстрая ссылка`);
      clean(link.description, `${at}, описание быстрой ссылки`);
    }
    // Не уложится набор — Директ не покажет ни одной быстрой ссылки.
    for (const [from, to] of [[0, 4], [4, 8]]) {
      const sum = sitelinks.slice(from, to).reduce((total, link) => total + (link.title?.length ?? 0), 0);
      check(sum <= LIMITS.sitelinkTitlesPerFour, `${at}: заголовки быстрых ссылок ${from + 1}–${to} — ${sum} знаков при пределе ${LIMITS.sitelinkTitlesPerFour}`);
    }
    const callouts = campaign.callouts ?? [];
    for (const callout of callouts) {
      length(callout, LIMITS.callout, `${at}, уточнение`);
      clean(callout, `${at}, уточнение`);
    }
    const calloutsTotal = callouts.reduce((total, callout) => total + callout.length, 0);
    check(calloutsTotal <= LIMITS.calloutsTotal, `${at}: уточнения — ${calloutsTotal} знаков при пределе ${LIMITS.calloutsTotal}`);

    const negatives = campaign.negative ?? [];
    check(new Set(negatives).size === negatives.length, `${at}: минус-слова повторяются`);
    const negativeChars = negatives.join('').replace(/\s/g, '').length;
    check(negativeChars <= LIMITS.campaignNegativeChars, `${at}: минус-слова — ${negativeChars} знаков при пределе ${LIMITS.campaignNegativeChars}`);
    for (const negative of negatives) {
      check(negative.split(/\s+/).length <= LIMITS.negativeWords, `${at}: в минус-фразе «${negative}» больше ${LIMITS.negativeWords} слов`);
    }
    const groups = new Set();
    for (const group of campaign.groups ?? []) {
      const where = `${at} / ${group.name}`;
      check(!groups.has(group.name), `${where}: группа повторяется`);
      groups.add(group.name);
      check(group.name.startsWith(`${campaign.direction}_`), `${where}: имя группы начинается не с ${campaign.direction}_`);
      anchor(group.anchor, where);
      check((group.phrases ?? []).length > 0, `${where}: нет фраз`);
      const phrases = group.phrases ?? [];
      check(phrases.length > 0 && phrases.length <= LIMITS.groupPhrases, `${where}: фраз ${phrases.length}, нужно от 1 до ${LIMITS.groupPhrases}`);
      for (const phrase of phrases) {
        check(phrase.split(/\s+/).length <= LIMITS.phraseWords, `${where}: во фразе «${phrase}» больше ${LIMITS.phraseWords} слов`);
        check(phrase.length <= LIMITS.phraseChars, `${where}: фраза длиннее ${LIMITS.phraseChars} знаков`);
        const hits = negativeHits(phrase, negatives);
        check(hits.length === 0, `${where}: фразу «${phrase}» гасит минус-слово ${hits.map((h) => `«${h}»`).join(', ')}`);
      }
      // Одно комбинаторное объявление на группу: Директ сам собирает
      // сочетания, поэтому любой заголовок должен читаться с любым текстом.
      const headlines = group.ad?.headlines ?? [];
      const texts = group.ad?.texts ?? [];
      check(headlines.length > 0 && headlines.length <= LIMITS.headlines, `${where}: заголовков ${headlines.length}, нужно от 1 до ${LIMITS.headlines}`);
      check(texts.length > 0 && texts.length <= LIMITS.texts, `${where}: текстов ${texts.length}, нужно от 1 до ${LIMITS.texts}`);
      check(new Set(headlines).size === headlines.length && new Set(texts).size === texts.length, `${where}: заголовки или тексты повторяются`);
      for (const headline of headlines) {
        length(headline, LIMITS.headline, `${where}, заголовок`);
        words(headline, LIMITS.headlineWord, `${where}, заголовок`);
        clean(headline, `${where}, заголовок`);
      }
      for (const text of texts) {
        length(text, LIMITS.text, `${where}, текст`);
        words(text, LIMITS.textWord, `${where}, текст`);
        clean(text, `${where}, текст`);
      }
    }

    // Описание для чтения не должно расходиться с источником: владелец и
    // юрист читают .md, а загружается .json.
    const docFile = path.join(root, 'marketing', 'campaigns', campaign.doc ?? '');
    if (fs.existsSync(docFile)) {
      const doc = fs.readFileSync(docFile, 'utf8');
      for (const group of campaign.groups ?? []) {
        for (const value of [...(group.ad?.headlines ?? []), ...(group.ad?.texts ?? [])]) {
          check(doc.includes(value), `${campaign.doc}: нет текста «${value}» из ${group.name} — описание разошлось с источником`);
        }
      }
      for (const callout of campaign.callouts ?? []) check(doc.includes(callout), `${campaign.doc}: нет уточнения «${callout}»`);
      for (const link of campaign.sitelinks ?? []) check(doc.includes(link.title), `${campaign.doc}: нет быстрой ссылки «${link.title}»`);
    } else {
      problems.push(`${at}: нет описания ${campaign.doc}`);
    }
  }
  return problems;
}

export function loadCampaigns(file = SOURCE) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

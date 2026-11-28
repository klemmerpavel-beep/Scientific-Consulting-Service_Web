/**
 * IndexNow: сообщение Яндексу об изменённых страницах после выката
 * (решение Р-1024).
 *
 * - Ключ опубликован файлом в корне сайта и совпадает с ключом сценария.
 * - Отправляются только адреса своего узла с датой изменения в окне цикла
 *   выпуска; адрес без даты не отправляется.
 * - Шаг стоит после внешней проверки сайта и выкат не роняет.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const indexnow = await import('../scripts/indexnow.mjs');

describe('IndexNow: ключ и его файл (Р-1024)', () => {
  it('ключ — от 8 до 128 знаков из латиницы, цифр и дефиса, как требует протокол', () => {
    assert.match(indexnow.KEY, /^[A-Za-z0-9-]{8,128}$/u);
  });

  it('файл ключа лежит в корне сайта, назван ключом и содержит только его', () => {
    const file = path.join(ROOT, 'app', 'public', `${indexnow.KEY}.txt`);
    assert.ok(existsSync(file), 'нет файла ключа в app/public');
    assert.equal(readFileSync(file, 'utf8'), indexnow.KEY);
  });

  it('в корне сайта один файл ключа: прежний ключ после замены не остаётся', () => {
    const keys = readdirSync(path.join(ROOT, 'app', 'public')).filter((name) => /^[a-f0-9]{32}\.txt$/u.test(name));
    assert.deepEqual(keys, [`${indexnow.KEY}.txt`]);
  });

  it('robots.txt файл ключа не закрывает', () => {
    const robots = read('app', 'src', 'app', 'robots.txt', 'body.ts');
    assert.doesNotMatch(robots, /Disallow: \/\*\.txt|Disallow: \/\s*['"`\n]/u);
  });

  it('узел и адрес приёма — боевой сайт и Яндекс', () => {
    assert.equal(indexnow.HOST, 'prodisser.ru');
    assert.equal(indexnow.ENDPOINT, 'https://yandex.com/indexnow');
  });
});

describe('IndexNow: какие адреса отправляются (Р-1024)', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://prodisser.ru/</loc><lastmod>2026-11-25</lastmod><priority>1</priority></url>
<url>
<loc>https://prodisser.ru/main</loc>
<lastmod>2026-11-28</lastmod>
</url>
<url><loc>https://prodisser.ru/offer</loc><lastmod>2026-10-01</lastmod></url>
<url><loc>https://prodisser.ru/cabinet</loc></url>
<url><loc>https://example.com/чужой</loc><lastmod>2026-11-28</lastmod></url>
<url><loc>https://prodisser.ru/tools</loc><lastmod>2026-11-20T10:00:00+03:00</lastmod></url>
<url><loc>https://prodisser.ru/grant</loc><lastmod>2026-12-05</lastmod></url>
</urlset>`;
  const entries = indexnow.parseSitemap(xml);

  it('карта разбирается: адрес и дата без времени; адрес без даты остаётся с пустой датой', () => {
    assert.equal(entries.length, 7);
    assert.deepEqual(entries[1], { loc: 'https://prodisser.ru/main', lastmod: '2026-11-28' });
    assert.deepEqual(entries[3], { loc: 'https://prodisser.ru/cabinet', lastmod: null });
    assert.equal(entries[5].lastmod, '2026-11-20');
  });

  it('отправляются адреса своего узла, изменённые за восемь дней: субботний цикл и день запаса', () => {
    assert.equal(indexnow.WINDOW_DAYS, 8);
    assert.deepEqual(indexnow.pickChanged(entries, '2026-11-28'), ['https://prodisser.ru/', 'https://prodisser.ru/main', 'https://prodisser.ru/tools']);
  });

  it('старая страница, страница без даты, чужой узел и дата из будущего не отправляются', () => {
    const sent = indexnow.pickChanged(entries, '2026-11-28');
    for (const skip of ['https://prodisser.ru/offer', 'https://prodisser.ru/cabinet', 'https://example.com/чужой', 'https://prodisser.ru/grant']) {
      assert.ok(!sent.includes(skip), skip);
    }
  });

  it('через цикл без правок отправлять нечего', () => {
    assert.deepEqual(indexnow.pickChanged(entries, '2026-12-20'), []);
  });

  it('тело запроса — host, key и urlList, как в справочнике Яндекса', () => {
    assert.deepEqual(indexnow.payload(['https://prodisser.ru/main']), { host: 'prodisser.ru', key: indexnow.KEY, urlList: ['https://prodisser.ru/main'] });
  });

  it('карта сайта отдаёт дату каждой странице с макетом — иначе отправлять было бы нечего', () => {
    assert.match(read('app', 'src', 'app', 'sitemap.ts'), /lastModified: PAGE_DATES\[path\]\.date/u);
  });
});

describe('IndexNow: шаг выката (Р-1024)', () => {
  const deploy = read('.github', 'workflows', 'deploy.yml');
  const cli = read('tools', 'indexnow.mjs');

  it('шаг стоит после внешней проверки сайта и после обновления сервера', () => {
    const order = ['name: Обновление сервера', 'name: Сайт отвечает снаружи', 'name: Репозиторий для сценария IndexNow', 'name: Яндексу сообщены изменённые страницы (IndexNow)'].map((step) => deploy.indexOf(step));
    assert.ok(order.every((at) => at > 0), 'нет шага');
    assert.deepEqual([...order].sort((a, b) => a - b), order);
  });

  it('отказ шага выкат не роняет: continue-on-error у обоих шагов, сценарий ловит ошибки сам', () => {
    const tail = deploy.slice(deploy.indexOf('name: Репозиторий для сценария IndexNow'));
    assert.equal((tail.match(/continue-on-error: true/gu) ?? []).length, 2);
    assert.match(tail, /run: node tools\/indexnow\.mjs\n/u);
    assert.match(cli, /\} catch \(error\) \{\n\s+console\.log\(`IndexNow: не отправлено/u);
    assert.doesNotMatch(cli, /process\.exit\([1-9]/u);
  });

  it('загружаются только два файла сценария; секреты шагу не передаются', () => {
    const tail = deploy.slice(deploy.indexOf('name: Репозиторий для сценария IndexNow'));
    assert.match(tail, /sparse-checkout: \|\n\s+tools\/indexnow\.mjs\n\s+app\/scripts\/indexnow\.mjs\n/u);
    assert.doesNotMatch(tail, /secrets\./u);
  });

  it('перед отправкой сценарий сверяет файл ключа на боевом сайте', () => {
    assert.match(cli, /fetch\(`\$\{base\}\/\$\{KEY\}\.txt`/u);
    assert.ok(cli.indexOf('${KEY}.txt') < cli.indexOf('fetch(ENDPOINT'));
  });
});

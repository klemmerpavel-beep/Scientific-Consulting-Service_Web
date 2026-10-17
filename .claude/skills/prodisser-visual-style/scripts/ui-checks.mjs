/**
 * Проверка поведения публичных страниц ProDisser, которую не делает
 * landing-audit.mjs: то, что видно только при прокрутке и нажатии.
 *
 * На каждой странице и ширине (по умолчанию 1440 и 390 px):
 *   полоса   — на странице с header[data-pd-stick] после первого раздела
 *              появляется .pd-stick с видимой кнопкой; кнопка «#request»
 *              раскрывает окно заявки (form.pd-rq-open[role=dialog]), фокус
 *              внутри, прокрутка заблокирована, Escape закрывает окно
 *              (Р-484, Р-609, Р-612); кнопка с другим якорем (анкета
 *              «Экспертам») ставит цель под полосу; без метки полосы нет;
 *   якоря    — при показанной полосе ни одна цель ссылки «#…» не уходит
 *              под полосу (Р-623);
 *   вкладки  — до 768 px вкладки не выходят за экран, у списков
 *              .pd-in-tablist и .ex-tablist — сетка (Р-613);
 *   отзывы   — у каждой карточки фото или инициал, фото загружено
 *              (Р-590, Р-617);
 *   подсветка — не больше одного h2 с подсветкой (Р-32);
 *   заголовки — h2 мельче 26 px на 1440 px перечисляются для сверки
 *              с исключениями Р-607 (форма первого экрана главной).
 *
 * Запуск (сайт работает, например `next dev -p 3200` в app/):
 *   node ui-checks.mjs --base http://localhost:3200 \
 *     [--paths /,/main,/students,/business,/experts] [--widths 1440,390] [--out ./ui]
 * Код выхода 1 — есть замечания, 0 — чисто.
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > -1 ? process.argv[i + 1] : def; };
const BASE = arg('base', 'http://localhost:3000').replace(/\/$/, '');
const PATHS = arg('paths', '/,/main,/students,/business,/experts').split(',').filter(Boolean);
const WIDTHS = arg('widths', '1440,390').split(',').map(Number).filter(Boolean);
const OUT = path.resolve(arg('out', './ui'));

// Playwright ищется в проекте, затем среди глобальных пакетов (как в landing-audit.mjs).
const require = createRequire(import.meta.url);
function load(name) {
  const roots = [process.cwd(), path.join(process.cwd(), 'app')];
  try { roots.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()); } catch {}
  for (const r of roots) { try { return require(require.resolve(name, { paths: [r] })); } catch {} }
  return null;
}
const pw = load('playwright') ?? load('playwright-core');
if (!pw) { console.error('Не найден playwright: npm i -g playwright или запуск из каталога, где он установлен.'); process.exit(2); }

mkdirSync(OUT, { recursive: true });
const browser = await pw.chromium.launch();
const report = [];
let problems = 0;

for (const p of PATHS) {
  for (const w of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce' });
    const notes = [];
    const fail = (msg) => { notes.push('✗ ' + msg); problems++; };
    const info = (msg) => notes.push('· ' + msg);
    await page.goto(BASE + p, { waitUntil: 'networkidle' });

    // Полоса и окно заявки
    const marked = await page.$('header[data-pd-stick]');
    const firstBottom = await page.evaluate(() => {
      const s = document.querySelector('main > section');
      return s ? s.getBoundingClientRect().bottom + scrollY : 0;
    });
    await page.evaluate((y) => window.scrollTo({ top: y + 400, behavior: 'instant' }), firstBottom);
    await page.waitForTimeout(400);
    const bar = await page.evaluate(() => {
      const s = document.querySelector('.pd-stick');
      if (!s) return null;
      const cta = s.querySelector('.pd-stick-row > a:last-child');
      const r = cta?.getBoundingClientRect();
      return { on: s.classList.contains('pd-stick-on'), cta: cta ? cta.textContent.trim() : null,
        href: cta ? cta.getAttribute('href') : null,
        visible: !!r && r.width > 0 && r.height >= 40 && getComputedStyle(cta).display !== 'none' };
    });
    if (marked) {
      if (!bar || !bar.on) fail('полоса не появилась после первого раздела');
      else if (!bar.visible) fail(`кнопка полосы не видна или ниже 40 px («${bar.cta}»)`);
      else if (bar.href !== '#request') {
        // Кнопка ведёт не к заявке (на «Экспертам» — к анкете): цель должна встать под полосу.
        info(`полоса: кнопка «${bar.cta}» → ${bar.href}`);
        await page.click('.pd-stick-row > a:last-child');
        await page.waitForTimeout(900);
        const top = await page.evaluate((h) => { const t = document.querySelector(h); return t ? t.getBoundingClientRect().top : null; }, bar.href);
        if (top === null) fail(`цель кнопки полосы ${bar.href} не найдена`);
        else if (top < 60 || top > 200) fail(`цель ${bar.href} после перехода на ${Math.round(top)} px от верха: закрыта полосой или не прокручена`);
        else info(`переход к ${bar.href}: цель на ${Math.round(top)} px, под полосой`);
      } else {
        info(`полоса: кнопка «${bar.cta}»`);
        await page.click('.pd-stick-row > a:last-child');
        await page.waitForTimeout(400);
        const dlg = await page.evaluate(() => {
          const f = document.querySelector('form.pd-rq-open[role=dialog]');
          return f ? { focus: f.contains(document.activeElement), lock: document.documentElement.classList.contains('pd-rq-lock') } : null;
        });
        if (!dlg) fail('кнопка полосы не раскрыла окно заявки');
        else {
          if (!dlg.focus) fail('фокус не внутри окна заявки');
          if (!dlg.lock) fail('прокрутка страницы под окном не заблокирована');
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
          const closed = await page.evaluate(() => !document.querySelector('form.pd-rq-open') && !document.documentElement.classList.contains('pd-rq-lock'));
          if (!closed) fail('Escape не закрыл окно заявки');
          else info('окно заявки: открывается, фокус внутри, Escape закрывает');
        }
      }
    } else if (bar && bar.on) {
      fail('полоса появилась на странице без метки data-pd-stick');
    }

    // Якоря: при показанной полосе цель перехода не уходит под неё (Р-623)
    if (marked) {
      const hashes = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href^="#"]')]
        .map((a) => a.getAttribute('href')).filter((h) => h.length > 1 && document.querySelector(h)))]);
      const hidden = [];
      for (const h of hashes) {
        const r = await page.evaluate((sel) => {
          document.querySelector(sel).scrollIntoView({ block: 'start', behavior: 'instant' });
          return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
            const s = document.querySelector('.pd-stick');
            res({ top: document.querySelector(sel).getBoundingClientRect().top,
              bar: s && s.classList.contains('pd-stick-on') ? s.getBoundingClientRect().height : 0 });
          })));
        }, h);
        if (r.bar && r.top < r.bar - 1) hidden.push(`${h} (${Math.round(r.top)} px при полосе ${Math.round(r.bar)} px)`);
      }
      if (hidden.length) fail('якоря уходят под полосу: ' + hidden.join(', '));
      else if (hashes.length) info(`якорей проверено: ${hashes.length}`);
    }

    // Вкладки на узком экране
    if (w <= 768) {
      const tabs = await page.evaluate((vw) => [...document.querySelectorAll('[role=tablist]')]
        .filter((t) => t.getBoundingClientRect().height > 0)
        .map((t) => ({
          cls: t.className,
          grid: getComputedStyle(t).display === 'grid',
          out: [...t.querySelectorAll('[role=tab]')].filter((b) => { const r = b.getBoundingClientRect(); return r.left < -1 || r.right > vw + 1; }).length,
        })), w);
      for (const t of tabs) {
        if (t.out) fail(`вкладки выходят за экран: ${t.out} шт. (${t.cls || 'без класса'})`);
        if (/pd-in-tablist|ex-tablist/.test(t.cls) && !t.grid) fail(`вкладки ${t.cls} не сеткой до 768 px`);
      }
      if (tabs.length) info(`вкладок-списков: ${tabs.length}`);
    }

    // Отзывы
    const stage = await page.$('.pd-revstage');
    if (stage) {
      await stage.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      const cards = await page.evaluate(() => [...document.querySelectorAll('.pd-revstage article')].map((a) => {
        const img = a.querySelector('img');
        const initial = [...a.querySelectorAll('span')].some((s) => /^\p{L}$/u.test(s.textContent.trim()));
        return { img: img ? { src: img.getAttribute('src'), ok: img.complete && img.naturalWidth > 0, alt: img.getAttribute('alt') } : null, initial };
      }));
      for (const c of cards) {
        if (!c.img && !c.initial) fail('карточка отзыва без фото и без инициала');
        if (c.img && !c.img.ok) fail(`фото отзыва не загрузилось: ${c.img.src}`);
      }
      info(`отзывов: ${cards.length}, с фото: ${cards.filter((c) => c.img).length}`);
    }

    // Подсветка и кегль заголовков
    const heads = await page.evaluate(() => [...document.querySelectorAll('h2')].map((h) => ({
      text: h.textContent.trim().slice(0, 48),
      size: parseFloat(getComputedStyle(h).fontSize),
      mark: [...h.querySelectorAll('span')].some((s) => getComputedStyle(s).mixBlendMode === 'multiply'),
    })));
    const marks = heads.filter((h) => h.mark);
    if (marks.length > 1) fail(`подсветка в ${marks.length} заголовках раздела: ${marks.map((h) => '«' + h.text + '»').join(', ')}`);
    if (w >= 1440) for (const h of heads.filter((x) => x.size < 26)) info(`h2 ${h.size} px: «${h.text}» — сверить с исключениями Р-607`);

    await page.screenshot({ path: path.join(OUT, `${p === '/' ? 'home' : p.slice(1).replace(/\//g, '_')}-${w}.png`) });
    await page.close();
    report.push({ path: p, width: w, notes });
    console.log(`${p} @${w}`);
    for (const n of notes) console.log('  ' + n);
  }
}

await browser.close();
writeFileSync(path.join(OUT, 'ui-checks.json'), JSON.stringify(report, null, 2));
console.log(problems ? `Замечаний: ${problems}` : 'Замечаний нет');
process.exit(problems ? 1 : 0);

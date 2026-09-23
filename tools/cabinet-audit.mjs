/**
 * Машинный обход облика снимков прототипа (решение Р-214).
 *
 * По каждому из 99 снимков на ширинах 1100, 1280, 1440, 1920 и 390 px:
 * горизонтальное переполнение, кегль ниже 12 px, цель нажатия ниже 44 px,
 * обрезанный текст, наложение карточек, больше двух плашек в ряду.
 * Прежде обход жил во временном каталоге исполнителя и не повторялся
 * следующим; теперь он рядом с инструментами съёмки.
 *
 * Ссылка внутри строки текста (абзац, заголовок) целью не считается —
 * правило Р-57; ссылка в ячейке таблицы считается (решение Р-211).
 *
 * Запуск (из корня репозитория, после пересъёмки):
 *   node tools/cabinet-audit.mjs [ширины...]
 */
import { chromium } from '/var/tmp/pwtest/node_modules/playwright-core/index.mjs';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..', 'design', 'cabinet-prototype');
const widths = process.argv.slice(2).map(Number).filter(Boolean);
const W = widths.length ? widths : [1100, 1280, 1440, 1920, 390];
const pages = [];
(function walk(d) { for (const e of readdirSync(d)) { const p = path.join(d, e); if (statSync(p).isDirectory()) walk(p); else if (e === 'index.html') pages.push(p); } })(ROOT);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let total = 0;
for (const w of W) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  for (const file of pages) {
    await p.goto('file://' + file);
    const issues = await p.evaluate(() => {
      const out = [];
      const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('details:not([open]) > :not(summary)') && !el.closest('.pt-bar,[aria-hidden="true"]') && !String(cs.clipPath).includes('inset(50%)'); };
      if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`переполнение ${document.documentElement.scrollWidth}>${innerWidth}`);
      const main = document.querySelector('main') ?? document.body;
      for (const el of main.querySelectorAll('*')) {
        if (!vis(el)) continue;
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        const cs = getComputedStyle(el);
        if (own && parseFloat(cs.fontSize) < 12 && !el.closest('svg')) out.push(`кегль ${cs.fontSize}: «${el.textContent.trim().slice(0, 30)}»`);
        if (own && cs.overflow.includes('hidden') && !cs.webkitLineClamp?.match(/\d/) && cs.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 1 && !el.closest('svg')) out.push(`обрезан текст: «${el.textContent.trim().slice(0, 30)}»`);
      }
      for (const el of document.querySelectorAll('a[href], button, summary, input:not([type=hidden]), select, textarea')) {
        if (!vis(el) || el.closest('.pt-bar')) continue;
        if (el.tagName === 'A' && el.closest('p, h1, h2, h3') && getComputedStyle(el).display === 'inline') continue;
        if (el.type === 'file' && el.closest('label, div')?.querySelector('button, label')) continue;
        const r = (el.classList.contains('cab-stretch') ? el.closest('li, section, article') ?? el : el).getBoundingClientRect();
        if (el.type === 'checkbox' || el.type === 'radio') continue;
        if (r.height < 43.5) out.push(`цель ${Math.round(r.width)}×${Math.round(r.height)}: «${(el.textContent || el.getAttribute('aria-label') || el.name || '').trim().slice(0, 30)}»`);
      }
      // плашки в ряду и наложения
      const cards = [...main.querySelectorAll('.cab-card')].filter(vis);
      const rows = new Map();
      const ids = new Map();
      for (const c of cards) { const parent = c.parentElement; if (!ids.has(parent)) ids.set(parent, ids.size); const id = ids.get(parent) + ':' + Math.round(c.getBoundingClientRect().top); rows.set(id, (rows.get(id) ?? 0) + 1); }
      for (const [k, n] of rows) if (n > 2) out.push(`плашек в ряду: ${n}`);
      for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i], c = cards[j]; if (a.contains(c) || c.contains(a)) continue;
        const r1 = a.getBoundingClientRect(), r2 = c.getBoundingClientRect();
        if (r1.left < r2.right - 1 && r2.left < r1.right - 1 && r1.top < r2.bottom - 1 && r2.top < r1.bottom - 1) out.push('наложение карточек');
      }
      return [...new Set(out)];
    });
    if (issues.length) { total += issues.length; for (const i of issues) console.log(w + '\t' + path.relative(ROOT, file) + '\t' + i); }
  }
  await p.close();
}
await b.close();
console.log(`Замечаний: ${total}; страниц ${pages.length}; ширины ${W.join(', ')}`);

// Замечания есть — команда завершается ошибкой: её можно ставить в приёмку.
if (total > 0) process.exitCode = 1;

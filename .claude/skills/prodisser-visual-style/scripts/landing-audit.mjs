/**
 * Машинная проверка публичных страниц сайта ProDisser по дизайн-системе.
 *
 * Для каждой страницы и ширины 360, 390, 414, 480, 768, 1024, 1440 px
 * (проверочные ширины DESIGN-SYSTEM, раздел 6):
 *   нарушения — горизонтальное переполнение, контраст текста ниже AA,
 *   кегль ниже 12 px, поле ввода мельче 16 px (Р-86), эмодзи, нарушения axe;
 *   предупреждения — цель нажатия ниже 44 px (Р-57; ссылка в строке текста и
 *   галочка согласия не считаются, Р-62), цвет вне токенов `--pd-*`, кегль
 *   вне шкалы, скругление вне набора 6 · 10 · 14 · 999 px · 50 %.
 * На ширине 1440 px дополнительно — профиль страницы: заголовки и их кегли,
 * отношение h2 к тексту, тёмные панели, кнопки действия и их частота.
 *
 * Страница открывается с уменьшенным движением: проявление разделов
 * выключено, и контраст меряется по итоговому цвету (Р-43, Р-93).
 * Контраст считается по цепочке фонов предков; текст поверх изображения
 * или градиента не проверяется и учитывается отдельно.
 *
 * Запуск (сайт должен работать, например `npm run dev` в app/):
 *   node landing-audit.mjs --base http://localhost:3000 \
 *     [--paths /,/main,/students,/business,/experts] [--widths 1440,390] \
 *     [--out ./audit] [--axe путь/к/axe.min.js] [--no-shots]
 * Код выхода 1 — есть нарушения, 0 — только предупреждения или чисто.
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > -1 ? process.argv[i + 1] : def; };
const flag = (name) => process.argv.includes('--' + name);
const BASE = arg('base', 'http://localhost:3000').replace(/\/$/, '');
const PATHS = arg('paths', '/,/main,/students,/business,/experts').split(',').filter(Boolean);
const WIDTHS = arg('widths', '360,390,414,480,768,1024,1440').split(',').map(Number).filter(Boolean);
const OUT = path.resolve(arg('out', './audit'));
const SHOTS = !flag('no-shots');

// Playwright ищется в проекте, затем среди глобальных пакетов.
const require = createRequire(import.meta.url);
function load(name) {
  const roots = [process.cwd(), path.join(process.cwd(), 'app')];
  try { roots.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()); } catch {}
  for (const r of roots) { try { return require(require.resolve(name, { paths: [r] })); } catch {} }
  return null;
}
const pw = load('playwright') ?? load('playwright-core');
if (!pw) { console.error('Не найден playwright: npm i -g playwright или запуск из каталога, где он установлен.'); process.exit(2); }
let axeSource = null;
const axePath = arg('axe') ?? (() => { try { return require.resolve('axe-core/axe.min.js', { paths: [process.cwd(), path.join(process.cwd(), 'app')] }); } catch { return null; } })();
if (axePath && existsSync(axePath)) axeSource = readFileSync(axePath, 'utf8');

// Шкалы дизайн-системы: кегли (раздел 3.2) и скругления (раздел 4.2).
// h1 и h2 набираются clamp() (Р-607) и шкалой не проверяются.
// Прозрачности раздела 2.4 токенами не являются, но допустимы.
const SCALE = {
  font: [12, 13, 14, 15, 16, 17, 20, 21, 22, 23, 26, 27, 28],
  radius: [0, 6, 10, 14],
  alpha: ['rgba(255, 255, 255, 0.92)', 'rgba(255, 255, 255, 0.24)', 'rgba(255, 255, 255, 0.1)', 'rgba(216, 228, 243, 0.62)', 'rgba(216, 228, 243, 0.84)', 'rgba(20, 22, 28, 0.32)'],
};

/** Выполняется в странице: собирает нарушения, предупреждения и профиль. */
function inspect(scale) {
  const out = { errors: [], warns: [], skipped: { overImage: 0 }, profile: {} };
  const short = (s) => s.replace(/\s+/g, ' ').trim().slice(0, 48);
  const sel = (el) => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; else if (el.classList[0]) s += '.' + el.classList[0]; return s; };
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[aria-hidden="true"]') && !String(cs.clipPath).includes('inset(50%)') && r.right > 0 && r.left < innerWidth; };
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();

  // Цвета токенов: всё, что объявлено как --pd-* в правилах :root.
  const probe = document.createElement('i'); document.body.append(probe);
  const norm = (v) => { probe.style.color = ''; probe.style.color = v; return getComputedStyle(probe).color; };
  const tokens = new Set(['rgba(0, 0, 0, 0)', ...scale.alpha]);
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    for (const r of rules) if (r.selectorText === ':root') for (const p of r.style) if (p.startsWith('--pd-')) { const c = norm(r.style.getPropertyValue(p).trim()); if (c) tokens.add(c); }
  }
  probe.remove();
  out.profile.tokenCount = tokens.size - 1 - scale.alpha.length;

  const rgba = (s) => { const m = s.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0]; return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  // Фон под элементом: слои предков до первого непрозрачного; картинка или градиент — отказ.
  const backdrop = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const c = rgba(cs.backgroundColor);
      if (c.a > 0) layers.push(c);
      if (c.a >= 1) break;
      if (cs.backgroundImage !== 'none') return null;
    }
    return layers.reverse().reduce((acc, c) => over(c, acc), { r: 255, g: 255, b: 255, a: 1 });
  };

  if (document.documentElement.scrollWidth > innerWidth + 1) {
    const wide = [...document.body.querySelectorAll('*')].filter((el) => { const r = el.getBoundingClientRect(); if (r.right <= innerWidth + 1 || !r.width) return false; for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== 'visible') return false; } return true; }).slice(0, 5).map(sel);
    out.errors.push({ kind: 'переполнение', detail: `${document.documentElement.scrollWidth} > ${innerWidth}`, where: wide.join(', ') });
  }

  const colorUse = new Map(); const fontUse = new Map(); const radiusUse = new Map();
  const note = (map, key, el) => { const e = map.get(key) ?? { n: 0, at: sel(el) }; e.n++; map.set(key, e); };
  for (const el of document.body.querySelectorAll('*')) {
    if (!vis(el) || el.closest('svg')) continue;
    const cs = getComputedStyle(el);
    const text = ownText(el);
    for (const p of ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor']) {
      if (p.startsWith('border') && parseFloat(cs[p.replace('Color', 'Width')]) === 0) continue;
      if (p === 'color' && !text) continue;
      const v = cs[p]; if (!tokens.has(v)) note(colorUse, v, el);
    }
    const rad = cs.borderTopLeftRadius;
    if (rad !== '0px') { const px = parseFloat(rad); const ok = rad.endsWith('%') ? rad === '50%' : radiusOk(px); if (!ok) note(radiusUse, rad, el); }
    if (text) {
      const fs = parseFloat(cs.fontSize);
      if (fs < 12) out.errors.push({ kind: 'кегль < 12 px', detail: cs.fontSize, where: sel(el), text: short(text) });
      else if (!scale.font.includes(Math.round(fs)) && !el.closest('h1, h2')) note(fontUse, Math.round(fs * 10) / 10 + 'px', el);
      // ©, ® и ™ формально пиктографические, но эмодзи не считаются.
      const emoji = [...text].filter((ch) => /\p{Extended_Pictographic}/u.test(ch) && !'©®™'.includes(ch));
      if (emoji.length) out.errors.push({ kind: 'эмодзи', detail: emoji.join(' '), where: sel(el), text: short(text) });
      out.profile.textChecked = (out.profile.textChecked ?? 0) + 1;
      const bg = backdrop(el);
      if (!bg) { out.skipped.overImage++; continue; }
      let fg = rgba(cs.color); let op = 1; for (let n = el; n; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity);
      fg = over({ ...fg, a: fg.a * op }, bg);
      const large = fs >= 24 || (fs >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
      const cr = ratio(fg, bg); const need = large ? 3 : 4.5;
      if (cr < need) out.errors.push({ kind: 'контраст', detail: `${cr.toFixed(2)} < ${need}: ${hex(fg)} на ${hex(bg)}, ${cs.fontSize}`, where: sel(el), text: short(text) });
    }
  }
  function radiusOk(px) { return scale.radius.includes(Math.round(px)) || px >= 999; }

  for (const el of document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select')) {
    if (vis(el) && parseFloat(getComputedStyle(el).fontSize) < 16) out.errors.push({ kind: 'поле < 16 px', detail: getComputedStyle(el).fontSize, where: sel(el) });
  }
  for (const el of document.querySelectorAll('a[href], button, summary, [role=button], [role=tab], input:not([type=hidden]), select, textarea')) {
    if (!vis(el) || el.type === 'checkbox' || el.type === 'radio') continue;
    if (el.tagName === 'A' && el.closest('p, li, label, h1, h2, h3') && getComputedStyle(el).display === 'inline') continue;
    const r = el.getBoundingClientRect();
    if (r.height < 43.5 || r.width < 43.5) out.warns.push({ kind: 'цель < 44 px', detail: `${Math.round(r.width)}×${Math.round(r.height)}`, where: sel(el), text: short(el.textContent || el.getAttribute('aria-label') || '') });
  }
  const top = (map, kind) => [...map].sort((a, b) => b[1].n - a[1].n).slice(0, 8).forEach(([k, v]) => out.warns.push({ kind, detail: `${k} × ${v.n}`, where: v.at }));
  top(colorUse, 'цвет вне токенов'); top(fontUse, 'кегль вне шкалы'); top(radiusUse, 'скругление вне набора');

  // Профиль: иерархия, тёмные панели, кнопки действия.
  const size = (el) => parseFloat(getComputedStyle(el).fontSize);
  const freq = new Map();
  for (const el of document.querySelectorAll('p')) if (vis(el)) freq.set(size(el), (freq.get(size(el)) ?? 0) + 1);
  const body = freq.size ? [...freq].sort((a, b) => b[1] - a[1])[0][0] : null;
  const heads = [...document.querySelectorAll('h1, h2')].filter(vis).map((h) => ({ tag: h.tagName.toLowerCase(), size: size(h), family: getComputedStyle(h).fontFamily.split(',')[0].replace(/['"]/g, ''), weight: getComputedStyle(h).fontWeight, text: short(h.innerText) }));
  const h2 = heads.filter((h) => h.tag === 'h2').map((h) => h.size);
  const panels = [...document.body.querySelectorAll('section, div, aside')].filter((el) => { if (!vis(el)) return false; const r = el.getBoundingClientRect(); const c = rgba(getComputedStyle(el).backgroundColor); return c.a >= 1 && lum(c) < 0.05 && r.width >= innerWidth * 0.3 && r.height >= 200; });
  const darkPanels = panels.filter((el) => !panels.some((p) => p !== el && p.contains(el))).length;
  // Кнопка действия — тёмная заливка; вкладки и переключатели не считаются.
  const ctas = [...document.querySelectorAll('a[href], button')].filter((el) => { if (!vis(el) || el.closest('[role=tablist], [role=radiogroup]') || el.hasAttribute('aria-pressed') || el.hasAttribute('aria-selected')) return false; const c = rgba(getComputedStyle(el).backgroundColor); return c.a >= 1 && lum(c) < 0.05 && el.getBoundingClientRect().height >= 40 && parseFloat(getComputedStyle(el).borderTopLeftRadius) >= 20; }).map((el) => ({ text: short(el.textContent), y: Math.round(el.getBoundingClientRect().top + scrollY) }));
  const screens = document.documentElement.scrollHeight / innerHeight;
  out.profile = { ...out.profile, bodySize: body, heads, h2ToBody: body && h2.length ? +(Math.max(...h2) / body).toFixed(2) : null, darkPanels, ctas, screens: +screens.toFixed(1), screensPerCta: ctas.length ? +(screens / ctas.length).toFixed(1) : null };
  return out;
}

const browser = await pw.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
mkdirSync(OUT, { recursive: true });
const report = [];
let errors = 0;
for (const p of PATHS) {
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const res = await page.goto(BASE + p, { waitUntil: 'load', timeout: 90000 });
    // Прокрутка до конца подгружает ленивые снимки, затем — обратно наверх.
    await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } scrollTo(0, 0); });
    await page.waitForTimeout(300);
    const r = await page.evaluate(inspect, SCALE);
    if (axeSource) {
      await page.addScriptTag({ content: axeSource });
      const ax = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })));
      for (const v of ax) r.errors.push({ kind: 'axe', detail: `${v.id} (${v.impact}), узлов: ${v.nodes}`, where: v.help });
    }
    const slug = (p === '/' ? 'start' : p.replace(/\W+/g, '-').replace(/^-|-$/g, '')) + '-' + w;
    if (SHOTS) await page.screenshot({ path: path.join(OUT, slug + '.png'), fullPage: true });
    errors += r.errors.length;
    report.push({ path: p, width: w, status: res?.status(), ...r });
    console.log(`${p} @${w}: нарушений ${r.errors.length}, предупреждений ${r.warns.length}`);
    await ctx.close();
  }
}
await browser.close();

const md = ['# Проверка страниц', '', `Адрес: ${BASE}. Ширины: ${WIDTHS.join(', ')}. axe: ${axeSource ? 'да' : 'нет'}.`, ''];
for (const p of PATHS) {
  const rows = report.filter((x) => x.path === p);
  const wide = rows.find((x) => x.width === Math.max(...WIDTHS)) ?? rows[0];
  const pr = wide.profile;
  md.push(`## ${p}`, '', `Текстовых элементов проверено: ${pr.textChecked ?? 0}; экранов: ${pr.screens}; кнопок действия: ${pr.ctas.length}; экранов на кнопку: ${pr.screensPerCta ?? '—'}; тёмных панелей: ${pr.darkPanels}; основной текст: ${pr.bodySize ?? '—'} px; h2 к тексту: ${pr.h2ToBody ?? '—'}.`, '');
  md.push('| Заголовок | Кегль | Гарнитура | Текст |', '|---|---:|---|---|', ...pr.heads.map((h) => `| ${h.tag} | ${h.size} | ${h.family} ${h.weight} | ${h.text} |`), '');
  for (const x of rows) {
    md.push(`### ${x.width} px — нарушений ${x.errors.length}, предупреждений ${x.warns.length}, текст поверх изображений: ${x.skipped.overImage}`);
    for (const e of x.errors) md.push(`- **${e.kind}** ${e.detail} — \`${e.where}\`${e.text ? ` «${e.text}»` : ''}`);
    for (const e of x.warns) md.push(`- ${e.kind} ${e.detail} — \`${e.where}\`${e.text ? ` «${e.text}»` : ''}`);
    md.push('');
  }
}
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
writeFileSync(path.join(OUT, 'report.md'), md.join('\n'));
console.log(`Отчёт: ${path.join(OUT, 'report.md')}`);
process.exit(errors ? 1 : 0);

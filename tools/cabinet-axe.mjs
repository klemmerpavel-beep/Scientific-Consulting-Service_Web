/**
 * Проверка доступности снимков прототипа axe-core (решения Р-168, Р-214).
 *
 * Полный набор правил WCAG 2.0—2.2 уровней A и AA на 1440×900 и 390×844.
 * Снимок проверяется через 300 мс после открытия: блок статуса появляется
 * за 220 мс, и проверка контраста, заставшая его прозрачным, даёт ложное
 * нарушение. axe-core в `package.json` не заводится (Р-168): он берётся из
 * того же каталога, что и браузер инструментов съёмки.
 *
 * Запуск (из корня репозитория, после пересъёмки):
 *   node tools/cabinet-axe.mjs
 */

import { chromium } from '/var/tmp/pwtest/node_modules/playwright-core/index.mjs';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..', 'design', 'cabinet-prototype');
const AXE = readFileSync('/var/tmp/pwtest/node_modules/axe-core/axe.min.js', 'utf8');
const pages = [];
(function walk(d) { for (const e of readdirSync(d)) { const p = path.join(d, e); if (statSync(p).isDirectory()) walk(p); else if (e === 'index.html') pages.push(p); } })(ROOT);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let total = 0;
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  for (const file of pages) {
    await p.goto('file://' + file);
    await p.waitForTimeout(300); // появление блока статуса — 220 мс
    await p.addScriptTag({ content: AXE });
    const res = await p.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'], exclude: [['.pt-bar']] })).violations.map((v) => `${v.id} ×${v.nodes.length}: ${v.nodes[0].target.join(' ')}`));
    if (res.length) { total += res.length; console.log(w, path.relative(ROOT, file), '\n   ' + res.join('\n   ')); }
  }
  await p.close();
}
await b.close();
console.log(`Нарушений axe: ${total}; страниц ${pages.length}`);

// Замечания есть — команда завершается ошибкой: её можно ставить в приёмку.
if (total > 0) process.exitCode = 1;

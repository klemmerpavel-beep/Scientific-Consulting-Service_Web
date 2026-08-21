import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import fs from 'fs';
const V = '/tmp/claude-0/-home-user-deeptech-lab/8edd0046-8b8c-5ccd-bc1c-6755c13d5e0b/scratchpad/vendor';
const OUT = '/tmp/claude-0/-home-user-deeptech-lab/8edd0046-8b8c-5ccd-bc1c-6755c13d5e0b/scratchpad/shots';
const W = parseInt(process.env.W || '1440', 10);
const pages = process.argv.slice(2);
const browser = await chromium.launch();
for (const p of pages) {
  const ctx = await browser.newContext({ viewport: { width: W, height: 1000 } });
  await ctx.route('**/unpkg.com/react@18.3.1/umd/react.production.min.js', r =>
    r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(V + '/react/umd/react.production.min.js', 'utf8') }));
  await ctx.route('**/unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js', r =>
    r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(V + '/react-dom/umd/react-dom.production.min.js', 'utf8') }));
  await ctx.route('**/_ds/**', r => r.fulfill({ contentType: r.request().url().endsWith('.js') ? 'application/javascript' : 'text/css', body: '' }));
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:8899/' + p + '.dc.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const h = await page.evaluate(() => document.body.scrollHeight);
  await page.screenshot({ path: `${OUT}/${p}-${W}.png`, fullPage: true });
  const text = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync(`${OUT}/${p}.txt`, text);
  console.log(`### ${p} w=${W} height=${h} textlen=${text.length} errors=${errs.length}`);
  errs.slice(0,6).forEach(e => console.log('   ERR: ' + e.slice(0,180)));
  await ctx.close();
}
await browser.close();

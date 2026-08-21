import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import fs from 'fs';
const V = '/tmp/claude-0/-home-user-deeptech-lab/8edd0046-8b8c-5ccd-bc1c-6755c13d5e0b/scratchpad/vendor';
const axeSrc = fs.readFileSync(V + '/axe-core/axe.min.js', 'utf8');
const PAGES = ['StartPage','MainPage','StudentsPage','BusinessPage','OfferPage','PrivacyPage','ConsentPage'];
const WIDTHS = [1440, 768, 390];
const browser = await chromium.launch();
const report = {};
for (const p of PAGES) {
  report[p] = {};
  for (const W of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: W, height: 900 } });
    await ctx.route('**/unpkg.com/react@18.3.1/umd/react.production.min.js', r => r.fulfill({ contentType:'application/javascript', body: fs.readFileSync(V+'/react/umd/react.production.min.js','utf8') }));
    await ctx.route('**/unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js', r => r.fulfill({ contentType:'application/javascript', body: fs.readFileSync(V+'/react-dom/umd/react-dom.production.min.js','utf8') }));
    await ctx.route('**/_ds/**', r => r.fulfill({ contentType: r.request().url().endsWith('.js') ? 'application/javascript':'text/css', body: '' }));
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:8899/' + p + '.dc.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const basic = await page.evaluate(() => {
      const de = document.documentElement;
      const overflow = de.scrollWidth - de.clientWidth;
      const offenders = [];
      if (overflow > 1) {
        document.querySelectorAll('*').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.right > de.clientWidth + 1 && r.width > 4 && getComputedStyle(el).position !== 'fixed') {
            const st = getComputedStyle(el);
            if (st.overflowX === 'auto' || st.overflowX === 'scroll' || st.overflowX === 'clip' || st.overflowX==='hidden') return;
            offenders.push({ tag: el.tagName, cls: el.className?.toString().slice(0,40), right: Math.round(r.right), w: Math.round(r.width), txt: (el.textContent||'').trim().slice(0,40) });
          }
        });
      }
      // tap targets
      const small = [];
      document.querySelectorAll('a,button,input,select,[role=button],[tabindex]').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (r.height < 40 || r.width < 24) small.push({ tag: el.tagName, txt: (el.textContent||el.getAttribute('aria-label')||'').trim().slice(0,40), w: Math.round(r.width), h: Math.round(r.height) });
      });
      // headings order
      const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h => +h.tagName[1]);
      const skips = [];
      for (let i=1;i<hs.length;i++) if (hs[i] - hs[i-1] > 1) skips.push(hs[i-1]+'->'+hs[i]);
      // tiny text
      const tiny = new Set();
      document.querySelectorAll('*').forEach(el => {
        if (!el.childNodes.length) return;
        const hasText = [...el.childNodes].some(n => n.nodeType===3 && n.textContent.trim().length>2);
        if (!hasText) return;
        const fs2 = parseFloat(getComputedStyle(el).fontSize);
        if (fs2 < 12) tiny.add(Math.round(fs2*10)/10 + 'px :: ' + el.textContent.trim().slice(0,40));
      });
      return { overflow, offenders: offenders.slice(0,10), small: small.slice(0,12), smallCount: small.length,
               headings: hs.length, skips, h1: document.querySelectorAll('h1').length,
               tiny: [...tiny].slice(0,8), tinyCount: tiny.size,
               lang: document.documentElement.lang, title: document.title,
               desc: document.querySelector('meta[name=description]')?.content?.length || 0,
               imgsNoAlt: [...document.images].filter(i=>!i.alt).length, imgs: document.images.length };
    });
    let axe = { violations: [] };
    try {
      await page.addScriptTag({ content: axeSrc });
      axe = await page.evaluate(async () => {
        const r = await window.axe.run(document, { resultTypes: ['violations'], runOnly: { type:'tag', values:['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice'] } });
        return { violations: r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help,
          sample: v.nodes.slice(0,2).map(n => (n.html||'').slice(0,140)) })) };
      });
    } catch(e) { axe = { error: e.message }; }
    report[p][W] = { ...basic, axe: axe.violations || axe };
    await ctx.close();
  }
  console.log('done', p);
}
fs.writeFileSync('/tmp/claude-0/-home-user-deeptech-lab/8edd0046-8b8c-5ccd-bc1c-6755c13d5e0b/scratchpad/audit.json', JSON.stringify(report, null, 1));
await browser.close();

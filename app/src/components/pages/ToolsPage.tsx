// @ts-nocheck — логика перенесена из макета дословно и правится только в макете.
'use client';
// Сгенерировано из ToolsPage.dc.html через tools/dc-to-tsx.mjs.
// Правки вносятся в макет и переносятся заново, а не здесь.
import React from 'react';
import { submitLead } from '../../lib/submit-lead';
import PhotoSlot from '../PhotoSlot';
import { ABOVE_THE_FOLD } from '../photos';

/** Текст благодарности по обработчику формы заявки — из макета (Р-406). */
const LEAD_THANKS: Record<string, string> = {};

const css = `

/* Токены палитры. Значения здесь, а не в каждом объявлении: страница
   держит около 1700 упоминаний цвета, и смена одного оттенка иначе
   означает правку в сотнях мест. Роли токенов — docs/DESIGN-SYSTEM.md,
   раздел 2. Цвета внутри атрибутов SVG остаются литералами: var() в
   презентационном атрибуте не работает. */
:root{--pd-ink:#14161C;--pd-ink-secondary:#3D4450;--pd-ink-muted:#5C6474;--pd-ink-inverse:#FFFFFF;--pd-border:#E3E7EC;--pd-divider:#EFF1F4;--pd-surface-quiet:#F6F7F9;--pd-edge-neutral:#C4CAD4;--pd-accent:#14417A;--pd-accent-press:#0F3260;--pd-accent-deep:#0D2B52;--pd-accent-mark:#D8E4F3;--pd-accent-edge:#B4C9E5;--pd-accent-tint:#ECF1F8;--pd-button-hover:#262A33;--pd-accent-hover:#0A2145;--pd-accent-active:#081A38;--pd-ok-bg:#E6F9F1;--pd-ok-ink:#0E4E3C;--pd-err-bg:#FAE7E5;--pd-err-border:#F0C9C3;--pd-err-ink:#8E2C22;--pd-ok-border:#C5EEDD;--pd-accent-soft:#2A63B4;--pd-art-line:#E5EBF2;--pd-art-mark:#D3DEEC;--pd-art-dot:#D8DEE6}
body{margin:0;background:var(--pd-ink-inverse)}h1,h2,h3{text-wrap:balance}p,li{text-wrap:pretty}a{color:var(--pd-accent);text-decoration:none}a:hover{color:var(--pd-accent-press)}*:focus-visible{outline:2px solid var(--pd-accent);outline-offset:2px}.pd-skip{position:absolute;left:-9999px;top:0;z-index:9;box-sizing:border-box;min-height:44px;display:flex;align-items:center;background:var(--pd-ink);color:var(--pd-ink-inverse);padding:12px 20px;border-radius:0 0 10px 0;font-size:14px;font-weight:600}.pd-skip:focus{left:0;color:var(--pd-ink-inverse)}.doc-layout{display:grid;grid-template-columns:minmax(0,260px) minmax(0,1fr);gap:48px;align-items:start}.doc-toc{position:sticky;top:24px}.doc-toc-btn{display:none}.doc-toc-list{display:flex;flex-direction:column}.doc-toc-list[hidden]{display:none}
@media (max-width:1024px){.doc-layout{grid-template-columns:minmax(0,220px) minmax(0,1fr);gap:32px}}
@media (max-width:768px){.doc-layout{grid-template-columns:minmax(0,1fr)}.doc-toc{position:static}.doc-toc-btn{display:flex}}
.tl-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:24px;align-items:start}.tl-fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}.tl-wide{grid-column:1 / -1}.tl-two{display:grid;grid-template-columns:minmax(0,.86fr) minmax(0,1.14fr);gap:40px;align-items:start}.tl-samples{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}
@media (max-width:900px){.tl-grid,.tl-two,.tl-samples{grid-template-columns:minmax(0,1fr)}.tl-two{gap:20px}}
@media (max-width:640px){.tl-kinds{border-radius:14px!important}}
@media (max-width:480px){.tl-fields{grid-template-columns:minmax(0,1fr)}}
@media (max-width:480px){.doc-pad{padding-left:20px!important;padding-right:20px!important}}
@media (max-width:430px){.doc-mark{font-size:22px!important}}
@media print{.doc-toc-list[hidden]{display:flex!important}.doc-toc,.doc-head,.doc-foot,.pd-skip{display:none!important}.doc-layout{grid-template-columns:minmax(0,1fr)!important;gap:0!important}body{background:var(--pd-ink-inverse)}main{max-width:none!important;padding:0!important}h1{font-size:20pt}h2{font-size:13pt;page-break-after:avoid}p,li{font-size:11pt;line-height:1.5}.doc-print{display:block!important}}.doc-print{display:none}
/* Отправка идёт — кнопка это показывает. Инлайновый фон сильнее класса,
   поэтому приглушение объявлено важным. */
button[disabled]{opacity:.7!important;cursor:progress!important}
input::placeholder,textarea::placeholder{color:var(--pd-ink-muted);opacity:1}
/* Подтверждение и ошибка появляются плавно, а не возникают рывком.
   Правило срабатывает при вставке элемента, поэтому блоки, которые уже
   на странице, ничего не переигрывают при обновлении содержимого. */
@keyframes pd-appear{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
[role="status"],[role="alert"]{animation:pd-appear 220ms cubic-bezier(.2,0,.2,1)}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
.x1:hover{background:rgba(216,228,243,.62) !important}
.x2:active{background:rgba(216,228,243,.84) !important}
.x3:hover{border-color:var(--pd-ink) !important}
.x4:active{transform:scale(.97) !important}
.x5:hover{background:var(--pd-button-hover) !important}
.x6:hover{background:var(--pd-ink-inverse) !important;color:var(--pd-ink) !important}
.x7:focus-visible{border-color:var(--pd-accent) !important;box-shadow:0 0 0 3px rgba(20,65,122,.16) !important}
.x8:hover{border-color:var(--pd-border) !important;color:var(--pd-ink) !important}
.x9:hover{background:var(--pd-button-hover) !important;color:var(--pd-ink-inverse) !important}
.xa:hover{color:var(--pd-accent) !important}
`;

class ToolsPageView extends React.Component<any, any> {
state = { kind: 0, items: [], sort: true, typeTag: true, copied: false, copyFail: false };

  componentDidMount(){
    document.documentElement.lang = 'ru';
  }

  /* Оформитель списка литературы по ГОСТ Р 7.0.100-2018 (П-1 конкурентного
     разбора 03.11.2026, Р-788). Всё считается в браузере: введённое не
     уходит на сервер и не сохраняется после закрытия вкладки. Обработчики
     названы не submit*: перенос оборачивает submit* в отправку заявки. */

  // Пробелы, хвостовая пунктуация: «Название.» -> «Название»; «?» и «!» остаются.
  clean(s){
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/, '');
  }

  // «Иванов И. И.», «Иванов И.И.», «Иванов, И. И.», «Иванов Иван Иванович»,
  // «И. И. Иванов», «Smith J. A.» -> { last, init, full }.
  parseName(raw){
    const t = String(raw == null ? '' : raw).replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return null;
    const words = t.replace(/\.(?=[^\s-])/g, '. ').split(' ').filter(Boolean);
    const isInit = (w) => /^[A-Za-zА-Яа-яЁё]{1,2}\.(?:-[A-Za-zА-Яа-яЁё]{1,2}\.)?$/.test(w);
    let last, rest;
    if (words.length > 1 && isInit(words[0])) {
      const k = words.findIndex((w) => !isInit(w));
      if (k < 0) return null;
      last = words.slice(k).join(' ');
      rest = words.slice(0, k);
    } else {
      last = words[0];
      rest = words.slice(1);
    }
    const init = rest
      .map((w) => (isInit(w) ? w : w.split('-').map((p) => (p ? p[0].toUpperCase() + '.' : '')).join('-')))
      .join(' ');
    return { last, init, full: t };
  }

  // Авторы — по одному в строке или через точку с запятой.
  authors(raw){
    return String(raw == null ? '' : raw).split(/[\n;]+/).map((s) => this.parseName(s)).filter(Boolean);
  }

  latin(s){
    const t = String(s == null ? '' : s);
    return /[A-Za-z]/.test(t) && !/[А-Яа-яЁё]/.test(t);
  }

  // Заголовок записи — фамилия первого автора, если авторов от одного до трёх.
  heading(list){
    if (!list.length || list.length > 3) return '';
    const a = list[0];
    return a.init ? `${a.last}, ${a.init}` : `${a.last}.`;
  }

  // Сведения об ответственности: до четырёх авторов — все, от пяти — первые
  // три и «[и др.]» («[et al.]» у описания на латинице).
  resp(list, lat){
    if (!list.length) return '';
    const names = list.map((a) => (a.init ? `${a.init} ${a.last}` : a.last));
    if (list.length <= 4) return names.join(', ');
    return names.slice(0, 3).join(', ') + (lat ? ' [et al.]' : ' [и др.]');
  }

  titleBlock(head, title, other, resp){
    let t = this.clean(title);
    if (!t) return '';
    if (this.clean(other)) t += ' : ' + this.clean(other);
    if (resp) t += ' / ' + resp;
    return head ? `${head} ${t}` : t;
  }

  // Области описания — через точку и тире; после «.», «?» и «!» — только тире.
  joinOpen(parts){
    let out = '';
    for (const raw of parts) {
      const p = String(raw == null ? '' : raw).trim();
      if (!p) continue;
      out = out ? out + (/[.!?]$/.test(out) ? ' – ' : '. – ') + p : p;
    }
    return out;
  }

  join(parts){
    const out = this.joinOpen(parts);
    return out && !/[.!?]$/.test(out) ? out + '.' : out;
  }

  pages(s){
    return this.clean(s).replace(/\s*(с|c|p|P)$/, '').replace(/\s*[-—]\s*/g, '–');
  }

  date(s){
    const t = String(s == null ? '' : s).trim();
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}.${m[2]}.${m[1]}`;
    if (t) return this.clean(t);
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  }

  book(d, tag){
    const list = this.authors(d.authors);
    const tb = this.titleBlock(this.heading(list), d.title, d.other, this.resp(list, this.latin(d.title)));
    if (!tb) return '';
    const place = [this.clean(d.city), this.clean(d.publisher)].filter(Boolean).join(' : ');
    const year = this.clean(d.year);
    const pub = place && year ? `${place}, ${year}` : (place || year);
    const pg = this.pages(d.pages);
    const isbn = this.clean(d.isbn).replace(/^ISBN\s*/i, '');
    return this.join([tb, this.clean(d.edition), pub, pg ? `${pg} с.` : '', isbn ? `ISBN ${isbn}` : '', tag ? 'Текст : непосредственный' : '']);
  }

  article(d, tag){
    const list = this.authors(d.authors);
    const lat = this.latin(d.title);
    const tb = this.titleBlock(this.heading(list), d.title, '', this.resp(list, lat));
    const journal = this.clean(d.journal);
    if (!tb || !journal) return '';
    const left = tag ? this.joinOpen([tb, 'Текст : непосредственный']) : tb;
    const vol = this.clean(d.volume);
    const iss = this.clean(d.issue);
    const vi = lat
      ? (vol && iss ? `Vol. ${vol}, no. ${iss}` : vol ? `Vol. ${vol}` : iss ? `No. ${iss}` : '')
      : (vol && iss ? `Т. ${vol}, № ${iss}` : vol ? `Т. ${vol}` : iss ? `№ ${iss}` : '');
    const pg = this.pages(d.pages);
    const doi = this.clean(d.doi).replace(/^(doi:?\s*|https?:\/\/(dx\.)?doi\.org\/)/i, '');
    return `${left} // ` + this.join([journal, this.clean(d.year), vi, pg ? `${lat ? 'P.' : 'С.'} ${pg}` : '', doi ? `DOI ${doi}` : '']);
  }

  web(d, tag){
    const list = this.authors(d.authors);
    const tb = this.titleBlock(this.heading(list), d.title, '', this.resp(list, this.latin(d.title)));
    const url = String(d.url == null ? '' : d.url).trim();
    if (!tb || !url) return '';
    const link = `URL: ${url} (дата обращения: ${this.date(d.date)})`;
    const kind = tag ? 'Текст : электронный' : '';
    const site = this.clean(d.site);
    if (site) {
      const left = kind ? this.joinOpen([tb, kind]) : tb;
      return `${left} // ` + this.join([`${site} : [сайт]`, this.clean(d.year), link]);
    }
    return this.join([tb, this.clean(d.year), link, kind]);
  }

  thesis(d, tag){
    const a = this.parseName(d.fullName);
    const title = this.clean(d.title);
    const branch = this.clean(d.branch).replace(/\s+наук$/i, '');
    if (!a || !title || !branch) return '';
    const code = this.clean(d.specCode);
    const spec = this.clean(d.specName);
    const sp = code && spec ? `специальность ${code} «${spec}»` : code ? `специальность ${code}` : spec ? `специальность «${spec}»` : '';
    const what = (d.workKind === 'autoref' ? 'автореферат диссертации' : 'диссертация')
      + ` на соискание ученой степени ${d.degree === 'doctor' ? 'доктора' : 'кандидата'} ${branch} наук`;
    const org = this.clean(d.org);
    const head = a.init ? `${a.last}, ${a.init}` : `${a.last}.`;
    const tb = `${head} ${[title, sp, what].filter(Boolean).join(' : ')} / ${this.clean(a.full)}${org ? ` ; ${org}` : ''}`;
    const city = this.clean(d.city);
    const year = this.clean(d.year);
    const pub = city && year ? `${city}, ${year}` : (city || year);
    const pg = this.pages(d.pages);
    return this.join([tb, pub, pg ? `${pg} с.` : '', tag ? 'Текст : непосредственный' : '']);
  }

  formatEntry(kind, d, tag){
    const f = [this.book, this.article, this.web, this.thesis][kind];
    return f ? f.call(this, d || {}, tag) : '';
  }

  // Кириллица, затем латиница; внутри — по алфавиту.
  ordered(rows){
    if (!this.state.sort) return rows;
    const cyr = (s) => /^[«"(\[]?[А-Яа-яЁё]/.test(s);
    return [...rows].sort((x, y) => {
      const a = cyr(x.text);
      const b = cyr(y.text);
      if (a !== b) return a ? -1 : 1;
      return x.text.localeCompare(y.text, a ? 'ru' : 'en', { sensitivity: 'base' });
    });
  }

  // На странице инициалы не отрываются от фамилии и номер от «Т.», «№», «С.»;
  // в буфер обмена уходит исходный текст с обычными пробелами.
  display(t){
    // Инициал из одной-двух букв привязывается к следующему слову с заглавной.
    // Без ретроспективной проверки: старый Safari её не разбирает.
    const initial = /(^|[\s(])([A-Za-zА-Яа-яЁё]{1,2}\.) (?=[A-ZА-ЯЁ])/g;
    let out = String(t);
    for (let k = 0; k < 4; k++) {
      const next = out.replace(initial, '$1$2\u00a0');
      if (next === out) break;
      out = next;
    }
    return out
      .replace(/(^|\s)(Т\.|№|С\.|Vol\.|no\.|No\.|P\.) (?=\d)/g, '$1$2\u00a0')
      .replace(/(\d) (с\.)/g, '$1\u00a0$2');
  }

  plural(n){
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'запись';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'записи';
    return 'записей';
  }

  renderVals(){
    const k = this.state.kind;
    const tag = this.state.typeTag;
    const rows = this.ordered(this.state.items.map((it) => ({ id: it.id, text: this.formatEntry(it.kind, it.data, tag) })));
    const list = rows.map((r, i) => ({
      num: `${i + 1}.`,
      text: this.display(r.text),
      raw: r.text,
      removeLabel: `Удалить запись ${i + 1}`,
      remove: () => this.setState((s) => ({ items: s.items.filter((x) => x.id !== r.id), copied: false, copyFail: false })),
    }));
    const text = list.map((r) => `${r.num} ${r.raw}`).join('\n');
    return {
      kinds: ['Книга', 'Статья в журнале', 'Сайт', 'Диссертация'].map((label, i) => ({
        label,
        active: i === k,
        inactive: i !== k,
        pick: () => this.setState({ kind: i }),
      })),
      isBook: k === 0,
      isArticle: k === 1,
      isWeb: k === 2,
      isThesis: k === 3,
      list,
      hasItems: list.length > 0,
      noItems: list.length === 0,
      countText: `В списке ${list.length} ${this.plural(list.length)}`,
      sort: this.state.sort,
      typeTag: tag,
      toggleSort: () => this.setState((s) => ({ sort: !s.sort, copied: false })),
      toggleTag: () => this.setState((s) => ({ typeTag: !s.typeTag, copied: false })),
      addEntry: (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = {};
        new FormData(form).forEach((v, key) => { data[key] = String(v); });
        if (!this.formatEntry(k, data, tag)) return;
        this.setState((s) => ({ items: [...s.items, { id: `${Date.now()}-${s.items.length}`, kind: k, data }], copied: false, copyFail: false }));
        form.reset();
      },
      copyList: () => {
        const done = () => this.setState({ copied: true, copyFail: false });
        const fail = () => this.setState({ copied: false, copyFail: true });
        try { navigator.clipboard.writeText(text).then(done, fail); } catch (err) { fail(); }
      },
      clearList: () => this.setState({ items: [], copied: false, copyFail: false }),
      copied: this.state.copied,
      copyFail: this.state.copyFail,
      // Образцы считает тот же оформитель, поэтому они не расходятся с
      // записями посетителя. Данные условные: издательство, журнал и
      // организация названы родовыми словами (Р-789).
      samples: [
        ['Книга, два автора', 0, { authors: 'Иванов И. И.\nПетров П. П.', title: 'Методология научного исследования', other: 'учебное пособие', edition: '2-е изд., перераб. и доп.', city: 'Москва', publisher: 'Издательство', year: '2024', pages: '256' }],
        ['Статья, пять авторов', 1, { authors: 'Иванов И. И.;Петров П. П.;Сидоров С. С.;Алексеев А. А.;Борисов Б. Б.', title: 'Оценка устойчивости региональных систем', journal: 'Название журнала', year: '2025', volume: '12', issue: '3', pages: '45-52' }],
        ['Страница сайта', 2, { title: 'Перечень рецензируемых научных изданий', site: 'ВАК при Минобрнауки России', url: 'https://vak.minobrnauki.gov.ru', date: '2026-11-01' }],
        ['Автореферат диссертации', 3, { fullName: 'Иванова Мария Сергеевна', title: 'Развитие региональных инновационных систем', specCode: '5.2.3', specName: 'Региональная и отраслевая экономика', workKind: 'autoref', degree: 'candidate', branch: 'экономических', org: 'Название организации', city: 'Москва', year: '2025', pages: '24' }],
      ].map(([label, kind, d]) => ({ label, text: this.display(this.formatEntry(kind, d, true)) })),
    };
  }

  /**
   * Обработчик отправки из макета только поднимал флаг «отправлено».
   * Здесь он оборачивается: заявка уходит на сервер, и только успешный
   * ответ переводит форму в состояние успеха.
   */
  private wrapSubmit(key: string, original: any) {
    return async (e: any) => {
      const form: HTMLFormElement = e.currentTarget;
      const errKey = 'error' + key.slice('submit'.length);
      this.setState((s: any) => ({ __ui: { ...(s.__ui ?? {}), [errKey]: null, pending: true } }));
      const outcome = await submitLead(e, "landing", key.slice('submit'.length).toLowerCase() || 'request');
      if (outcome.ok) {
        this.setState((s: any) => ({ __ui: { ...(s.__ui ?? {}), pending: false } }));
        // Заявка: благодарность всплывает поверх страницы, форма уже
        // очищена (components/LeadThanks.tsx, Р-406). Прочее — как в макете.
        const thanks = LEAD_THANKS[key];
        if (thanks && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('pd:lead-sent', { detail: { text: thanks, form } }));
          return;
        }
        if (typeof original === 'function') original({ preventDefault() {}, currentTarget: form });
        return;
      }
      this.setState((s: any) => ({
        __ui: { ...(s.__ui ?? {}), pending: false, [errKey]: outcome.message || null },
      }));
    };
  }

  render() {
    const base: any = this.renderVals ? this.renderVals() : {};
    // состояния отправки живут рядом со значениями макета, а не внутри него
    const v: any = { ...base, ...(this.state?.__ui ?? {}) };
    for (const k of Object.keys(base)) {
      if (k.startsWith('submit') && typeof base[k] === 'function') v[k] = this.wrapSubmit(k, base[k]);
    }
    // До оживления страницы обработчика отправки ещё нет: кнопка выключена,
    // и Enter форму не отправляет — заявка не уходит мимо сервера (Р-508).
    if (this.state?.__live !== true) v.pending = true;
    const {
      addEntry,
      clearList,
      copied,
      copyFail,
      copyList,
      countText,
      hasItems,
      isArticle,
      isBook,
      isThesis,
      isWeb,
      kinds,
      list,
      noItems,
      pending,
      samples,
      sort,
      toggleSort,
      toggleTag,
      typeTag,
    } = v;
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <div style={{ position: "relative", background: "var(--pd-ink-inverse)", color: "var(--pd-ink)", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", WebkitFontSmoothing: "antialiased" }}><a className="pd-skip" href="#main">Перейти к содержанию</a><header className="doc-head doc-pad" style={{ maxWidth: "1220px", margin: "0 auto", padding: "24px 30px 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "24px", flexWrap: "wrap" }}><a className="doc-mark x1 x2" href="/" aria-label="ProDisser — на главную" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", padding: "6px 10px", margin: "-6px -10px", borderRadius: "10px", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "27px", lineHeight: "1.24", fontWeight: "600", letterSpacing: ".005em", transition: "background 180ms cubic-bezier(.2,0,.2,1)" }}><span style={{ color: "var(--pd-accent)" }}>PRO</span><span style={{ color: "var(--pd-ink)" }}>DISSER</span></a><a className="pd-cabinet x3 x4" href="/cabinet" style={{ appearance: "none", cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", minHeight: "44px", background: "transparent", border: "1px solid transparent", color: "var(--pd-ink)", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "15px", fontWeight: "600", padding: "0 22px", borderRadius: "999px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),color 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>Личный кабинет</a></header><main className="doc-pad" id="main" style={{ maxWidth: "1220px", margin: "0 auto", padding: "clamp(56px,7vw,96px) 30px clamp(72px,8vw,112px)" }}><div style={{ maxWidth: "66ch" }}><span style={{ display: "block", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Инструменты · бесплатно</span><h1 style={{ margin: "12px 0 0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "clamp(28px,3vw,40px)", lineHeight: "1.24", fontWeight: "500", letterSpacing: "-.015em", color: "var(--pd-ink)" }}>Список литературы по <span style={{ background: "var(--pd-accent-mark)", borderRadius: "6px", padding: "0 6px", whiteSpace: "nowrap", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>ГОСТ Р 7.0.100-2018</span></h1><p style={{ margin: "20px 0 0", fontSize: "16px", lineHeight: "1.6", color: "var(--pd-ink-secondary)" }}>Заполните поля источника — запись появится в списке по правилам библиографического описания. Список сортируется по алфавиту и копируется одной кнопкой.</p><p style={{ margin: "12px 0 0", fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-muted)" }}>Работает в браузере: введённое никуда не отправляется и не сохраняется после закрытия вкладки.</p></div><div className="tl-grid" style={{ marginTop: "40px" }}><section aria-labelledby="tl-new" style={{ background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "14px", padding: "26px 28px 28px", boxShadow: "0 6px 14px rgba(20,22,28,.06),0 1px 2px rgba(20,22,28,.05)", display: "flex", flexDirection: "column", gap: "20px", minWidth: "0" }}><h2 id="tl-new" style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "22px", lineHeight: "1.4", fontWeight: "500", letterSpacing: "-.012em", color: "var(--pd-ink)" }}>Новый источник</h2><div className="tl-kinds" role="group" aria-label="Вид источника" style={{ display: "inline-flex", flexWrap: "wrap", gap: "4px", padding: "4px", background: "var(--pd-surface-quiet)", border: "1px solid var(--pd-border)", borderRadius: "999px", alignSelf: "flex-start", maxWidth: "100%" }}>{(kinds ?? []).map((c: any, _i0: number) => (<React.Fragment key={_i0}>{c.active ? (<><button className="x5 x4" type="button" aria-pressed="true" onClick={c.pick} style={{ appearance: "none", border: "0", cursor: "pointer", background: "var(--pd-ink)", color: "var(--pd-ink-inverse)", borderRadius: "999px", padding: "0 18px", minHeight: "44px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.4", fontWeight: "600", transition: "background 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>{c.label}</button></>) : null}{c.inactive ? (<><button className="x6 x4" type="button" aria-pressed="false" onClick={c.pick} style={{ appearance: "none", border: "0", cursor: "pointer", background: "transparent", color: "var(--pd-ink-muted)", borderRadius: "999px", padding: "0 18px", minHeight: "44px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.4", fontWeight: "600", transition: "background 180ms cubic-bezier(.2,0,.2,1),color 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>{c.label}</button></>) : null}</React.Fragment>))}</div><form onSubmit={addEntry} style={{ display: "flex", flexDirection: "column", gap: "20px" }} method="post">{isBook ? (<><div className="tl-fields"><label className="tl-wide" htmlFor="tl-authors" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Авторы
        <textarea className="x7" id="tl-authors" name="authors" rows={3} aria-describedby="tl-authors-hint" style={{ boxSizing: "border-box", padding: "12px 16px", lineHeight: "1.5", resize: "vertical", minHeight: "96px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }}></textarea><span id="tl-authors-hint" style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.5", color: "var(--pd-ink-muted)", textTransform: "none", letterSpacing: "0" }}>По одному в строке: «Иванов И. И.» или «Иванов Иван Иванович»</span></label><label className="tl-wide" htmlFor="tl-title" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Заглавие *
        <input className="x7" id="tl-title" name="title" type="text" autoComplete="off" required={true} style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label className="tl-wide" htmlFor="tl-other" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Сведения к заглавию
        <input className="x7" id="tl-other" name="other" type="text" autoComplete="off" placeholder="учебное пособие, монография" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label htmlFor="tl-edition" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Сведения об издании
        <input className="x7" id="tl-edition" name="edition" type="text" autoComplete="off" placeholder="2-е изд., перераб. и доп." style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label htmlFor="tl-city" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Место издания
        <input className="x7" id="tl-city" name="city" type="text" autoComplete="off" placeholder="Например: Москва" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label htmlFor="tl-publisher" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Издательство
        <input className="x7" id="tl-publisher" name="publisher" type="text" autoComplete="off" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label htmlFor="tl-year" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Год
        <input className="x7" id="tl-year" name="year" type="text" autoComplete="off" inputMode="numeric" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label htmlFor="tl-pages" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Число страниц
        <input className="x7" id="tl-pages" name="pages" type="text" autoComplete="off" inputMode="numeric" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label htmlFor="tl-isbn" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>ISBN
        <input className="x7" id="tl-isbn" name="isbn" type="text" autoComplete="off" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label></div></>) : null}{isArticle ? (<><div className="tl-fields"><label className="tl-wide" htmlFor="tl-authors" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Авторы
        <textarea className="x7" id="tl-authors" name="authors" rows={3} aria-describedby="tl-authors-hint" style={{ boxSizing: "border-box", padding: "12px 16px", lineHeight: "1.5", resize: "vertical", minHeight: "96px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }}></textarea><span id="tl-authors-hint" style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.5", color: "var(--pd-ink-muted)", textTransform: "none", letterSpacing: "0" }}>По одному в строке: «Иванов И. И.» или «Иванов Иван Иванович»</span></label><label className="tl-wide" htmlFor="tl-title" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Заглавие статьи *
        <input className="x7" id="tl-title" name="title" type="text" autoComplete="off" required={true} style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label className="tl-wide" htmlFor="tl-journal" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Журнал *
        <input className="x7" id="tl-journal" name="journal" type="text" autoComplete="off" required={true} style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label htmlFor="tl-year" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Год
        <input className="x7" id="tl-year" name="year" type="text" autoComplete="off" inputMode="numeric" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label htmlFor="tl-volume" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Том
        <input className="x7" id="tl-volume" name="volume" type="text" autoComplete="off" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label htmlFor="tl-issue" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Номер
        <input className="x7" id="tl-issue" name="issue" type="text" autoComplete="off" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label htmlFor="tl-pages" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Страницы
        <input className="x7" id="tl-pages" name="pages" type="text" autoComplete="off" placeholder="Например: 45–52" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label className="tl-wide" htmlFor="tl-doi" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>DOI
        <input className="x7" id="tl-doi" name="doi" type="text" autoComplete="off" placeholder="10.31857/S0042873620030045" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label></div></>) : null}{isWeb ? (<><div className="tl-fields"><label className="tl-wide" htmlFor="tl-authors" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Авторы
        <textarea className="x7" id="tl-authors" name="authors" rows={2} aria-describedby="tl-authors-hint" style={{ boxSizing: "border-box", padding: "12px 16px", lineHeight: "1.5", resize: "vertical", minHeight: "96px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }}></textarea><span id="tl-authors-hint" style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.5", color: "var(--pd-ink-muted)", textTransform: "none", letterSpacing: "0" }}>Если указаны на странице</span></label><label className="tl-wide" htmlFor="tl-title" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Заглавие страницы *
        <input className="x7" id="tl-title" name="title" type="text" autoComplete="off" required={true} style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label className="tl-wide" htmlFor="tl-site" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Название сайта
        <input className="x7" id="tl-site" name="site" type="text" autoComplete="off" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label className="tl-wide" htmlFor="tl-url" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Адрес страницы *
        <input className="x7" id="tl-url" name="url" type="url" autoComplete="off" required={true} placeholder="https://" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label htmlFor="tl-year" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Год
        <input className="x7" id="tl-year" name="year" type="text" autoComplete="off" inputMode="numeric" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label htmlFor="tl-date" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Дата обращения
        <input className="x7" id="tl-date" name="date" type="date" autoComplete="off" aria-describedby="tl-date-hint" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /><span id="tl-date-hint" style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.5", color: "var(--pd-ink-muted)", textTransform: "none", letterSpacing: "0" }}>Пустое поле — сегодняшняя дата</span></label></div></>) : null}{isThesis ? (<><div className="tl-fields"><label className="tl-wide" htmlFor="tl-fullName" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Автор *
        <input className="x7" id="tl-fullName" name="fullName" type="text" autoComplete="off" required={true} placeholder="Фамилия Имя Отчество" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label className="tl-wide" htmlFor="tl-title" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Заглавие *
        <input className="x7" id="tl-title" name="title" type="text" autoComplete="off" required={true} style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label htmlFor="tl-workKind" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Вид работы
        <select className="x7" id="tl-workKind" name="workKind" style={{ height: "48px", boxSizing: "border-box", padding: "0 12px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }}><option value="thesis">Диссертация</option><option value="autoref">Автореферат диссертации</option></select></label><label htmlFor="tl-degree" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Учёная степень
        <select className="x7" id="tl-degree" name="degree" style={{ height: "48px", boxSizing: "border-box", padding: "0 12px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }}><option value="candidate">Кандидат наук</option><option value="doctor">Доктор наук</option></select></label><label htmlFor="tl-branch" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Отрасль науки *
        <input className="x7" id="tl-branch" name="branch" type="text" autoComplete="off" required={true} placeholder="Например: экономических" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label htmlFor="tl-specCode" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Шифр специальности
        <input className="x7" id="tl-specCode" name="specCode" type="text" autoComplete="off" placeholder="Например: 5.2.3" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label className="tl-wide" htmlFor="tl-specName" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Название специальности
        <input className="x7" id="tl-specName" name="specName" type="text" autoComplete="off" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label className="tl-wide" htmlFor="tl-org" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Организация
        <input className="x7" id="tl-org" name="org" type="text" autoComplete="off" aria-describedby="tl-org-hint" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /><span id="tl-org-hint" style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.5", color: "var(--pd-ink-muted)", textTransform: "none", letterSpacing: "0" }}>Где выполнена работа</span></label><label htmlFor="tl-city" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Город
        <input className="x7" id="tl-city" name="city" type="text" autoComplete="off" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label htmlFor="tl-year" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Год
        <input className="x7" id="tl-year" name="year" type="text" autoComplete="off" inputMode="numeric" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label htmlFor="tl-pages" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Число страниц
        <input className="x7" id="tl-pages" name="pages" type="text" autoComplete="off" inputMode="numeric" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", textTransform: "none", letterSpacing: "0", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label></div></>) : null}<div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 20px" }}><button className="x5 x4" type="submit" disabled={pending} style={{ appearance: "none", border: "0", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: "44px", background: "var(--pd-ink)", color: "var(--pd-ink-inverse)", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "15px", fontWeight: "600", padding: "0 28px", borderRadius: "999px", transition: "background 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>Добавить в список</button><span style={{ fontSize: "13px", lineHeight: "1.5", color: "var(--pd-ink-muted)" }}>Поля со звёздочкой обязательны</span></div></form></section><section aria-labelledby="tl-list" style={{ background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "14px", padding: "26px 28px 28px", boxShadow: "0 6px 14px rgba(20,22,28,.06),0 1px 2px rgba(20,22,28,.05)", display: "flex", flexDirection: "column", gap: "20px", minWidth: "0" }}><div style={{ display: "flex", flexDirection: "column", gap: "6px" }}><h2 id="tl-list" style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "22px", lineHeight: "1.4", fontWeight: "500", letterSpacing: "-.012em", color: "var(--pd-ink)" }}>Список литературы</h2><p aria-live="polite" style={{ margin: "0", fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-muted)" }}>{countText}</p></div><div style={{ display: "flex", flexDirection: "column", gap: "0" }}><label htmlFor="tl-sort" style={{ display: "flex", minHeight: "44px", alignItems: "center", gap: "10px", fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-secondary)", cursor: "pointer" }}><input id="tl-sort" type="checkbox" checked={sort} onChange={toggleSort} style={{ width: "16px", height: "16px", flex: "0 0 16px", margin: "0", cursor: "pointer" }} /><span>По алфавиту: кириллица, затем латиница</span></label><label htmlFor="tl-tag" style={{ display: "flex", minHeight: "44px", alignItems: "center", gap: "10px", fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-secondary)", cursor: "pointer" }}><input id="tl-tag" type="checkbox" checked={typeTag} onChange={toggleTag} style={{ width: "16px", height: "16px", flex: "0 0 16px", margin: "0", cursor: "pointer" }} /><span>Указывать вид содержания</span></label></div>{noItems ? (<><p style={{ margin: "0", padding: "18px 20px", borderRadius: "10px", background: "var(--pd-surface-quiet)", fontSize: "14px", lineHeight: "1.6", color: "var(--pd-ink-secondary)" }}>Добавленные источники появятся здесь с номерами. Порядок и оформление пересчитываются при каждом изменении.</p></>) : null}{hasItems ? (<><ol style={{ listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column" }}>{(list ?? []).map((it: any, _i0: number) => (<React.Fragment key={_i0}><li style={{ display: "grid", gridTemplateColumns: "28px minmax(0,1fr) auto", gap: "10px", alignItems: "start", padding: "12px 0", borderTop: "1px solid var(--pd-divider)" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "14px", lineHeight: "1.6", color: "var(--pd-accent)", fontVariantNumeric: "tabular-nums" }}>{it.num}</span><span style={{ fontSize: "14px", lineHeight: "1.6", color: "var(--pd-ink)", overflowWrap: "anywhere" }}>{it.text}</span><button className="x8" type="button" aria-label={it.removeLabel} onClick={it.remove} style={{ appearance: "none", cursor: "pointer", width: "44px", height: "44px", margin: "-10px -10px 0 0", border: "1px solid transparent", borderRadius: "999px", background: "transparent", color: "var(--pd-ink-muted)", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "20px", lineHeight: "1", display: "flex", alignItems: "center", justifyContent: "center", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),color 180ms cubic-bezier(.2,0,.2,1)" }}>×</button></li></React.Fragment>))}</ol><div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}><button className="x5 x4" type="button" onClick={copyList} style={{ appearance: "none", border: "0", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: "44px", background: "var(--pd-ink)", color: "var(--pd-ink-inverse)", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "15px", fontWeight: "600", padding: "0 28px", borderRadius: "999px", transition: "background 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>Скопировать список</button><button className="x3 x4" type="button" onClick={clearList} style={{ appearance: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: "44px", background: "transparent", border: "1px solid transparent", color: "var(--pd-ink)", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "15px", fontWeight: "600", padding: "0 22px", borderRadius: "999px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>Очистить</button></div>{copied ? (<><p role="status" style={{ margin: "0", padding: "12px 16px", borderRadius: "10px", background: "var(--pd-ok-bg)", border: "1px solid var(--pd-ok-border)", color: "var(--pd-ok-ink)", fontSize: "14px", lineHeight: "1.5" }}>Список скопирован. Вставьте его в документ и сверьте с методичкой кафедры.</p></>) : null}{copyFail ? (<><p role="alert" style={{ margin: "0", padding: "12px 16px", borderRadius: "10px", background: "var(--pd-err-bg)", border: "1px solid var(--pd-err-border)", color: "var(--pd-err-ink)", fontSize: "14px", lineHeight: "1.5" }}>Браузер не дал скопировать автоматически. Выделите список и скопируйте его вручную.</p></>) : null}</>) : null}</section></div><section className="tl-two" aria-labelledby="tl-rules" style={{ marginTop: "clamp(56px,6vw,88px)" }}><div style={{ display: "flex", flexDirection: "column", gap: "12px" }}><span style={{ display: "block", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Правила описания</span><h2 id="tl-rules" style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "22px", lineHeight: "1.4", fontWeight: "500", letterSpacing: "-.012em", color: "var(--pd-ink)" }}>Что учитывает оформитель</h2><p style={{ margin: "0", fontSize: "14px", lineHeight: "1.6", color: "var(--pd-ink-secondary)", maxWidth: "44ch" }}>Вузы и диссертационные советы уточняют ГОСТ своими правилами. Сверьте результат с методичкой кафедры или требованиями совета.</p></div><ol style={{ listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column" }}><li style={{ display: "grid", gridTemplateColumns: "32px minmax(0,1fr)", gap: "12px", padding: "14px 0", borderTop: "1px solid var(--pd-border)" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.5", letterSpacing: ".05em", color: "var(--pd-accent)", paddingTop: "1px" }}>01</span><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-secondary)" }}>От одного до трёх авторов — запись начинается с фамилии первого автора, в сведениях об ответственности перечислены все.</span></li><li style={{ display: "grid", gridTemplateColumns: "32px minmax(0,1fr)", gap: "12px", padding: "14px 0", borderTop: "1px solid var(--pd-border)" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.5", letterSpacing: ".05em", color: "var(--pd-accent)", paddingTop: "1px" }}>02</span><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-secondary)" }}>Четыре автора — запись начинается с заглавия, в сведениях об ответственности перечислены все четыре.</span></li><li style={{ display: "grid", gridTemplateColumns: "32px minmax(0,1fr)", gap: "12px", padding: "14px 0", borderTop: "1px solid var(--pd-border)" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.5", letterSpacing: ".05em", color: "var(--pd-accent)", paddingTop: "1px" }}>03</span><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-secondary)" }}>Пять и более авторов — первые три и «[и др.]», у описания на латинице — «[et al.]».</span></li><li style={{ display: "grid", gridTemplateColumns: "32px minmax(0,1fr)", gap: "12px", padding: "14px 0", borderTop: "1px solid var(--pd-border)" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.5", letterSpacing: ".05em", color: "var(--pd-accent)", paddingTop: "1px" }}>04</span><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-secondary)" }}>Области описания разделяются точкой и тире; статья связана с журналом знаком «//».</span></li><li style={{ display: "grid", gridTemplateColumns: "32px minmax(0,1fr)", gap: "12px", padding: "14px 0", borderTop: "1px solid var(--pd-border)" }}><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.5", letterSpacing: ".05em", color: "var(--pd-accent)", paddingTop: "1px" }}>05</span><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-secondary)" }}>Вид содержания — «Текст : непосредственный» или «Текст : электронный»; если методичка его не требует, отключите отметку у списка.</span></li></ol></section><section aria-labelledby="tl-samples" style={{ marginTop: "clamp(56px,6vw,88px)", display: "flex", flexDirection: "column", gap: "20px" }}><div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "66ch" }}><span style={{ display: "block", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Образцы</span><h2 id="tl-samples" style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "22px", lineHeight: "1.4", fontWeight: "500", letterSpacing: "-.012em", color: "var(--pd-ink)" }}>Как выглядят записи разных видов</h2><p style={{ margin: "0", fontSize: "14px", lineHeight: "1.6", color: "var(--pd-ink-secondary)" }}>Образцы составлены этим же оформителем. Данные условные: подставьте свои сведения из выходных данных источника.</p></div><div className="tl-samples">{(samples ?? []).map((s: any, _i0: number) => (<React.Fragment key={_i0}><div style={{ background: "var(--pd-surface-quiet)", borderRadius: "14px", padding: "18px 20px 20px", display: "flex", flexDirection: "column", gap: "8px", minWidth: "0" }}><span style={{ display: "block", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>{s.label}</span><p style={{ margin: "0", fontSize: "14px", lineHeight: "1.6", color: "var(--pd-ink)", overflowWrap: "anywhere" }}>{s.text}</p></div></React.Fragment>))}</div></section><section aria-labelledby="tl-more" style={{ marginTop: "clamp(56px,6vw,88px)", background: "var(--pd-accent-tint)", borderRadius: "14px", padding: "clamp(24px,3vw,36px)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "20px 32px" }}><div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "60ch" }}><h2 id="tl-more" style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "22px", lineHeight: "1.4", fontWeight: "500", letterSpacing: "-.012em", color: "var(--pd-ink)" }}>Список — часть оформления работы</h2><p style={{ margin: "0", fontSize: "14px", lineHeight: "1.6", color: "var(--pd-ink-secondary)" }}>Куратор со степенью по вашей специальности сверяет структуру, ссылочный аппарат и список литературы с ГОСТ и требованиями вашей кафедры или совета. Автором работы остаётесь вы.</p></div><a className="x9 x4" href="/#request" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", background: "var(--pd-ink)", color: "var(--pd-ink-inverse)", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "15px", fontWeight: "600", padding: "0 28px", borderRadius: "999px", transition: "background 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>Оставить заявку</a></section></main><footer className="doc-foot doc-pad" style={{ maxWidth: "1220px", margin: "32px auto 0", padding: "0 30px 40px" }}><div style={{ borderTop: "1px solid var(--pd-border)", paddingTop: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "24px", flexWrap: "wrap" }}><div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "14px", lineHeight: "1.4" }}><a className="xa" href="/offer" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", color: "var(--pd-ink-secondary)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>Публичная оферта</a><a className="xa" href="/privacy" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", color: "var(--pd-ink-secondary)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>Политика обработки персональных данных</a><a className="xa" href="/consent" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", color: "var(--pd-ink-secondary)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>Согласие на обработку персональных данных</a><a className="xa" href="/privacy#cookies" data-pd-cookies={true} style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", color: "var(--pd-ink-secondary)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>Настройки cookies</a><a className="xa" href="/" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", color: "var(--pd-ink-secondary)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>На главную</a></div></div></footer></div>
      </>
    );
  }
}

/** Страница ожила: обработчики подключены, кнопки отправки включаются (Р-508). */
export default class ToolsPage extends ToolsPageView {
  componentDidMount() {
    super.componentDidMount?.();
    this.setState({ __live: true });
  }
}

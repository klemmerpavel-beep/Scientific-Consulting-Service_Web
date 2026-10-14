// @ts-nocheck — логика перенесена из макета дословно и правится только в макете.
'use client';
// Сгенерировано из ExpertsPage.dc.html через tools/dc-to-tsx.mjs.
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
@media (max-width:480px){.doc-pad{padding-left:20px!important;padding-right:20px!important}}
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
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}/* Страница «Экспертам» (решение Р-580): две колонки условий, три шага,
   анкета в две колонки коротких полей. Ниже 768 px — одна колонка. */
.ex-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.ex-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.ex-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 16px}
.ex-wide{grid-column:1 / -1}
.ex-consent summary{cursor:pointer;list-style:none;display:inline-flex;align-items:center;min-height:44px;color:var(--pd-accent)}
.ex-consent summary::-webkit-details-marker{display:none}
#ex-files::file-selector-button{min-height:44px;padding:0 18px;margin-right:12px;border-radius:999px;border:1px solid var(--pd-edge-neutral);background:var(--pd-ink-inverse);color:var(--pd-ink);font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:border-color 180ms cubic-bezier(.2,0,.2,1)}
#ex-files::file-selector-button:hover{border-color:var(--pd-ink)}
@media (max-width:768px){.ex-two,.ex-steps,.ex-form{grid-template-columns:minmax(0,1fr)}}

.x1:hover{background:rgba(180,201,229,.34) !important}
.x2:hover{border-color:var(--pd-ink) !important}
.x3:active{transform:scale(.97) !important}
.x4:hover{background:var(--pd-button-hover) !important}
.x5:focus-visible{border-color:var(--pd-accent) !important;box-shadow:0 0 0 3px rgba(20,65,122,.16) !important}
.x6:hover{color:var(--pd-accent) !important}
`;

class ExpertsPageView extends React.Component<any, any> {
state = { sent: false, error: null, busy: false };
  componentDidMount(){
    // Отсчёт для ловушки роботов: быстрее трёх секунд анкету не заполнить.
    this.openedAt = Date.now();
  }
  renderVals(){
    return {
      sent: this.state.sent,
      error: this.state.error,
      pending: this.state.busy,
      // Анкета уходит с файлами на /api/experts, а не JSON на /api/lead:
      // обработчик назван не «submit…», и обёртка заявки его не трогает
      // (решение Р-580).
      sendApplication: async e => {
        e.preventDefault();
        const form = e.currentTarget;
        const input = form.querySelector('input[type="file"]');
        const files = input && input.files ? Array.from(input.files) : [];
        const MB = 1024 * 1024;
        if (files.length > 3) { this.setState({ error: 'Не больше трёх файлов: резюме и до двух примеров работ.' }); return; }
        const big = files.find(f => f.size > 10 * MB);
        if (big) { this.setState({ error: 'Файл «' + big.name + '» больше 10 МБ.' }); return; }
        if (files.reduce((sum, f) => sum + f.size, 0) > 20 * MB) { this.setState({ error: 'Файлы вместе больше 20 МБ — уменьшите их или пришлите ссылки.' }); return; }
        const data = new FormData(form);
        data.set('elapsed', String(Date.now() - (this.openedAt || Date.now())));
        this.setState({ busy: true, error: null, sent: false });
        try {
          const res = await fetch('/api/experts', { method: 'POST', body: data });
          const out = await res.json().catch(() => ({}));
          if (res.ok && out.ok) {
            form.reset();
            this.setState({ busy: false, sent: true }, () => { const el = document.querySelector('[data-sent="expert"]'); if (el) el.focus(); });
            return;
          }
          this.setState({ busy: false, error: out.error || 'Не удалось отправить анкету. Попробуйте ещё раз.' });
        } catch {
          this.setState({ busy: false, error: 'Нет связи с сервером. Проверьте подключение и отправьте анкету ещё раз.' });
        }
      },
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
      error,
      pending,
      sendApplication,
      sent,
    } = v;
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <div style={{ position: "relative", background: "var(--pd-ink-inverse)", color: "var(--pd-ink)", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", WebkitFontSmoothing: "antialiased" }}><a className="pd-skip" href="#main">Перейти к содержанию</a><header className="doc-head doc-pad" style={{ maxWidth: "1220px", margin: "0 auto", padding: "24px 30px 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "24px", flexWrap: "wrap" }}><a className="x1" href="/" aria-label="ProDisser — на главную" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", padding: "6px 10px", margin: "-6px -10px", borderRadius: "10px", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "27px", lineHeight: "1.24", fontWeight: "600", letterSpacing: ".005em", transition: "background 180ms cubic-bezier(.2,0,.2,1)" }}><span style={{ color: "var(--pd-accent)" }}>PRO</span><span style={{ color: "var(--pd-ink)" }}>DISSER</span></a><a className="pd-cabinet x2 x3" href="/cabinet" style={{ appearance: "none", cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", minHeight: "44px", background: "transparent", border: "1px solid transparent", color: "var(--pd-ink)", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "15px", fontWeight: "600", padding: "0 22px", borderRadius: "999px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),color 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>Личный кабинет</a></header><main className="doc-pad" id="main" style={{ maxWidth: "1220px", margin: "0 auto", padding: "clamp(56px,8vw,112px) 30px clamp(56px,8vw,112px)", display: "flex", flexDirection: "column", gap: "clamp(48px,6vw,80px)" }}><section aria-labelledby="ex-title" style={{ maxWidth: "62ch" }}><span style={{ display: "block", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Экспертам</span><h1 id="ex-title" style={{ margin: "12px 0 0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "clamp(28px,2.8vw,40px)", lineHeight: "1.24", fontWeight: "500", letterSpacing: "-.015em", color: "var(--pd-ink)" }}>Станьте экспертом ProDisser</h1><p style={{ margin: "20px 0 0", fontSize: "17px", lineHeight: "1.6", color: "var(--pd-ink-secondary)" }}>ProDisser сопровождает аспирантов, студентов и компании в научной работе: консультирует по методологии, проверяет главы, готовит к защите и экспертизе. Автором работы всегда остаётся клиент. Мы ищем кандидатов и докторов наук, преподавателей и специалистов, готовых вести такое сопровождение по своей специальности.</p><div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "28px" }}><a className="x4 x3" href="#anketa" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", background: "var(--pd-ink)", color: "var(--pd-ink-inverse)", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "14px", fontWeight: "600", padding: "0 28px", borderRadius: "999px", transition: "background 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>Заполнить анкету</a><a className="x2" href="/" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", background: "transparent", border: "1px solid var(--pd-edge-neutral)", color: "var(--pd-ink)", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "14px", fontWeight: "600", padding: "0 24px", borderRadius: "999px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1)" }}>На главную</a></div></section><section aria-labelledby="ex-terms"><h2 id="ex-terms" style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "22px", lineHeight: "1.4", fontWeight: "500", letterSpacing: "-.012em", color: "var(--pd-ink)" }}>Кого мы ищем и как устроена работа</h2><div className="ex-two" style={{ marginTop: "20px" }}><div style={{ border: "1px solid var(--pd-border)", borderRadius: "14px", padding: "20px 22px", background: "var(--pd-ink-inverse)", boxShadow: "0 1px 2px rgba(20,22,28,.05)" }}><h3 style={{ margin: "0 0 10px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", lineHeight: "1.4", fontWeight: "600", color: "var(--pd-ink)" }}>Кого мы ищем</h3><ul style={{ margin: "0", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "8px" }}><li style={{ fontSize: "15px", lineHeight: "1.6", color: "var(--pd-ink-secondary)" }}>Кандидатов и докторов наук, PhD — по любой научной специальности.</li><li style={{ fontSize: "15px", lineHeight: "1.6", color: "var(--pd-ink-secondary)" }}>Преподавателей вузов с опытом руководства ВКР и аспирантами.</li><li style={{ fontSize: "15px", lineHeight: "1.6", color: "var(--pd-ink-secondary)" }}>Специалистов по НИОКР, патентам и грантовым заявкам.</li></ul></div><div style={{ border: "1px solid var(--pd-border)", borderRadius: "14px", padding: "20px 22px", background: "var(--pd-ink-inverse)", boxShadow: "0 1px 2px rgba(20,22,28,.05)" }}><h3 style={{ margin: "0 0 10px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", lineHeight: "1.4", fontWeight: "600", color: "var(--pd-ink)" }}>Как устроена работа</h3><ul style={{ margin: "0", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "8px" }}><li style={{ fontSize: "15px", lineHeight: "1.6", color: "var(--pd-ink-secondary)" }}>Задачи по вашей специальности: консультации, разбор глав, методическое сопровождение, подготовка к защите.</li><li style={{ fontSize: "15px", lineHeight: "1.6", color: "var(--pd-ink-secondary)" }}>Дистанционно, в своём графике; работу клиента ведёт менеджер практики.</li><li style={{ fontSize: "15px", lineHeight: "1.6", color: "var(--pd-ink-secondary)" }}>Переписка и файлы — в личном кабинете; контакты клиента и эксперта друг другу не передаются.</li><li style={{ fontSize: "15px", lineHeight: "1.6", color: "var(--pd-ink-secondary)" }}>Вознаграждение — за каждый принятый этап, по гражданско-правовому договору.</li></ul></div></div></section><section aria-labelledby="ex-steps"><h2 id="ex-steps" style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "22px", lineHeight: "1.4", fontWeight: "500", letterSpacing: "-.012em", color: "var(--pd-ink)" }}>Как присоединиться</h2><ol className="ex-steps" style={{ margin: "20px 0 0", padding: "0", listStyle: "none" }}><li style={{ border: "1px solid var(--pd-border)", borderRadius: "14px", padding: "20px 22px", background: "var(--pd-ink-inverse)", boxShadow: "0 1px 2px rgba(20,22,28,.05)" }}><span style={{ display: "block", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Шаг 1</span><h3 style={{ margin: "0 0 10px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", lineHeight: "1.4", fontWeight: "600", color: "var(--pd-ink)", marginTop: "8px" }}>Анкета</h3><p style={{ margin: "0", fontSize: "15px", lineHeight: "1.6", color: "var(--pd-ink-secondary)" }}>Опыт, сфера, резюме и примеры работ — около десяти минут.</p></li><li style={{ border: "1px solid var(--pd-border)", borderRadius: "14px", padding: "20px 22px", background: "var(--pd-ink-inverse)", boxShadow: "0 1px 2px rgba(20,22,28,.05)" }}><span style={{ display: "block", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Шаг 2</span><h3 style={{ margin: "0 0 10px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", lineHeight: "1.4", fontWeight: "600", color: "var(--pd-ink)", marginTop: "8px" }}>Разговор</h3><p style={{ margin: "0", fontSize: "15px", lineHeight: "1.6", color: "var(--pd-ink-secondary)" }}>Руководитель практики разберёт анкету и напишет вам на почту, чтобы обсудить задачи и условия.</p></li><li style={{ border: "1px solid var(--pd-border)", borderRadius: "14px", padding: "20px 22px", background: "var(--pd-ink-inverse)", boxShadow: "0 1px 2px rgba(20,22,28,.05)" }}><span style={{ display: "block", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Шаг 3</span><h3 style={{ margin: "0 0 10px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", lineHeight: "1.4", fontWeight: "600", color: "var(--pd-ink)", marginTop: "8px" }}>Договор и кабинет</h3><p style={{ margin: "0", fontSize: "15px", lineHeight: "1.6", color: "var(--pd-ink-secondary)" }}>Договор и поручение обработки персональных данных, затем ссылка входа в личный кабинет.</p></li></ol></section><section id="anketa" aria-labelledby="ex-form" style={{ maxWidth: "820px" }}><h2 id="ex-form" style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "22px", lineHeight: "1.4", fontWeight: "500", letterSpacing: "-.012em", color: "var(--pd-ink)" }}>Анкета эксперта</h2><p style={{ margin: "8px 0 0", fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-muted)" }}>Поля со звёздочкой обязательны. Файлы — PDF, DOC, DOCX, ODT или RTF, до трёх, каждый до 10 МБ.</p><form onSubmit={sendApplication} style={{ border: "1px solid var(--pd-border)", borderRadius: "14px", padding: "20px 22px", background: "var(--pd-ink-inverse)", boxShadow: "0 1px 2px rgba(20,22,28,.05)", marginTop: "16px" }} method="post"><input type="text" name="company_website" tabIndex="-1" autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", opacity: "0", pointerEvents: "none" }} /><div className="ex-form"><label className="ex-wide" htmlFor="ex-name" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Фамилия, имя, отчество *
        <input className="x5" id="ex-name" name="fullName" type="text" autoComplete="name" required={true} style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label htmlFor="ex-email" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Почта *
        <input className="x5" id="ex-email" name="email" type="email" autoComplete="email" required={true} style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label htmlFor="ex-phone" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Телефон
        <input className="x5" id="ex-phone" name="phone" type="tel" autoComplete="tel" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label htmlFor="ex-degree" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Учёная степень *
        <select className="x5" id="ex-degree" name="degree" required={true} style={{ height: "48px", boxSizing: "border-box", padding: "0 12px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }}><option value="">Выберите</option><option value="Без степени">Без степени</option><option value="Кандидат наук">Кандидат наук</option><option value="Доктор наук">Доктор наук</option><option value="PhD">PhD</option></select></label><label htmlFor="ex-spec" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Научная специальность
        <input className="x5" id="ex-spec" name="speciality" type="text" autoComplete="off" placeholder="Шифр и название" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label className="ex-wide" htmlFor="ex-fields" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Сфера: направления и темы *
        <textarea className="x5" id="ex-fields" name="fields" required={true} rows={3} placeholder="Например: экономика отраслевых рынков, ВКР и диссертации, методология эмпирических исследований" style={{ width: "100%", boxSizing: "border-box", padding: "12px 16px", minHeight: "112px", resize: "vertical", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", lineHeight: "1.5", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }}></textarea></label><label className="ex-wide" htmlFor="ex-exp" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Опыт *
        <textarea className="x5" id="ex-exp" name="experience" required={true} rows={5} placeholder="Руководство ВКР и аспирантами, рецензирование, преподавание, публикации" style={{ width: "100%", boxSizing: "border-box", padding: "12px 16px", minHeight: "112px", resize: "vertical", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", lineHeight: "1.5", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }}></textarea></label><label className="ex-wide" htmlFor="ex-links" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Ссылки
        <input className="x5" id="ex-links" name="links" type="text" autoComplete="off" placeholder="eLIBRARY, ORCID, публикации" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "16px", color: "var(--pd-ink)", background: "var(--pd-ink-inverse)", border: "1px solid var(--pd-border)", borderRadius: "10px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),box-shadow 180ms cubic-bezier(.2,0,.2,1)" }} /></label><label className="ex-wide" htmlFor="ex-files" style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Резюме и примеры работ
        <input id="ex-files" name="files" type="file" multiple={true} accept=".pdf,.doc,.docx,.odt,.rtf" style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "15px", color: "var(--pd-ink-secondary)", minHeight: "44px", textTransform: "none", letterSpacing: "0" }} /></label></div><div className="ex-consent" style={{ marginTop: "12px" }}><label htmlFor="ex-consent" style={{ display: "flex", minHeight: "44px", alignItems: "center", gap: "8px", fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-muted)", cursor: "pointer" }}><input id="ex-consent" name="consent" type="checkbox" required={true} style={{ width: "16px", height: "16px", flex: "0 0 16px", margin: "0", cursor: "pointer" }} /><span>Даю согласие на обработку моих персональных данных на условиях, изложенных ниже *</span></label><details style={{ fontSize: "14px", lineHeight: "1.6", color: "var(--pd-ink-secondary)" }}><summary style={{ fontSize: "14px" }}>Текст согласия кандидата</summary><ol style={{ margin: "8px 0 0", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px" }}><li>Заполняя анкету на странице «Экспертам» сайта prodisser.ru и проставляя отметку о согласии, я свободно, своей волей и в своём интересе даю согласие ООО «РУСДРОН» (ОГРН 1257700248860, ИНН 9723254250, адрес: 109451, г. Москва, вн. тер. г. муниципальный округ Марьино, б-р Перервинский, д. 27, к. 1, помещ. 10н; далее — Оператор) на обработку моих персональных данных.</li><li>Цель обработки — оценка моей квалификации и рассмотрение возможности заключения со мной гражданско-правового договора.</li><li>Перечень данных: фамилия, имя, отчество; адрес электронной почты; номер телефона; учёная степень и научная специальность; сведения об образовании, профессиональном опыте и публикациях; ссылки, указанные в анкете; сведения, содержащиеся в приложенных файлах. Перечень является закрытым.</li><li>Действия с данными: сбор, запись, систематизация, накопление, хранение, уточнение, извлечение, использование, удаление и уничтожение, с использованием средств автоматизации и без них. Данные хранятся на серверах в Российской Федерации, третьим лицам не передаются и не распространяются; трансграничная передача не осуществляется.</li><li>Согласие действует до достижения цели обработки, но не более шести месяцев с даты отправки анкеты; по истечении срока данные и файлы удаляются. После заключения договора данные обрабатываются для его исполнения.</li><li>Согласие может быть отозвано письмом Оператору на адрес <a href="mailto:info.prodisser@gmail.com" style={{ color: "var(--pd-accent)" }}>info.prodisser@gmail.com</a>; анкета и файлы удаляются в течение тридцати дней с даты получения отзыва.</li><li>Порядок обработки описан в <a href="/privacy" target="_blank" rel="noopener" style={{ color: "var(--pd-accent)" }}>Политике обработки персональных данных</a>. Редакция согласия от 14 октября 2026 года.</li></ol></details></div><button className="x4 x3" type="submit" disabled={pending} style={{ appearance: "none", border: "0", cursor: "pointer", marginTop: "16px", background: "var(--pd-ink)", color: "var(--pd-ink-inverse)", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "15px", fontWeight: "600", padding: "16px 36px", borderRadius: "999px", transition: "background 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>Отправить анкету</button>{sent ? (<><div role="status" tabIndex={-1} data-sent="expert" style={{ marginTop: "16px", display: "flex", gap: "8px", alignItems: "flex-start", background: "var(--pd-ok-bg)", border: "1px solid var(--pd-ok-border)", borderRadius: "10px", padding: "12px 16px" }}><span style={{ width: "16px", height: "16px", flex: "0 0 16px", marginTop: "2px", background: "var(--pd-ok-ink)", WebkitMask: "url('./assets/icons/check.svg') center/contain no-repeat", mask: "url('./assets/icons/check.svg') center/contain no-repeat" }}></span><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ok-ink)" }}>Анкета отправлена. Руководитель практики разберёт её и напишет вам на почту.</span></div></>) : null}{error ? (<><div role="alert" style={{ marginTop: "16px", display: "flex", gap: "8px", alignItems: "flex-start", background: "var(--pd-err-bg)", border: "1px solid var(--pd-err-border)", borderRadius: "10px", padding: "12px 16px" }}><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-err-ink)" }}>{error}</span></div></>) : null}</form></section></main><footer className="doc-foot doc-pad" style={{ maxWidth: "1220px", margin: "32px auto 0", padding: "0 30px 40px" }}><div style={{ borderTop: "1px solid var(--pd-border)", paddingTop: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "24px", flexWrap: "wrap" }}><div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "14px", lineHeight: "1.4" }}><a className="x6" href="/offer" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", color: "var(--pd-ink-secondary)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>Публичная оферта</a><a className="x6" href="/privacy" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", color: "var(--pd-ink-secondary)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>Политика обработки персональных данных</a><a className="x6" href="/" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", color: "var(--pd-ink-secondary)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>На главную</a></div></div></footer></div>
      </>
    );
  }
}

/** Страница ожила: обработчики подключены, кнопки отправки включаются (Р-508). */
export default class ExpertsPage extends ExpertsPageView {
  componentDidMount() {
    super.componentDidMount?.();
    this.setState({ __live: true });
  }
}

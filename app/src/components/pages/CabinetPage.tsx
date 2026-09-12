// @ts-nocheck — логика перенесена из макета дословно и правится только в макете.
'use client';
// Сгенерировано из CabinetPage.dc.html через tools/dc-to-tsx.mjs.
// Правки вносятся в макет и переносятся заново, а не здесь.
import React from 'react';
import { submitLead } from '../../lib/submit-lead';
import PhotoSlot from '../PhotoSlot';
import { ABOVE_THE_FOLD } from '../photos';

const css = `

/* Токены палитры. Значения здесь, а не в каждом объявлении: страница
   держит около 1700 упоминаний цвета, и смена одного оттенка иначе
   означает правку в сотнях мест. Роли токенов — docs/DESIGN-SYSTEM.md,
   раздел 2. Цвета внутри атрибутов SVG остаются литералами: var() в
   презентационном атрибуте не работает. */
:root{--pd-ink:#14161C;--pd-ink-secondary:#3D4450;--pd-ink-muted:#5C6474;--pd-ink-inverse:#FFFFFF;--pd-border:#E3E7EC;--pd-divider:#EFF1F4;--pd-surface-quiet:#F6F7F9;--pd-edge-neutral:#C4CAD4;--pd-accent:#14417A;--pd-accent-press:#0F3260;--pd-accent-deep:#0D2B52;--pd-accent-mark:#D8E4F3;--pd-accent-edge:#B4C9E5;--pd-accent-tint:#ECF1F8;--pd-button-hover:#262A33;--pd-accent-hover:#0A2145;--pd-accent-active:#081A38;--pd-ok-bg:#E6F9F1;--pd-ok-ink:#0E4E3C;--pd-err-bg:#FAE7E5;--pd-err-border:#F0C9C3;--pd-err-ink:#8E2C22;--pd-ok-border:#C5EEDD;--pd-accent-soft:#2A63B4;--pd-art-line:#E5EBF2;--pd-art-mark:#D3DEEC;--pd-art-dot:#D8DEE6}
body{margin:0;background:var(--pd-ink-inverse)}a{color:var(--pd-accent);text-decoration:none}a:hover{color:var(--pd-accent-press)}*:focus-visible{outline:2px solid var(--pd-accent);outline-offset:2px}.pd-skip{position:absolute;left:-9999px;top:0;z-index:9;box-sizing:border-box;min-height:44px;display:flex;align-items:center;background:var(--pd-ink);color:var(--pd-ink-inverse);padding:12px 20px;border-radius:0 0 10px 0;font-size:14px;font-weight:600}.pd-skip:focus{left:0;color:var(--pd-ink-inverse)}.doc-layout{display:grid;grid-template-columns:minmax(0,260px) minmax(0,1fr);gap:48px;align-items:start}.doc-toc{position:sticky;top:24px}.doc-toc-btn{display:none}.doc-toc-list{display:flex;flex-direction:column}.doc-toc-list[hidden]{display:none}
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
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
.x1:hover{background:rgba(180,201,229,.34) !important}
.x2:hover{background:var(--pd-button-hover) !important}
.x3:active{transform:scale(.97) !important}
.x4:hover{border-color:var(--pd-accent) !important}
.x5:hover{color:var(--pd-accent) !important}
`;

export default class CabinetPage extends React.Component<any, any> {


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
    const {

    } = v;
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <div style={{ position: "relative", background: "var(--pd-ink-inverse)", color: "var(--pd-ink)", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", WebkitFontSmoothing: "antialiased" }}><a className="pd-skip" href="#main">Перейти к тексту документа</a><header className="doc-head doc-pad" style={{ maxWidth: "1220px", margin: "0 auto", padding: "24px 30px 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "24px", flexWrap: "wrap" }}><a className="x1" href="/" aria-label="ProDisser — на главную" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", padding: "6px 10px", margin: "-6px -10px", borderRadius: "10px", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "27px", lineHeight: "1.24", fontWeight: "600", letterSpacing: ".005em", transition: "background 180ms cubic-bezier(.2,0,.2,1)" }}><span style={{ color: "var(--pd-accent)" }}>PRO</span><span style={{ color: "var(--pd-ink)" }}>DISSER</span></a></header><main className="doc-pad" id="main" style={{ maxWidth: "1220px", margin: "0 auto", padding: "clamp(72px,10vw,140px) 30px clamp(72px,10vw,140px)" }}><div style={{ maxWidth: "52ch" }}><span style={{ display: "block", fontFamily: "'JetBrains Mono','SFMono-Regular',monospace", fontSize: "12px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pd-ink-muted)" }}>Личный кабинет</span><h1 style={{ margin: "12px 0 0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "28px", lineHeight: "1.24", fontWeight: "500", letterSpacing: "-.015em", color: "var(--pd-ink)" }}>Раздел готовится</h1><p style={{ margin: "20px 0 0", fontSize: "16px", lineHeight: "1.6", color: "var(--pd-ink-secondary)" }}>В кабинете будут видны состояние заявки, этапы работы и акты приёмки. Пока его нет, о ходе работы сообщает менеджер проекта.</p><p style={{ margin: "16px 0 0", fontSize: "16px", lineHeight: "1.6", color: "var(--pd-ink-secondary)" }}>Оставить заявку и задать вопрос можно уже сейчас.</p><div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "28px" }}><a className="x2 x3" href="/" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", background: "var(--pd-ink)", color: "var(--pd-ink-inverse)", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "15px", fontWeight: "600", padding: "0 26px", borderRadius: "999px", transition: "background 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>На главную</a><a className="x4 x3" href="https://t.me/prodisser" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", background: "transparent", border: "1px solid var(--pd-border)", color: "var(--pd-ink)", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "15px", fontWeight: "600", padding: "0 22px", borderRadius: "999px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>Написать в телеграм</a></div></div></main><footer className="doc-foot doc-pad" style={{ maxWidth: "1220px", margin: "32px auto 0", padding: "0 30px 40px" }}><div style={{ borderTop: "1px solid var(--pd-border)", paddingTop: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "24px", flexWrap: "wrap" }}><div style={{ display: "flex", flexDirection: "column", gap: "6px", maxWidth: "60ch", fontSize: "14px", lineHeight: "1.6", color: "var(--pd-ink-muted)" }}><span style={{ color: "var(--pd-ink)" }}>ООО «РУСДРОН» · коммерческое обозначение ProDisser</span><span style={{ fontFamily: "'JetBrains Mono','SFMono-Regular',monospace", fontSize: "13px", lineHeight: "1.5", letterSpacing: ".02em" }}>ОГРН 1257700248860 · ИНН 9723254250 · КПП 772301001</span><span style={{ fontFamily: "'JetBrains Mono','SFMono-Regular',monospace", fontSize: "13px", lineHeight: "1.5", letterSpacing: ".02em" }}>109451, г. Москва, вн. тер. г. муниципальный округ Марьино, б-р Перервинский, д. 27, к. 1, помещ. 10н</span></div><div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "14px", lineHeight: "1.4" }}><a className="x5" href="/offer" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", color: "var(--pd-ink-secondary)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>Публичная оферта</a><a className="x5" href="/privacy" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", color: "var(--pd-ink-secondary)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>Политика обработки персональных данных</a><a className="x5" href="/" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", color: "var(--pd-ink-secondary)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>На главную</a></div></div></footer></div>
      </>
    );
  }
}

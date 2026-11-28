// @ts-nocheck — логика перенесена из макета дословно и правится только в макете.
'use client';
// Сгенерировано из ContactsPage.dc.html через tools/dc-to-tsx.mjs.
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
@media (max-width:768px){.doc-layout{grid-template-columns:minmax(0,1fr)}.doc-toc{position:static}.doc-toc-btn{display:flex}.doc-toc[data-toc="closed"] .doc-toc-list{display:none}}
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
 /* Контакты (Р-1015): плитки связи — четыре в ряд, на планшете по две, на телефоне столбцом; реквизиты — перечнем «название — значение». */
.ct-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.ct-dl{display:grid;grid-template-columns:minmax(0,220px) minmax(0,1fr);gap:10px 24px}
@media (max-width:1024px){.ct-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:560px){.ct-grid{grid-template-columns:minmax(0,1fr)}.ct-dl{grid-template-columns:minmax(0,1fr);gap:2px 0}.ct-dl dd{margin-bottom:12px!important}}
@media print{.ct-card{border:0!important;padding:0!important}}
.x1:hover{background:rgba(180,201,229,.34) !important}
.x2:hover{border-color:var(--pd-ink) !important}
.x3:active{transform:scale(.97) !important}
.x4:hover{border-color:var(--pd-accent-edge) !important}
.x5:hover{background:var(--pd-button-hover) !important}
.x6:hover{color:var(--pd-accent) !important}
`;

class ContactsPageView extends React.Component<any, any> {
/* Страница контактов (решение Р-1015). Телефон, почта и часы работы — те же,
 что в подвалах и формах содержательных страниц; реквизиты общества — те же,
 что в оферте, политике и согласии. Р-404 снял реквизиты с подвалов пяти
 содержательных страниц и оставил их там, где заключается договор; эта
 страница — отдельная, подвалы не меняются. Адрес назван юридическим и
 почтовым: о приёме посетителей по нему страница не сообщает. */

 componentDidMount(){
 document.documentElement.lang ='ru';
 }
 renderVals(){
 return {};
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

    } = v;
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <div style={{ position: "relative", background: "var(--pd-ink-inverse)", color: "var(--pd-ink)", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", WebkitFontSmoothing: "antialiased" }}><a className="pd-skip" href="#main">Перейти к содержанию</a><header className="doc-head doc-pad" style={{ maxWidth: "1220px", margin: "0 auto", padding: "24px 30px 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "24px", flexWrap: "wrap" }}><a className="x1" href="/" aria-label="ProDisser — на главную" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", padding: "6px 10px", margin: "-6px -10px", borderRadius: "10px", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "27px", lineHeight: "1.24", fontWeight: "600", letterSpacing: ".005em", transition: "background 180ms cubic-bezier(.2,0,.2,1)" }}><span style={{ color: "var(--pd-accent)" }}>PRO</span><span style={{ color: "var(--pd-ink)" }}>DISSER</span></a><a className="pd-cabinet x2 x3" href="/cabinet" style={{ appearance: "none", cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", minHeight: "44px", background: "transparent", border: "1px solid transparent", color: "var(--pd-ink)", fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "15px", fontWeight: "600", padding: "0 22px", borderRadius: "999px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),color 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>Личный кабинет</a></header><div className="doc-pad" role="region" aria-labelledby="doc-title" style={{ maxWidth: "1220px", margin: "0 auto", padding: "40px 30px 0" }}><h1 id="doc-title" style={{ margin: "0", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "28px", lineHeight: "1.24", fontWeight: "500", letterSpacing: "-.015em", color: "var(--pd-ink)", maxWidth: "26ch" }}>Контакты ProDisser</h1><p style={{ margin: "14px 0 0", fontSize: "16px", lineHeight: "1.6", color: "var(--pd-ink-secondary)", maxWidth: "64ch" }}>Менеджер проекта отвечает на заявки, звонки и письма в рабочее время: Пн⁠—⁠Пт 10:00⁠—⁠19:00. Работаем с авторами и компаниями по всей России, ход работы виден в личном кабинете.</p></div><main className="doc-pad" id="main" style={{ maxWidth: "1220px", margin: "32px auto 0", padding: "0 30px" }}><section aria-labelledby="ct-reach" style={{ paddingBottom: "40px" }}><h2 id="ct-reach" style={{ margin: "0 0 16px", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "22px", lineHeight: "1.4", fontWeight: "600", letterSpacing: "-.01em", color: "var(--pd-ink)" }}>Телефон, почта и мессенджеры</h2><div className="ct-grid"><a className="ct-card x4" href="tel:+74954564323" style={{ display: "flex", flexDirection: "column", gap: "6px", boxSizing: "border-box", minHeight: "44px", padding: "18px 20px", border: "1px solid var(--pd-border)", borderRadius: "14px", background: "var(--pd-ink-inverse)", color: "var(--pd-ink)", transition: "border-color 180ms cubic-bezier(.2,0,.2,1)" }}><span style={{ fontSize: "13px", lineHeight: "1.5", color: "var(--pd-ink-muted)" }}>Телефон</span><span style={{ fontSize: "16px", lineHeight: "1.5", fontWeight: "600", color: "var(--pd-ink)", overflowWrap: "anywhere" }}>+7 495 456 43 23</span><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-secondary)" }}>Пн⁠—⁠Пт 10:00⁠—⁠19:00</span></a><a className="ct-card x4" href="mailto:info.prodisser@gmail.com" style={{ display: "flex", flexDirection: "column", gap: "6px", boxSizing: "border-box", minHeight: "44px", padding: "18px 20px", border: "1px solid var(--pd-border)", borderRadius: "14px", background: "var(--pd-ink-inverse)", color: "var(--pd-ink)", transition: "border-color 180ms cubic-bezier(.2,0,.2,1)" }}><span style={{ fontSize: "13px", lineHeight: "1.5", color: "var(--pd-ink-muted)" }}>Электронная почта</span><span style={{ fontSize: "16px", lineHeight: "1.5", fontWeight: "600", color: "var(--pd-ink)", overflowWrap: "anywhere" }}>info.prodisser@gmail.com</span><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-secondary)" }}>Ответим в рабочее время</span></a><a className="ct-card x4" href="https://t.me/prodisser" target="_blank" rel="noopener noreferrer" style={{ display: "flex", flexDirection: "column", gap: "6px", boxSizing: "border-box", minHeight: "44px", padding: "18px 20px", border: "1px solid var(--pd-border)", borderRadius: "14px", background: "var(--pd-ink-inverse)", color: "var(--pd-ink)", transition: "border-color 180ms cubic-bezier(.2,0,.2,1)" }}><span style={{ fontSize: "13px", lineHeight: "1.5", color: "var(--pd-ink-muted)" }}>Telegram</span><span style={{ fontSize: "16px", lineHeight: "1.5", fontWeight: "600", color: "var(--pd-ink)", overflowWrap: "anywhere" }}>t.me/prodisser</span><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-secondary)" }}>Пишите — отвечаем в рабочее время</span></a><a className="ct-card x4" href="https://vk.ru/cmnrut" target="_blank" rel="noopener noreferrer" style={{ display: "flex", flexDirection: "column", gap: "6px", boxSizing: "border-box", minHeight: "44px", padding: "18px 20px", border: "1px solid var(--pd-border)", borderRadius: "14px", background: "var(--pd-ink-inverse)", color: "var(--pd-ink)", transition: "border-color 180ms cubic-bezier(.2,0,.2,1)" }}><span style={{ fontSize: "13px", lineHeight: "1.5", color: "var(--pd-ink-muted)" }}>ВКонтакте</span><span style={{ fontSize: "16px", lineHeight: "1.5", fontWeight: "600", color: "var(--pd-ink)", overflowWrap: "anywhere" }}>vk.ru/cmnrut</span><span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--pd-ink-secondary)" }}>Сообщество ProDisser</span></a></div></section><section aria-labelledby="ct-request" style={{ paddingBottom: "40px", maxWidth: "72ch" }}><h2 id="ct-request" style={{ margin: "0 0 16px", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "22px", lineHeight: "1.4", fontWeight: "600", letterSpacing: "-.01em", color: "var(--pd-ink)" }}>Заявка на первичную консультацию</h2><p style={{ margin: "0 0 12px", fontSize: "16px", lineHeight: "1.6", color: "var(--pd-ink)" }}>Консультация не оплачивается: назовём объём работ, сроки и порядок сметы до согласования Задания. Заявку принимает форма на главной странице.</p><a className="x5 x3" href="/#request" style={{ appearance: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: "48px", boxSizing: "border-box", padding: "0 26px", borderRadius: "999px", background: "var(--pd-ink)", color: "var(--pd-ink-inverse)", fontSize: "15px", lineHeight: "1.2", fontWeight: "600", transition: "background 180ms cubic-bezier(.2,0,.2,1),transform 180ms cubic-bezier(.2,0,.2,1)" }}>Оставить заявку</a></section><section id="details" aria-labelledby="ct-details" style={{ scrollMarginTop: "24px", paddingBottom: "40px", maxWidth: "72ch" }}><h2 id="ct-details" style={{ margin: "0 0 16px", fontFamily: "'Literata',Georgia,'Times New Roman',serif", fontSize: "22px", lineHeight: "1.4", fontWeight: "600", letterSpacing: "-.01em", color: "var(--pd-ink)" }}>Реквизиты исполнителя</h2><p style={{ margin: "0 0 12px", fontSize: "16px", lineHeight: "1.6", color: "var(--pd-ink)" }}>Договор заключается с обществом по публичной оферте. ProDisser — коммерческое обозначение.</p><dl className="ct-dl" style={{ margin: "0" }}><dt style={{ margin: "0", fontSize: "13px", lineHeight: "1.5", color: "var(--pd-ink-muted)" }}>Наименование</dt><dd style={{ margin: "0", fontSize: "16px", lineHeight: "1.6", color: "var(--pd-ink)", overflowWrap: "anywhere" }}>Общество с ограниченной ответственностью «РУСДРОН»</dd><dt style={{ margin: "0", fontSize: "13px", lineHeight: "1.5", color: "var(--pd-ink-muted)" }}>ОГРН</dt><dd style={{ margin: "0", fontSize: "16px", lineHeight: "1.6", color: "var(--pd-ink)", overflowWrap: "anywhere" }}>1257700248860</dd><dt style={{ margin: "0", fontSize: "13px", lineHeight: "1.5", color: "var(--pd-ink-muted)" }}>ИНН</dt><dd style={{ margin: "0", fontSize: "16px", lineHeight: "1.6", color: "var(--pd-ink)", overflowWrap: "anywhere" }}>9723254250</dd><dt style={{ margin: "0", fontSize: "13px", lineHeight: "1.5", color: "var(--pd-ink-muted)" }}>КПП</dt><dd style={{ margin: "0", fontSize: "16px", lineHeight: "1.6", color: "var(--pd-ink)", overflowWrap: "anywhere" }}>772301001</dd><dt style={{ margin: "0", fontSize: "13px", lineHeight: "1.5", color: "var(--pd-ink-muted)" }}>Юридический и почтовый адрес</dt><dd style={{ margin: "0", fontSize: "16px", lineHeight: "1.6", color: "var(--pd-ink)", overflowWrap: "anywhere" }}>109451, г. Москва, вн. тер. г. муниципальный округ Марьино, б-р Перервинский, д. 27, к. 1, помещ. 10н</dd></dl></section></main><footer className="doc-foot doc-pad" style={{ maxWidth: "1220px", margin: "32px auto 0", padding: "0 30px 40px" }}><div style={{ borderTop: "1px solid var(--pd-border)", paddingTop: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "24px", flexWrap: "wrap" }}><div style={{ display: "flex", flexDirection: "column", gap: "6px", maxWidth: "60ch", fontSize: "14px", lineHeight: "1.6", color: "var(--pd-ink-muted)" }}><span style={{ color: "var(--pd-ink)" }}>ООО «РУСДРОН» · коммерческое обозначение ProDisser</span><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.5", letterSpacing: ".02em" }}>ОГРН 1257700248860 · ИНН 9723254250 · КПП 772301001</span><span style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", fontSize: "13px", lineHeight: "1.5", letterSpacing: ".02em" }}>109451, г. Москва, вн. тер. г. муниципальный округ Марьино, б-р Перервинский, д. 27, к. 1, помещ. 10н</span></div><div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "14px", lineHeight: "1.4" }}><a className="x6" href="/offer" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", color: "var(--pd-ink-secondary)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>Публичная оферта</a><a className="x6" href="/privacy" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", color: "var(--pd-ink-secondary)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>Политика обработки персональных данных</a><a className="x6" href="/consent" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", color: "var(--pd-ink-secondary)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>Согласие на обработку персональных данных</a><a className="x6" href="/" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", color: "var(--pd-ink-secondary)", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>На главную</a></div></div></footer></div>
      </>
    );
  }
}

/** Страница ожила: обработчики подключены, кнопки отправки включаются (Р-508). */
export default class ContactsPage extends ContactsPageView {
  componentDidMount() {
    super.componentDidMount?.();
    this.setState({ __live: true });
  }
}

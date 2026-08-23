// @ts-nocheck — логика перенесена из макета дословно и правится только в макете.
'use client';
// Сгенерировано из ConsentPage.dc.html через tools/dc-to-tsx.mjs.
// Правки вносятся в макет и переносятся заново, а не здесь.
import React from 'react';
import { submitLead } from '../../lib/submit-lead';
import PhotoSlot from '../PhotoSlot';
import { ABOVE_THE_FOLD } from '../photos';

const css = `
body{margin:0;background:#FFFFFF}a{color:#7B2BE0;text-decoration:none}a:hover{color:#5E17B8}*:focus-visible{outline:2px solid #7B2BE0;outline-offset:2px}.pd-skip{position:absolute;left:-9999px;top:0;z-index:9;background:#16121C;color:#FFFFFF;padding:12px 20px;border-radius:0 0 10px 0;font-size:14px;font-weight:600}.pd-skip:focus{left:0;color:#FFFFFF}.doc-layout{display:grid;grid-template-columns:minmax(0,260px) minmax(0,1fr);gap:48px;align-items:start}.doc-toc{position:sticky;top:24px}.doc-toc-btn{display:none}.doc-toc-list{display:flex;flex-direction:column}.doc-toc-list[hidden]{display:none}
@media (max-width:1024px){.doc-layout{grid-template-columns:minmax(0,220px) minmax(0,1fr);gap:32px}}
@media (max-width:768px){.doc-layout{grid-template-columns:minmax(0,1fr)}.doc-toc{position:static}.doc-toc-btn{display:flex}}
@media (max-width:480px){.doc-pad{padding-left:20px!important;padding-right:20px!important}}
@media print{.doc-toc-list[hidden]{display:flex!important}.doc-toc,.doc-head,.doc-foot,.pd-skip{display:none!important}.doc-layout{grid-template-columns:minmax(0,1fr)!important;gap:0!important}body{background:#FFFFFF}main{max-width:none!important;padding:0!important}h1{font-size:20pt}h2{font-size:13pt;page-break-after:avoid}p,li{font-size:11pt;line-height:1.5}.doc-print{display:block!important}}.doc-print{display:none}
/* Отправка идёт — кнопка это показывает. Инлайновый фон сильнее класса,
   поэтому приглушение объявлено важным. */
button[disabled]{opacity:.55!important;cursor:progress!important}
/* Подтверждение и ошибка появляются плавно, а не возникают рывком.
   Правило срабатывает при вставке элемента, поэтому блоки, которые уже
   на странице, ничего не переигрывают при обновлении содержимого. */
@keyframes pd-appear{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
[role="status"],[role="alert"]{animation:pd-appear 220ms cubic-bezier(.2,0,.2,1)}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
.x1:hover{background:rgba(198,202,246,.3) !important}
.x2:hover{border-color:#DDC4FA !important}
.x3:active{opacity:.82 !important}
.x4:hover{color:#16121C !important;border-left-color:#7B2BE0 !important}
.x5:hover{color:#7B2BE0 !important}
`;

export default class ConsentPage extends React.Component<any, any> {
/* НОРМАТИВНАЯ БАЗА. Проверено 10 августа 2026.
 ПОДТВЕРЖДЕНО поиском в этой сессии: с 01.09.2025 согласие на обработку персональных
 данных оформляется отдельным документом, а не пунктом пользовательского соглашения
 (обзоры изменений 152-ФЗ: stakhanovets.ru 30.01.2026, klerk.ru 26.12.2025).
 Поэтому согласие вынесено на отдельную страницу и не включено в оферту.
 НЕ ПРОВЕРЯЛОСЬ ПОСТАТЕЙНО и дано словами либо с маркером:
 статья 152-ФЗ о требованиях к содержанию согласия и перечню обязательных сведений;
 норма Закона о рекламе о предварительном согласии на рекламу по сетям связи;
 подзаконные акты Роскомнадзора о форме согласия.
 Перечень персональных данных сверен с фактическими полями форм пяти страниц сайта
 на 10.08.2026: имя, контакт, организация, тема работы, специальность, тип работы,
 срок сдачи или дата защиты, описание разработки, дедлайн конкурса. */

 state = { toc: true };
 componentDidMount(){
 document.documentElement.lang ='ru';
 const narrow = window.matchMedia('(max-width:768px)');
 this.onMq = e => this.setState({ toc: !e.matches });
 this.setState({ toc: !narrow.matches });
 narrow.addEventListener('change', this.onMq);
 }
 componentWillUnmount(){
 window.matchMedia('(max-width:768px)').removeEventListener('change', this.onMq);
 }
 renderVals(){
 const S = [
 ['operator','Кому даётся согласие', ['Согласие даётся Обществу с ограниченной ответственностью «РУСДРОН» — оператору персональных данных.','ОГРН 1257700248860, ИНН 9723254250, КПП 772301001.','Адрес: 109451, г. Москва, вн. тер. г. муниципальный округ Марьино, б-р Перервинский, д. 27, к. 1, помещ. 10н.','ProDisser является коммерческим обозначением оператора.'
 ]],
 ['subject','Кем даётся согласие', ['Согласие даётся физическим лицом, заполнившим форму на Сайте и проставившим отметку о согласии.','Субъект идентифицируется по сведениям, самостоятельно указанным им в форме: имени и адресу электронной почты либо номеру телефона.','Проставляя отметку, субъект подтверждает, что действует своей волей и в своём интересе, а указанные им данные являются достоверными.','Если субъект указывает данные представляемой организации, он подтверждает наличие полномочий на их передачу.'
 ]],
 ['purpose','Цель обработки', ['Обработка осуществляется для рассмотрения заявки субъекта, проведения первичной консультации и оценки объёма работ по его задаче.','В случае заключения договора обработка осуществляется также для его заключения и исполнения, проведения расчётов и оформления документов о приёмке.','Обработка для целей, не указанных в настоящем разделе, на основании настоящего согласия не осуществляется.'
 ]],
 ['data','Перечень персональных данных', ['Фамилия, имя, отчество либо имя, указанное субъектом при заполнении формы.','Адрес электронной почты либо номер телефона — по выбору субъекта.','Наименование организации и должность субъекта, если форма предусматривает их указание.','Сведения о задаче: тема работы, специальность, тип работы, срок сдачи или дата защиты, описание разработки, срок подачи на конкурс, содержание сообщения.','Сведения, содержащиеся в материалах, направленных субъектом оператору по его собственной инициативе.','Перечень является закрытым. Обработка персональных данных, не указанных в настоящем разделе, на основании настоящего согласия не осуществляется.'
 ]],
 ['actions','Перечень действий и способы обработки', ['Субъект даёт согласие на совершение следующих действий: сбор, запись, систематизация, накопление, хранение, уточнение, извлечение, использование, передача лицам, указанным в разделе 6, блокирование, удаление, уничтожение.','Обработка осуществляется с использованием средств автоматизации и без их использования.','Распространение персональных данных неопределённому кругу лиц не осуществляется.','Решения, порождающие юридические последствия в отношении субъекта, на основании исключительно автоматизированной обработки не принимаются.'
 ]],
 ['processors','Лица, осуществляющие обработку по поручению оператора', ['Оператор поручает обработку персональных данных на основании договора, содержащего обязанность соблюдать конфиденциальность.','Провайдер хостинга привлекается на основании договора оказания услуг хостинга.','Сервис электронной почты привлекается на основании договора оказания услуг связи.','Организация, оказывающая бухгалтерские услуги, привлекается на основании договора.','Платёжный сервис привлекается на основании договора оказания платёжных услуг.','Перечень лиц, осуществляющих обработку по поручению оператора, приведён в разделе 8 Политики обработки персональных данных и поддерживается в актуальном состоянии.'
 ]],
 ['revoke','Срок действия согласия и порядок отзыва', ['Согласие действует до достижения цели обработки либо до его отзыва субъектом.','Отзыв согласия направляется по адресу электронной почты info.prodisser@gmail.com либо по почтовому адресу оператора.','Отзыв должен содержать фамилию, имя, отчество субъекта и сведения, позволяющие установить факт обработки его данных оператором.','Обработка прекращается в срок, установленный законодательством, со дня получения отзыва.','После прекращения обработки персональные данные уничтожаются или обезличиваются, если отсутствует иное правовое основание для их обработки.','Данные, необходимые для исполнения заключённого договора и для целей бухгалтерского и налогового учёта, продолжают обрабатываться на соответствующем правовом основании в течение установленных законодательством сроков.'
 ]],
 ['form','Способ выражения согласия', ['Согласие выражается проставлением отметки в поле «Даю согласие на обработку персональных данных» в форме на Сайте.','Отметка не является предзаполненной. Согласие считается данным только при самостоятельном действии субъекта.','Отправка формы без проставления отметки невозможна.','Оператор фиксирует дату и время проставления отметки и редакцию настоящего согласия, действовавшую в этот момент.'
 ]]
 ];
 const sections = S.map(([id, title, items], i) => ({
 id, title, num: String(i + 1) +'.',
 items: items.map((text, j) => ({ text, num: (i + 1) +'.' + (j + 1) }))
 }));
 const adsItems = ['Настоящее согласие даётся отдельной отметкой в поле «Согласен получать информационные и рекламные сообщения» и не является условием рассмотрения заявки.','Цель обработки: направление сообщений об услугах оператора, изменениях условий работы и материалах, подготовленных оператором.','Перечень данных: имя, адрес электронной почты, номер телефона.','Способы направления сообщений: электронная почта, телефонные сообщения, мессенджеры.','Согласие отзывается независимо от согласия на обработку персональных данных: по ссылке отказа в сообщении либо по адресу info.prodisser@gmail.com. Отзыв не влияет на рассмотрение заявки и на исполнение договора.','Направление рекламных сообщений по сетям электросвязи допускается только при наличии предварительного согласия субъекта.'
 ];
 return {
 sections,
 ads: adsItems.map((text, j) => ({ text, num:'9.' + (j + 1) })),
 toc: sections.map(s => ({ href:'#' + s.id, num: s.num, title: s.title })).concat([
 { href:'#ads', num:'9.', title:'Согласие на рекламные сообщения' },
 { href:'#version', num:'10.', title:'Дата редакции и версия' }
 ]),
 tocHidden: this.state.toc ? undefined: true,
 tocExpanded: this.state.toc ?'true':'false',
 tocMark: this.state.toc ?'—':'+',
 toggleToc: () => this.setState(s => ({ toc: !s.toc }))
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
      ads,
      sections,
      toc,
      tocExpanded,
      tocHidden,
      tocMark,
      toggleToc,
    } = v;
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <div style={{ position: "relative", background: "#FFFFFF", color: "#16121C", fontFamily: "'Onest','Helvetica Neue',Arial,sans-serif", WebkitFontSmoothing: "antialiased" }}><a className="pd-skip" href="#main">Перейти к тексту документа</a><header className="doc-head doc-pad" style={{ maxWidth: "1220px", margin: "0 auto", padding: "24px 30px 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "24px", flexWrap: "wrap" }}><a className="x1" href="/" aria-label="ProDisser — на главную" style={{ display: "inline-flex", alignItems: "center", padding: "6px 10px", margin: "-6px -10px", borderRadius: "10px", fontSize: "28px", lineHeight: "1.24", fontWeight: "700", letterSpacing: "-.012em", transition: "background 180ms cubic-bezier(.2,0,.2,1)" }}><span style={{ color: "#7B2BE0" }}>PRO</span><span style={{ color: "#16121C" }}>DISSER</span></a><span style={{ fontFamily: "'JetBrains Mono','SFMono-Regular',monospace", fontSize: "11px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "#6B6178" }}>Проект документа</span></header><div className="doc-pad" role="region" aria-labelledby="doc-title" style={{ maxWidth: "1220px", margin: "0 auto", padding: "40px 30px 0" }}><h1 id="doc-title" style={{ margin: "0", fontFamily: "'Onest',Arial,sans-serif", fontSize: "28px", lineHeight: "1.24", fontWeight: "500", letterSpacing: "-.015em", color: "#16121C", maxWidth: "26ch" }}>Согласие на обработку персональных данных</h1><p className="doc-print" style={{ margin: "8px 0 0", fontSize: "13px", lineHeight: "1.5", color: "#16121C" }}>Оператор: ООО «РУСДРОН», ОГРН 1257700248860, ИНН 9723254250. Коммерческое обозначение — ProDisser.</p></div><div className="doc-layout doc-pad" style={{ maxWidth: "1220px", margin: "32px auto 0", padding: "0 30px" }}><nav className="doc-toc" aria-label="Оглавление документа"><button className="doc-toc-btn x2 x3" type="button" onClick={toggleToc} aria-expanded={tocExpanded} aria-controls="toc-list" style={{ appearance: "none", cursor: "pointer", width: "100%", alignItems: "center", justifyContent: "space-between", gap: "16px", border: "1px solid #EAE3F2", background: "#FFFFFF", borderRadius: "10px", padding: "14px 18px", fontFamily: "'Onest',Arial,sans-serif", fontSize: "14px", fontWeight: "600", color: "#16121C", marginBottom: "12px", transition: "border-color 180ms cubic-bezier(.2,0,.2,1),opacity 180ms cubic-bezier(.2,0,.2,1)" }}>Оглавление<span aria-hidden="true" style={{ fontFamily: "'JetBrains Mono','SFMono-Regular',monospace", fontSize: "11px", color: "#7B2BE0" }}>{tocMark}</span></button><ol className="doc-toc-list" id="toc-list" hidden={tocHidden} style={{ margin: "0", padding: "0", listStyle: "none", gap: "2px", borderLeft: "1px solid #EAE3F2" }}>{(toc ?? []).map((t: any, _i0: number) => (<React.Fragment key={_i0}><li><a className="x4" href={t.href} style={{ display: "flex", gap: "10px", padding: "7px 14px", fontSize: "14px", lineHeight: "1.4", color: "#4A4157", borderLeft: "2px solid transparent", marginLeft: "-1px", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}><span style={{ fontFamily: "'JetBrains Mono','SFMono-Regular',monospace", fontSize: "11px", color: "#6B6178", paddingTop: "2px", flex: "0 0 auto" }}>{t.num}</span><span>{t.title}</span></a></li></React.Fragment>))}</ol></nav><main id="main" style={{ minWidth: "0", maxWidth: "72ch" }}><p style={{ margin: "0 0 28px", fontSize: "15px", lineHeight: "1.6", color: "#4A4157" }}>Настоящий текст является формой согласия, которую субъект персональных данных принимает проставлением отметки в форме на Сайте. Согласие на обработку персональных данных и согласие на получение рекламных сообщений даются отдельно и отзываются независимо друг от друга.</p>{(sections ?? []).map((s: any, _i0: number) => (<React.Fragment key={_i0}><section id={s.id} style={{ scrollMarginTop: "24px", paddingBottom: "32px" }}><h2 style={{ margin: "0 0 14px", fontFamily: "'Onest',Arial,sans-serif", fontSize: "19px", lineHeight: "1.4", fontWeight: "600", letterSpacing: "-.01em", color: "#16121C", display: "flex", gap: "12px" }}><span style={{ fontFamily: "'JetBrains Mono','SFMono-Regular',monospace", fontSize: "14px", color: "#7B2BE0", flex: "0 0 auto", paddingTop: "2px" }}>{s.num}</span><span>{s.title}</span></h2>{(s.items ?? []).map((p: any, _i1: number) => (<React.Fragment key={_i1}><p style={{ margin: "0 0 10px", display: "flex", gap: "12px", fontSize: "15px", lineHeight: "1.6", color: "#16121C" }}><span style={{ fontFamily: "'JetBrains Mono','SFMono-Regular',monospace", fontSize: "13px", color: "#6B6178", flex: "0 0 auto", paddingTop: "2px", fontVariantNumeric: "tabular-nums" }}>{p.num}</span><span>{p.text}</span></p></React.Fragment>))}</section></React.Fragment>))}<section id="ads" style={{ scrollMarginTop: "24px", border: "1px solid #DDC4FA", borderRadius: "14px", padding: "24px 26px", background: "#F8F5FC", marginBottom: "32px" }}><span style={{ display: "block", fontFamily: "'JetBrains Mono','SFMono-Regular',monospace", fontSize: "11px", lineHeight: "1.4", letterSpacing: ".06em", textTransform: "uppercase", color: "#7B2BE0", marginBottom: "12px" }}>Отдельное согласие · даётся отдельной отметкой</span><h2 style={{ margin: "0 0 14px", fontFamily: "'Onest',Arial,sans-serif", fontSize: "19px", lineHeight: "1.4", fontWeight: "600", letterSpacing: "-.01em", color: "#16121C", display: "flex", gap: "12px" }}><span style={{ fontFamily: "'JetBrains Mono','SFMono-Regular',monospace", fontSize: "14px", color: "#7B2BE0", flex: "0 0 auto", paddingTop: "2px" }}>9.</span><span>Согласие на получение рекламных и информационных сообщений</span></h2>{(ads ?? []).map((p: any, _i0: number) => (<React.Fragment key={_i0}><p style={{ margin: "0 0 10px", display: "flex", gap: "12px", fontSize: "15px", lineHeight: "1.6", color: "#16121C" }}><span style={{ fontFamily: "'JetBrains Mono','SFMono-Regular',monospace", fontSize: "13px", color: "#6B6178", flex: "0 0 auto", paddingTop: "2px", fontVariantNumeric: "tabular-nums" }}>{p.num}</span><span>{p.text}</span></p></React.Fragment>))}</section><section id="version" style={{ scrollMarginTop: "24px", paddingBottom: "32px" }}><h2 style={{ margin: "0 0 14px", fontFamily: "'Onest',Arial,sans-serif", fontSize: "19px", lineHeight: "1.4", fontWeight: "600", letterSpacing: "-.01em", color: "#16121C", display: "flex", gap: "12px" }}><span style={{ fontFamily: "'JetBrains Mono','SFMono-Regular',monospace", fontSize: "14px", color: "#7B2BE0", flex: "0 0 auto", paddingTop: "2px" }}>10.</span><span>Дата редакции и версия</span></h2><p style={{ margin: "0 0 10px", display: "flex", gap: "12px", fontSize: "15px", lineHeight: "1.6", color: "#16121C" }}><span style={{ fontFamily: "'JetBrains Mono','SFMono-Regular',monospace", fontSize: "13px", color: "#6B6178", flex: "0 0 auto", paddingTop: "2px" }}>10.1</span><span>Редакция от 21 августа 2026 года, версия 1.0. Действует с даты размещения на Сайте.</span></p><p style={{ margin: "0 0 10px", display: "flex", gap: "12px", fontSize: "15px", lineHeight: "1.6", color: "#16121C" }}><span style={{ fontFamily: "'JetBrains Mono','SFMono-Regular',monospace", fontSize: "13px", color: "#6B6178", flex: "0 0 auto", paddingTop: "2px" }}>10.2</span><span>Оператор сохраняет сведения о редакции согласия, действовавшей на момент его предоставления субъектом.</span></p></section></main></div><footer className="doc-foot doc-pad" style={{ maxWidth: "1220px", margin: "32px auto 0", padding: "0 30px 40px" }}><div style={{ borderTop: "1px solid #EAE3F2", paddingTop: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "24px", flexWrap: "wrap" }}><div style={{ display: "flex", flexDirection: "column", gap: "6px", maxWidth: "60ch", fontSize: "13px", lineHeight: "1.6", color: "#6B6178" }}><span style={{ color: "#16121C" }}>ООО «РУСДРОН» · коммерческое обозначение ProDisser</span><span style={{ fontFamily: "'JetBrains Mono','SFMono-Regular',monospace", fontSize: "11px", lineHeight: "1.5", letterSpacing: ".02em" }}>ОГРН 1257700248860 · ИНН 9723254250 · КПП 772301001</span><span style={{ fontFamily: "'JetBrains Mono','SFMono-Regular',monospace", fontSize: "11px", lineHeight: "1.5", letterSpacing: ".02em" }}>109451, г. Москва, вн. тер. г. муниципальный округ Марьино, б-р Перервинский, д. 27, к. 1, помещ. 10н</span></div><div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "14px", lineHeight: "1.4" }}><a className="x5" href="/offer" style={{ display: "inline-flex", alignItems: "center", minHeight: "36px", color: "#4A4157", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>Публичная оферта</a><a className="x5" href="/privacy" style={{ display: "inline-flex", alignItems: "center", minHeight: "36px", color: "#4A4157", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>Политика обработки персональных данных</a><a className="x5" href="/" style={{ display: "inline-flex", alignItems: "center", minHeight: "36px", color: "#4A4157", transition: "color 180ms cubic-bezier(.2,0,.2,1)" }}>На главную</a></div></div></footer></div>
      </>
    );
  }
}

/**
 * Перенос макета Design Component (.dc.html) в React-компонент (.tsx).
 *
 * Формат макета и React совпадают почти один в один: логика уже написана как
 * класс с state, setState и жизненным циклом — DCLogic это React.Component без
 * render. Переносится дословно. Конвертируется только шаблон:
 *
 *   {{ path }}                    -> {path}
 *   <sc-for list="{{xs}}" as="x"> -> {xs.map((x, i) => ( … ))}
 *   <sc-if value="{{c}}">         -> {c ? ( … ) : null}
 *   style="a:b;c:d"               -> style={{a:'b', c:'d'}}
 *   style-hover / -focus / -active-> класс в общей таблице стилей
 *   class / for / onClick=…       -> className / htmlFor / onClick={…}
 *   ./main.html                   -> /main
 *
 * Скрипт намеренно не пытается быть универсальным парсером HTML: макеты
 * машинно сгенерированы и однородны, поэтому разбор построен на их правилах.
 * Всё, что скрипт не смог разобрать, он выводит списком — эти места
 * дорабатываются руками, молча пропускать нельзя.
 */

import fs from 'node:fs';
import path from 'node:path';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);

// Адреса: макеты ссылаются на файлы сборки, приложение — на маршруты
const ROUTES = {
  './index.html': '/', './main.html': '/main', './students.html': '/students',
  './business.html': '/business', './offer.html': '/offer',
  './privacy.html': '/privacy', './consent.html': '/consent',
};

const ATTR_MAP = { class: 'className', for: 'htmlFor', autocomplete: 'autoComplete',
  colspan: 'colSpan', rowspan: 'rowSpan', tabindex: 'tabIndex', maxlength: 'maxLength',
  minlength: 'minLength', readonly: 'readOnly', novalidate: 'noValidate',
  'stroke-width': 'strokeWidth', 'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin', 'stroke-dasharray': 'strokeDasharray',
  'stroke-dashoffset': 'strokeDashoffset', 'fill-rule': 'fillRule',
  'clip-rule': 'clipRule', 'clip-path': 'clipPath', 'text-anchor': 'textAnchor',
  'font-family': 'fontFamily', 'font-size': 'fontSize', 'font-weight': 'fontWeight',
  'letter-spacing': 'letterSpacing', 'stop-color': 'stopColor',
  'stop-opacity': 'stopOpacity', 'gradientUnits': 'gradientUnits',
  'xlink:href': 'xlinkHref', 'xmlns:xlink': 'xmlnsXlink',
  'viewbox': 'viewBox', 'preserveaspectratio': 'preserveAspectRatio',
  'shape-rendering': 'shapeRendering', 'vector-effect': 'vectorEffect',
  'dominant-baseline': 'dominantBaseline', 'paint-order': 'paintOrder',
  'accent-color': 'accentColor',
};

const problems = [];

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/** "a:b;c:d" -> объект стилей для React */
function styleToObject(css) {
  const out = [];
  let depth = 0, buf = '';
  for (const ch of css) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ';' && depth === 0) { out.push(buf); buf = ''; }
    else buf += ch;
  }
  if (buf.trim()) out.push(buf);

  const pairs = [];
  for (const decl of out) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    const value = decl.slice(i + 1).trim();
    if (!prop) continue;
    const key = prop.startsWith('--') ? `'${prop}'` : camel(prop);
    // значение может содержать {{ hole }} — тогда собираем шаблонную строку
    pairs.push(`${key}: ${valueExpr(value)}`);
  }
  return `{ ${pairs.join(', ')} }`;
}

/** Значение с возможными {{ дырами }} -> JS-выражение */
function valueExpr(raw) {
  const holes = [...raw.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)];
  if (holes.length === 0) return JSON.stringify(raw);
  if (holes.length === 1 && holes[0][0] === raw.trim()) return holeExpr(holes[0][1]);
  // Обратная кавычка и ${ в тексте макета закрыли бы шаблонную строку
  // раньше времени: экранируем оба до подстановки дыр.
  const tpl = raw
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
    .replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, h) => '${' + holeExpr(h) + '}');
  return '`' + tpl + '`';
}

// Переменные циклов в текущей области видимости и собранные корни подстановок.
// Имена индексов уникальны по глубине: в макетах переменная цикла может
// называться i, и совпадение имён ломает сборку.
let loopVars = [];
let idxNames = [];
const usedRoots = new Set();

/** Содержимое {{ }} — путь, литерал или $index */
function holeExpr(h) {
  const t = h.trim();
  if (t === 'true' || t === 'false' || t === 'null') return t;
  if (/^-?\d+(\.\d+)?$/.test(t)) return t;
  if (t === '$index') return idxNames.length ? idxNames[idxNames.length - 1] : '0';
  if (/^'.*'$/.test(t) || /^".*"$/.test(t)) return t;
  const root = t.split(/[.[]/)[0];
  if (root && /^[A-Za-z_$][\w$]*$/.test(root) && !loopVars.includes(root)) usedRoots.add(root);
  return t;
}

/** Разбор списка атрибутов тега */
function parseAttrs(src) {
  const attrs = [];
  const re = /([a-zA-Z_:@][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'))?/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    const value = m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : null);
    attrs.push([name, value]);
  }
  return attrs;
}

let hoverRules = new Map();  // класс -> тело правила
let hoverSeq = 0;

/** style-hover="a:b" -> отдельный класс в таблице стилей */
function interactionClass(kind, css) {
  const key = kind + '|' + css;
  for (const [cls, v] of hoverRules) if (v.key === key) return cls;
  const cls = `x${(++hoverSeq).toString(36)}`;
  hoverRules.set(cls, { key, kind, css });
  return cls;
}

function renderAttrs(attrs, ctx) {
  const out = [];
  const extraClasses = [];
  let className = null;

  for (const [rawName, rawValue] of attrs) {
    const name = rawName.toLowerCase();

    if (name === 'style-hover' || name === 'style-focus' || name === 'style-active') {
      const kind = name.slice(6);   // hover | focus | active
      if (/\{\{/.test(rawValue || '')) {
        problems.push(`${ctx}: ${name} содержит подстановку — перенесено как есть: ${rawValue}`);
        continue;
      }
      extraClasses.push(interactionClass(kind, rawValue || ''));
      continue;
    }
    if (name.startsWith('hint-')) continue;          // подсказки среды прототипирования
    if (name === 'data-dc-tpl') continue;

    if (name === 'style') {
      out.push(`style={${styleToObject(rawValue || '')}}`);
      continue;
    }
    if (name === 'class') { className = rawValue || ''; continue; }

    const reactName = ATTR_MAP[name] || ATTR_MAP[rawName] ||
      (/^(data-|aria-)/.test(name) ? rawName : (rawName.includes('-') ? rawName : rawName));

    if (rawValue === null) { out.push(`${reactName}={true}`); continue; }

    // href на файлы сборки -> маршруты приложения
    let value = rawValue;
    if (name === 'href' && ROUTES[value]) value = ROUTES[value];

    // события: onClick="{{ f }}"
    if (/^on[A-Z]/.test(rawName)) {
      out.push(`${rawName}={${holeExpr(value.replace(/^\{\{|\}\}$/g, ''))}}`);
      continue;
    }

    const holes = [...value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)];
    if (holes.length === 1 && holes[0][0] === value.trim()) {
      out.push(`${reactName}={${holeExpr(holes[0][1])}}`);
    } else if (holes.length) {
      out.push(`${reactName}={${valueExpr(value)}}`);
    } else {
      out.push(`${reactName}=${JSON.stringify(value)}`);
    }
  }

  if (className !== null || extraClasses.length) {
    const parts = [];
    if (className) parts.push(className);
    parts.push(...extraClasses);
    out.unshift(`className=${JSON.stringify(parts.join(' '))}`);
  }
  return out.length ? ' ' + out.join(' ') : '';
}

/** Текст между тегами -> JSX */
function renderText(text) {
  if (!/\S/.test(text)) return text.includes('\n') ? '' : text;
  const holes = [...text.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)];
  if (!holes.length) {
    return text.replace(/[{}]/g, (c) => `{'${c}'}`);
  }
  let out = '', last = 0;
  for (const h of holes) {
    out += text.slice(last, h.index).replace(/[{}]/g, (c) => `{'${c}'}`);
    out += `{${holeExpr(h[1])}}`;
    last = h.index + h[0].length;
  }
  out += text.slice(last).replace(/[{}]/g, (c) => `{'${c}'}`);
  return out;
}

/** Основной проход по шаблону */
function convert(html, ctx) {
  let out = '';
  let i = 0;
  const stack = [];

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) { out += renderText(html.slice(i)); break; }
    out += renderText(html.slice(i, lt));

    // комментарий
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    const gt = findTagEnd(html, lt);
    if (gt < 0) { out += renderText(html.slice(lt)); break; }

    const tagSrc = html.slice(lt + 1, gt).trim();
    const closing = tagSrc.startsWith('/');
    const selfClosing = tagSrc.endsWith('/');
    const body = tagSrc.replace(/^\//, '').replace(/\/$/, '').trim();
    const nameMatch = body.match(/^([a-zA-Z][-a-zA-Z0-9]*)/);
    const tag = nameMatch ? nameMatch[1] : '';
    const attrsSrc = nameMatch ? body.slice(nameMatch[0].length) : '';
    i = gt + 1;

    if (closing) {
      const open = stack.pop();
      if (open === 'sc-for') { loopVars.pop(); idxNames.pop(); out += '</React.Fragment>))}'; }
      else if (open === 'sc-if') out += '</>) : null}';
      else out += `</${open}>`;
      continue;
    }

    if (tag === 'sc-for') {
      const attrs = Object.fromEntries(parseAttrs(attrsSrc));
      const list = holeExpr((attrs.list || '').replace(/^\{\{|\}\}$/g, ''));
      const as = attrs.as || 'item';
      // фрагмент обязателен: тело цикла может начинаться с условия,
      // и тогда JS прочитает его как объект, а не как JSX
      const idx = `_i${idxNames.length}`;
      out += `{(${list} ?? []).map((${as}: any, ${idx}: number) => (<React.Fragment key={${idx}}>`;
      loopVars.push(as);
      idxNames.push(idx);
      stack.push('sc-for');
      continue;
    }
    if (tag === 'sc-if') {
      const attrs = Object.fromEntries(parseAttrs(attrsSrc));
      const cond = holeExpr((attrs.value || '').replace(/^\{\{|\}\}$/g, ''));
      out += `{${cond} ? (<>`;
      stack.push('sc-if');
      continue;
    }
    if (tag === 'image-slot') {
      const a = Object.fromEntries(parseAttrs(attrsSrc));
      const id = a.id || '';
      const style = a.style ? styleToObject(a.style) : '{}';
      const cls = a.class ? ` className=${JSON.stringify(a.class)}` : '';
      const parts = [
        `slotId=${JSON.stringify(id)}`,
        `shape=${JSON.stringify(a.shape === 'circle' ? 'circle' : 'rect')}`,
        `fit=${JSON.stringify(a.fit === 'contain' ? 'contain' : 'cover')}`,
        `alt=${JSON.stringify(a['data-alt'] || a.placeholder || 'Фотография')}`,
        `placeholder=${JSON.stringify(a.placeholder || 'Фото')}`,
        `priority={ABOVE_THE_FOLD.has(${JSON.stringify(id)})}`,
        `style={${style}}`,
      ];
      out += `<PhotoSlot${cls} ${parts.join(' ')} />`;
      const close = s_indexOfClose(html, i);
      i = close;
      continue;
    }
    if (tag === 'dc-import') {
      problems.push(`${ctx}: <dc-import> требует ручного переноса: ${tagSrc.slice(0, 90)}`);
      i = html.indexOf('</dc-import>', i);
      i = i < 0 ? html.length : i + '</dc-import>'.length;
      continue;
    }

    const attrs = parseAttrs(attrsSrc);
    const rendered = renderAttrs(attrs, ctx);

    if (VOID.has(tag) || selfClosing) {
      out += `<${tag}${rendered} />`;
    } else {
      out += `<${tag}${rendered}>`;
      stack.push(tag);
    }
  }

  if (stack.length) problems.push(`${ctx}: незакрытые теги: ${stack.join(', ')}`);
  return out;
}

/** Пропустить закрывающий </image-slot>, если он идёт следом */
function s_indexOfClose(html, from) {
  const m = /^\s*<\/image-slot>/.exec(html.slice(from));
  return m ? from + m[0].length : from;
}

/** Конец тега с учётом кавычек */
function findTagEnd(s, start) {
  let q = null;
  for (let j = start + 1; j < s.length; j++) {
    const c = s[j];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '>') return j;
  }
  return -1;
}

/** Разбор файла макета на части */
function parseDc(src) {
  const template = src.match(/<x-dc>([\s\S]*?)<\/x-dc>/);
  if (!template) throw new Error('нет блока <x-dc>');
  let tpl = template[1];

  const helmet = tpl.match(/<helmet>([\s\S]*?)<\/helmet>/);
  const helmetBody = helmet ? helmet[1] : '';
  tpl = tpl.replace(/<helmet>[\s\S]*?<\/helmet>/, '');

  const styles = [...helmetBody.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');

  const logic = src.match(/<script[^>]*data-dc-script[^>]*>([\s\S]*?)<\/script>/);
  const head = {
    title: (src.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '',
    description: (src.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '',
  };
  return { tpl, styles, logic: logic ? logic[1] : '', head };
}

// ---------------------------------------------------------------- запуск

const [, , inFile, outFile, componentName, source] = process.argv;
if (!inFile || !outFile || !componentName) {
  console.error('использование: node dc-to-tsx.mjs <вход.dc.html> <выход.tsx> <ИмяКомпонента> [источник]');
  process.exit(1);
}

const src = fs.readFileSync(inFile, 'utf8');
const { tpl, styles, logic, head } = parseDc(src);
hoverRules = new Map(); hoverSeq = 0; loopVars = []; idxNames = []; usedRoots.clear();

const jsx = convert(tpl.trim(), path.basename(inFile));

// таблица стилей: правила из helmet + классы взаимодействия
const interactionCss = [...hoverRules.entries()]
  .map(([cls, { kind, css }]) => `.${cls}:${kind === 'active' ? 'active' : kind === 'focus' ? 'focus-visible' : 'hover'}{${css}}`)
  .join('\n');

const logicBody = logic
  .replace(/class\s+Component\s+extends\s+DCLogic\s*\{/, '')
  .replace(/\}\s*$/, '')
  .trim();

const file = `// @ts-nocheck — логика перенесена из макета дословно и правится только в макете.
'use client';
// Сгенерировано из ${path.basename(inFile)} через tools/dc-to-tsx.mjs.
// Правки вносятся в макет и переносятся заново, а не здесь.
import React from 'react';
import { submitLead } from '../../lib/submit-lead';
import PhotoSlot from '../PhotoSlot';
import { ABOVE_THE_FOLD } from '../photos';

const css = \`
${styles.replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}
${interactionCss.replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}
\`;

export default class ${componentName} extends React.Component<any, any> {
${logicBody}

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
      const outcome = await submitLead(e, ${JSON.stringify(source || 'landing')}, key.slice('submit'.length).toLowerCase() || 'request');
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
${[...usedRoots].sort().map(k => `      ${k},`).join('\n')}
    } = v;
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: css }} />
${indent(jsx, 8)}
      </>
    );
  }
}
`;

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, file);

// Метаданные — отдельным серверным модулем рядом с компонентом
const metaFile = outFile.replace(/\.tsx$/, '.meta.ts');
fs.writeFileSync(metaFile, `// Сгенерировано из ${path.basename(inFile)}. Правится в макете.
export const meta = ${JSON.stringify(head, null, 2)};
`);

console.log(`${path.basename(inFile)} -> ${path.basename(outFile)}  (${jsx.split('\n').length} строк JSX, ${hoverRules.size} классов взаимодействия)`);
if (problems.length) {
  console.error('ТРЕБУЕТ РУЧНОЙ ДОРАБОТКИ:');
  for (const p of problems) console.error('  ' + p);
}


function indent(s, n) {
  const pad = ' '.repeat(n);
  return s.split('\n').map(l => (l.trim() ? pad + l : l)).join('\n');
}

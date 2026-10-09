/**
 * Заявка из шапки — окном поверх страницы (решение Р-484).
 *
 * Проверка по исходникам, как у благодарности (Р-406): окно смонтировано
 * на всех страницах, перехватывает только кнопку шапки, показывает нижнюю
 * форму своей страницы (поля и отправка прежние), размывает страницу,
 * закрывается крестиком, Esc и нажатием мимо, а после отправки уступает
 * место благодарности. Живая проверка в браузере — в описании решения.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');

const COMPONENT = read('app', 'src', 'components', 'RequestDialog.tsx');
const LAYOUT = read('app', 'src', 'app', 'layout.tsx');

describe('заявка из шапки — окном', () => {
  it('окно смонтировано в общем макете страниц', () => {
    assert.match(LAYOUT, /import RequestDialog from '\.\.\/components\/RequestDialog';/u);
    assert.match(LAYOUT, /<RequestDialog \/>/u);
  });

  it('перехватывается только ссылка «#request» в шапке, форма — нижняя форма страницы', () => {
    assert.match(COMPONENT, /closest\?\.\('a\[href="#request"\]'\)/u);
    assert.match(COMPONENT, /link\.closest\('header'\) === null\) return;/u);
    assert.match(COMPONENT, /document\.querySelector<HTMLFormElement>\('#request form'\)/u);
    // Своей формы у окна нет: ни полей, ни отправки.
    assert.doesNotMatch(COMPONENT, /<form|<input|fetch\(/u);
  });

  it('у каждой из четырёх страниц в шапке есть кнопка «#request» и форма в разделе заявки', () => {
    for (const page of ['StartPage', 'MainPage', 'StudentsPage', 'BusinessPage']) {
      const design = read('design', `${page}.dc.html`);
      const header = design.slice(design.indexOf('<header'), design.indexOf('</header>'));
      assert.match(header, /href="#request"/u, `${page}: в шапке нет кнопки заявки`);
      const section = design.slice(design.indexOf('<section id="request"'));
      assert.match(section.slice(0, section.indexOf('</section>')), /<form /u, `${page}: в разделе заявки нет формы`);
    }
  });

  it('страница за окном размыта, движение по дизайн-системе, уменьшенное движение учтено', () => {
    assert.match(COMPONENT, /backdrop-filter:blur\(6px\)/u);
    for (const ms of COMPONENT.matchAll(/(\d+)ms/gu)) {
      const value = Number(ms[1]);
      assert.ok(value >= 180 && value <= 260, `длительность ${value} мс вне 180—260`);
    }
    assert.match(COMPONENT, /@media \(prefers-reduced-motion:reduce\)/u);
  });

  it('закрывается крестиком 44 px, Esc и нажатием мимо; фокус держится в окне', () => {
    assert.match(COMPONENT, /\.pd-rq-close\{[^}]*width:44px;height:44px/u);
    assert.match(COMPONENT, /event\.key === 'Escape'/u);
    assert.match(COMPONENT, /veil\.addEventListener\('click', \(event\) => \{[^}]*shut\(true\);/u);
    assert.match(COMPONENT, /event\.key !== 'Tab'/u);
    assert.match(COMPONENT, /aria-modal/u);
  });

  it('после отправки окно закрывается и уступает благодарности; форма возвращается на место', () => {
    assert.match(COMPONENT, /window\.addEventListener\(LEAD_SENT_EVENT, onSent, true\)/u);
    assert.match(COMPONENT, /window\.removeEventListener\(LEAD_SENT_EVENT, onSent, true\)/u);
    assert.match(COMPONENT, /if \(open === null \|\| detail\?\.form !== open\.form\) return;/u);
    assert.match(COMPONENT, /detail\.returnTo = open\.opener;\s*shut\(false\);/u);
    assert.match(COMPONENT, /mark\.replaceWith\(form\)/u);
    // Слой ниже благодарности (45) и уведомления о cookies (50).
    const layers = [...COMPONENT.matchAll(/z-index:(\d+)/gu)].map((m) => Number(m[1]));
    assert.ok(layers.length > 0 && layers.every((z) => z < 45), `слои окна: ${layers.join(', ')}`);
  });
});

/**
 * Раздел заявки страницы: от `id="request"` до конца раздела. В макете и в
 * перенесённом компоненте разметка одна, различается только запись атрибутов.
 */
function requestSection(source: string): string {
  const start = source.indexOf('id="request"');
  assert.ok(start >= 0, 'нет раздела заявки');
  return source.slice(start, source.indexOf('</section>', start));
}

describe('окно заявки: ошибка отправки видна в окне', () => {
  // Окно переносит в body только сам элемент form (Р-484): всё, что стоит
  // после </form>, остаётся под размытием. Ошибка отправки (429, 503, обрыв
  // сети, ошибки полей) обязана быть внутри формы — иначе в окне её нет.
  const pages = [
    { design: 'StartPage', code: 'StartPage' },
    { design: 'MainPage', code: 'PostgradPage' },
    { design: 'StudentsPage', code: 'StudentsPage' },
    { design: 'BusinessPage', code: 'BusinessPage' },
  ];
  for (const page of pages) {
    it(`${page.code}: role="alert" формы заявки — внутри <form>`, () => {
      for (const source of [
        read('design', `${page.design}.dc.html`),
        read('app', 'src', 'components', 'pages', `${page.code}.tsx`),
      ]) {
        const section = requestSection(source);
        const open = section.indexOf('<form');
        const close = section.indexOf('</form>');
        assert.ok(open >= 0 && close > open, `${page.code}: нет формы в разделе заявки`);
        const alerts = [...section.matchAll(/role="alert"/gu)].map((m) => m.index!);
        assert.ok(alerts.length > 0, `${page.code}: у формы заявки нет блока ошибки`);
        for (const at of alerts) {
          assert.ok(at > open && at < close, `${page.code}: блок ошибки стоит вне формы`);
        }
      }
    });
  }
});

describe('окно заявки: двойной клик и клавиатура (Р-509)', () => {
  it('повторный клик серии (двойной клик по кнопке шапки) окно не закрывает', () => {
    // Второй клик двойного попадает уже в подложку: прежде окно тут же
    // закрывалось. У него event.detail = 2, у одиночного — 1.
    const handler = /veil\.addEventListener\('click', \(event\) => \{([^}]*)\}/u.exec(COMPONENT);
    assert.ok(handler, 'у подложки нет обработчика с событием');
    assert.match(handler[1]!, /if \(event\.detail > 1\) return;\s*shut\(true\);/u);
  });

  it('Tab при фокусе на body не перехватывается: браузер идёт от места удалённой вкладки', () => {
    // Вкладка «почта/телефон» при переключении заменяется новой кнопкой,
    // фокус падает на body. Прежде Tab уводил на крестик в начало окна.
    const onKey = COMPONENT.slice(COMPONENT.indexOf('const onKey'), COMPONENT.indexOf('const show'));
    const guard = onKey.indexOf('if (active === null || active === document.body) return;');
    assert.ok(guard > 0, 'нет пропуска Tab при фокусе на body');
    assert.ok(guard < onKey.indexOf('first.focus()'), 'пропуск стоит после перехвата');
  });
});

describe('окно заявки: фокус после благодарности (Р-510)', () => {
  const THANKS = read('app', 'src', 'components', 'LeadThanks.tsx');

  it('окно передаёт благодарности кнопку шапки, которая его открыла', () => {
    // Слушатель с перехватом: срабатывает раньше благодарности.
    const onSent = COMPONENT.slice(COMPONENT.indexOf('const onSent'), COMPONENT.indexOf("document.addEventListener('click', onClick, true)"));
    assert.match(onSent, /detail\.returnTo = open\.opener;/u);
    assert.ok(onSent.indexOf('detail.returnTo = open.opener') < onSent.indexOf('shut(false)'), 'кнопка передаётся после закрытия окна');
  });

  it('благодарность возвращает фокус туда, откуда пришла заявка, иначе — на кнопку отправки формы', () => {
    // Прежде фокус всегда уходил на кнопку нижней формы внизу страницы,
    // даже если заявку отправили из окна, открытого кнопкой шапки.
    assert.match(THANKS, /returnTo instanceof HTMLElement && returnTo\.isConnected \? returnTo : null/u);
    assert.match(THANKS, /\(back \?\? button \?\? form\)\?\.focus\(\{ preventScroll: true \}\)/u);
  });
});

describe('окно заявки: оформление (Р-511)', () => {
  /** Тело CSS-правила по селектору — из строки стилей компонента. */
  const rule = (selector: string): string => {
    const at = COMPONENT.indexOf(`${selector}{`);
    assert.ok(at >= 0, `нет правила ${selector}`);
    return COMPONENT.slice(at + selector.length + 1, COMPONENT.indexOf('}', at));
  };

  it('появление формы анимируется: ключевые кадры не перебиты !important', () => {
    // Объявление с !important сильнее анимации: прежде transform и opacity
    // формы стояли важными, и форма появлялась рывком.
    const frames = /@keyframes pd-rq-rise\{(.*?)\}\}/u.exec(COMPONENT);
    assert.ok(frames, 'нет ключевых кадров pd-rq-rise');
    const animated = new Set([...frames[1]!.matchAll(/([a-z-]+):/gu)].map((m) => m[1]!));
    assert.ok(animated.has('opacity') && animated.has('translate'), `анимируются: ${[...animated].join(', ')}`);
    const form = rule('form.pd-rq-open');
    assert.match(form, /animation:pd-rq-rise/u);
    for (const prop of animated) {
      assert.doesNotMatch(form, new RegExp(`(^|;)${prop}:[^;]*!important`, 'u'), `${prop} формы стоит важным`);
    }
  });

  it('крестик прилипает к верху окна при прокрутке длинной формы', () => {
    const close = rule('.pd-rq-close');
    assert.match(close, /position:sticky;top:-12px/u);
    assert.doesNotMatch(close, /position:absolute/u);
    // Крестик в потоке не сдвигает заголовок: зазор формы снимается.
    assert.match(COMPONENT, /title\.style\.marginTop = `-\$\{gap\}px`;/u);
  });

  it('блокировка прокрутки оставляет место полосы прокрутки: страница не сдвигается', () => {
    assert.match(rule('html.pd-rq-lock.pd-rq-gutter'), /^scrollbar-gutter:stable$/u);
    // Только при полосе, которая занимает место; снимается вместе с блокировкой.
    assert.match(COMPONENT, /classList\.toggle\('pd-rq-gutter', window\.innerWidth > root\.clientWidth\)/u);
    assert.match(COMPONENT, /classList\.remove\('pd-rq-lock', 'pd-rq-gutter'\)/u);
  });
});

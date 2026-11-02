/**
 * «Настройки cookies» и уведомление по Политике 1.1 (решение Р-773,
 * исполняет Р-250). До включения счётчика в подвале шести страниц сайта
 * должна быть ссылка, которая стирает выбор посетителя и снова показывает
 * уведомление: иначе после «Разрешить» отозвать согласие нечем. Текст
 * уведомления не называет данные обезличенными — политика относит к ним
 * адрес соединения. Проверка и по макетам, и по перенесённому коду, и по
 * поведению обработчика.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  CHOICE_KEY,
  SETTINGS_LINK,
  dropCounterData,
  forgetChoice,
  openCookieSettings,
  readChoice,
  saveChoice,
} from '../src/components/cookie-choice.ts';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');

const PAGES = [
  { design: 'StartPage', code: 'StartPage' },
  { design: 'MainPage', code: 'PostgradPage' },
  { design: 'StudentsPage', code: 'StudentsPage' },
  { design: 'BusinessPage', code: 'BusinessPage' },
  { design: 'ExpertsPage', code: 'ExpertsPage' },
  { design: 'NotFoundPage', code: 'NotFoundPage' },
];

const LEGAL = ['OfferPage', 'PrivacyPage', 'ConsentPage'];

/** Подвал макета или компонента: от открывающего `<footer` до закрывающего. */
function footer(source: string): string {
  const start = source.lastIndexOf('<footer');
  const end = source.indexOf('</footer>', start);
  assert.ok(start >= 0 && end > start, 'подвал не найден');
  return source.slice(start, end);
}

class MemoryStore {
  items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  key(i: number) {
    return [...this.items.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.items.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.items.set(k, String(v));
  }
  removeItem(k: string) {
    this.items.delete(k);
  }
}

function click(over: Partial<Parameters<typeof openCookieSettings>[0]> & { link?: boolean } = {}) {
  let prevented = false;
  const { link = true, ...rest } = over;
  const event = {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: { closest: (selector: string) => (link && selector === SETTINGS_LINK ? {} : null) } as unknown as EventTarget,
    preventDefault() {
      prevented = true;
    },
    ...rest,
  };
  return { event, prevented: () => prevented };
}

describe('ссылка «Настройки cookies» в подвале шести страниц (Р-773)', () => {
  for (const { design, code } of PAGES) {
    it(`${design}: в макете и в коде, ведёт в раздел политики, цель 44 px`, () => {
      const layout = footer(read('design', `${design}.dc.html`));
      const link = /<a href="\.\/privacy\.html#cookies" data-pd-cookies style="([^"]*)"[^>]*>Настройки cookies<\/a>/u.exec(layout);
      assert.ok(link, 'в подвале макета нет ссылки «Настройки cookies»');
      assert.match(link[1], /min-height:44px/u);

      const tsx = footer(read('app', 'src', 'components', 'pages', `${code}.tsx`));
      assert.match(tsx, /href="\/privacy#cookies" data-pd-cookies=\{true\}[^>]*>Настройки cookies<\/a>/u);
    });
  }

  it('правовые страницы не тронуты', () => {
    for (const page of LEGAL) {
      assert.doesNotMatch(read('design', `${page}.dc.html`), /data-pd-cookies|Настройки cookies/u);
    }
  });

  it('селектор обработчика совпадает с меткой в макетах', () => {
    assert.equal(SETTINGS_LINK, 'a[data-pd-cookies]');
    assert.equal(CHOICE_KEY, 'pd-analytics');
  });
});

describe('обработчик «Настройки cookies» стирает выбор (Р-773)', () => {
  for (const before of ['yes', 'no'] as const) {
    it(`после «${before === 'yes' ? 'Разрешить' : 'Отказаться'}»: выбор стёрт, переход отменён`, () => {
      const store = new MemoryStore();
      saveChoice(store, before);
      store.setItem('other', 'keep');
      assert.equal(readChoice(store), before);

      const { event, prevented } = click();
      assert.equal(openCookieSettings(event, store), true);
      assert.equal(prevented(), true);
      assert.equal(readChoice(store), null);
      assert.equal(store.getItem(CHOICE_KEY), null);
      assert.equal(store.getItem('other'), 'keep');
    });
  }

  it('другие ссылки и нажатия с модификатором не трогает', () => {
    for (const over of [{ link: false }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }, { defaultPrevented: true }]) {
      const store = new MemoryStore();
      saveChoice(store, 'yes');
      const { event, prevented } = click(over);
      assert.equal(openCookieSettings(event, store), false);
      assert.equal(prevented(), false);
      assert.equal(readChoice(store), 'yes');
    }
  });

  it('недоступное хранилище не роняет страницу', () => {
    const broken = {
      length: 0,
      key: () => null,
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    assert.equal(readChoice(broken), null);
    saveChoice(broken, 'yes');
    forgetChoice(broken);
    const { event } = click();
    assert.equal(openCookieSettings(event, broken), true);
  });

  it('отказ после согласия стирает cookies и записи счётчика, но не выбор', () => {
    const writes: string[] = [];
    const doc = {
      get cookie() {
        return '_ym_uid=1; _ym_d=2; session=x';
      },
      set cookie(v: string) {
        writes.push(v);
      },
    };
    const store = new MemoryStore();
    store.setItem('_ym_uid', '1');
    store.setItem('_ym_synced', '1');
    saveChoice(store, 'no');
    dropCounterData(doc, store, 'www.prodisser.ru');
    assert.ok(writes.every((w) => /^_ym_(uid|d)=; Max-Age=0; path=\//u.test(w)));
    assert.ok(writes.includes('_ym_uid=; Max-Age=0; path=/; domain=.prodisser.ru'));
    assert.ok(writes.includes('_ym_d=; Max-Age=0; path=/'));
    assert.ok(!writes.some((w) => w.startsWith('session=')));
    assert.equal(store.getItem('_ym_uid'), null);
    assert.equal(store.getItem('_ym_synced'), null);
    assert.equal(readChoice(store), 'no');
  });
});

describe('компонент Метрики: перехват ссылки и текст по Политике 1.1 (Р-773)', () => {
  const metrika = read('app', 'src', 'components', 'Metrika.tsx');

  it('ссылка перехватывается только при включённом счётчике и вне кабинета', () => {
    assert.match(metrika, /if \(!METRIKA_ID \|\| cabinet\) return;\s*const onClick = \(event: MouseEvent\) => \{\s*if \(!openCookieSettings\(event, store\(\)\)\) return;\s*setChoice\(null\);/u);
    assert.match(metrika, /document\.removeEventListener\('click', onClick\)/u);
  });

  it('отказ после согласия останавливает уже загруженный счётчик', () => {
    assert.match(metrika, /if \(v === 'no' && started\.current\) \{[\s\S]*?dropCounterData\(document, store\(\), window\.location\.hostname\);\s*window\.location\.reload\(\);/u);
  });

  it('в тексте уведомления нет «обезличен», есть состав данных и способ изменить выбор', () => {
    assert.doesNotMatch(metrika, /обезличен/iu);
    const text = metrika.replace(/\{\/\*[\s\S]*?\*\/\}/gu, '').replace(/\s+/gu, ' ');
    assert.match(text, /адрес соединения, сведения о браузере и устройстве/u);
    assert.match(text, /Имя, контакты и содержание заявок ему не передаются\./u);
    assert.match(text, /Изменить выбор можно ссылкой «Настройки cookies»/u);
    assert.match(text, /<a href="\/privacy#cookies"/u);
  });
});

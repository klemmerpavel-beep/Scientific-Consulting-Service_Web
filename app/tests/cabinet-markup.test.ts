/**
 * Разметка экранов кабинета собирается общими частями, а не пишется заново.
 *
 * Проверка ходит по исходникам, а не по снимкам: снимок показывает только
 * то, что попало в обход, а правило должно запирать все экраны сразу.
 * Прецедент — `text-guard.test.ts`, который проверяет формулировки тем же
 * способом и по той же причине.
 *
 * Поводом послужило решение Р-158: к этому времени формы были набраны в
 * одиннадцати файлах по-своему, объект стиля поля разошёлся на четыре
 * редакции, и высота поля на служебных экранах отличалась от клиентских.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SCREENS = path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet');
const COMPONENTS = path.join(import.meta.dirname, '..', 'src', 'components', 'cabinet');

/**
 * Файлы каталога. Разметка живёт в `.tsx`, предметная область — в `.ts`,
 * и правилам слоёв нужны оба: перечень из одних `.tsx` делал проверку
 * `lib/cabinet` пустой, то есть вечно зелёной (решение Р-186).
 */
function sources(root: string, ext: '.tsx' | '.ts' | 'both' = '.tsx'): string[] {
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((name) =>
      ext === 'both' ? name.endsWith('.ts') || name.endsWith('.tsx') : name.endsWith(ext),
    )
    .map((name) => path.join(root, name));
}

describe('экраны кабинета не пишут разметку форм заново', () => {
  for (const file of sources(SCREENS)) {
    const name = path.relative(SCREENS, file);
    const code = readFileSync(file, 'utf8');

    it(`${name}: форма собрана компонентом`, () => {
      assert.equal(/<form\b/u.test(code), false, 'на экране собственная разметка формы');
    });

    it(`${name}: поля собраны компонентами`, () => {
      assert.equal(/<select\b/u.test(code), false, 'на экране собственный выбор из списка');
      assert.equal(/<textarea\b/u.test(code), false, 'на экране собственное многострочное поле');
      // Скрытое поле разметки не имеет и передаёт форме то, чего человек не
      // вводит: его писать руками правильно.
      for (const field of code.matchAll(/<input\b([^>]*)>/gu)) {
        assert.ok(
          field[1].includes('type="hidden"'),
          `поле помимо скрытого: ${field[0].slice(0, 80)}`,
        );
      }
    });

    // Область прокрутки обязана получать фокус, иначе до её содержимого
    // не добраться с клавиатуры (Р-168). Прокрутка заведена в общих
    // частях — `TableCard`, `BoardColumn`, `Disclosure`, — и объявлять её
    // на экране незачем ни по одной оси (Р-169).
    it(`${name}: прокрутка собрана компонентом`, () => {
      assert.equal(
        /overflow[XY]/u.test(code),
        false,
        'на экране своя область прокрутки вместо общей части',
      );
    });

    it(`${name}: вид кнопки не набирается вручную`, () => {
      assert.equal(
        /className="cab-btn/u.test(code),
        false,
        'вид кнопки задан на экране, а не общей частью',
      );
    });
  }
});

describe('раскладка в окно объявлена одним экраном', () => {
  // Свойство `board` отдаёт экрану всю высоту окна и запирает прокрутку
  // страницы. Оно рассчитано на экраны, где всё главное видно сразу, и
  // проверено только на них: на прокручиваемом экране оно срезало бы
  // содержимое (решения Р-169, Р-172). Перечень закрытый — третий экран
  // потребует отдельного решения и пересчёта бюджета.
  it('свойство board стоит на перечисленных экранах', () => {
    const owners = sources(SCREENS).filter((file) =>
      /<Shell[^>]*\sboard\b/su.test(readFileSync(file, 'utf8')),
    );
    assert.deepEqual(
      owners.map((file) => path.relative(SCREENS, file)).sort(),
      [
        'manage/page.tsx',
        // Экран загрузки панели обязан повторять её строй: иначе при
        // загрузке раскладка подменяется лентой и прыгает при подстановке
        // содержимого (решение Р-184).
        'projects/[code]/loading.tsx',
        'projects/[code]/page.tsx',
      ],
    );
  });
});

describe('шапка экрана собрана общей частью', () => {
  // Экраны внутри работы — этап, материалы, переписка, оплаты — набирали
  // шапку каждый по-своему: крошка то моноширинной ссылкой, то меткой,
  // заголовок то в сорок пикселей, то в двадцать два. Три яруса занимали
  // до ста десяти пикселей и всякий раз выглядели иначе (решение Р-170).
  const inside = [
    'stages/[id]/page.tsx',
    'projects/[code]/materials/page.tsx',
    'projects/[code]/messages/page.tsx',
    'projects/[code]/payments/page.tsx',
    // Ручная тройка «моно-метка + заголовок + абзац» стояла и здесь —
    // ровно тот узор, ради которого общая часть и заведена (Р-172).
    'payout/page.tsx',
    'request/page.tsx',
    'settings/page.tsx',
    'manage/page.tsx',
    'manage/finance/page.tsx',
    'manage/leads/[id]/page.tsx',
    // Служебные экраны руководителя: реестры переведены давно, но в
    // перечень не попали, справочники и отчёт переноса — решением Р-177.
    'manage/registry/page.tsx',
    'manage/directory/page.tsx',
    'manage/import/[batchId]/page.tsx',
    'manage/users/page.tsx',
    'manage/audit/page.tsx',
    'manage/outbox/page.tsx',
    // Пять экранов собирали шапку вручную и потому в перечень не
    // попадали: правило проверяет только то, что в нём названо
    // (решение Р-183).
    'manage/leads/page.tsx',
    'manage/erasure/page.tsx',
    'manage/import/page.tsx',
    'manage/finance/years/page.tsx',
    'manage/tools/page.tsx',
  ];

  for (const name of inside) {
    it(`${name}: шапка — ScreenHead`, () => {
      const code = readFileSync(path.join(SCREENS, name), 'utf8');
      assert.ok(/<ScreenHead\b/u.test(code), 'шапка набрана на экране, а не общей частью');
      assert.equal(
        /<Heading level=\{1\}/u.test(code),
        false,
        'на экране свой заголовок первого уровня помимо шапки',
      );
    });
  }
});

describe('общие части остаются единственным местом вида', () => {
  it('разметка кнопки живёт в components/cabinet', () => {
    const owners = sources(COMPONENTS).filter((file) =>
      /className=\{?[`'"]cab-btn/u.test(readFileSync(file, 'utf8')),
    );
    assert.ok(owners.length > 0, 'вид кнопки не найден ни в одной общей части');
  });
});

describe('слои кабинета не смешиваются', () => {
  /**
   * Три слоя: маршруты и экраны (`app/cabinet`), предметная область
   * (`lib/cabinet`), оформление (`components/cabinet`). Правила границ
   * держались на договорённости, и к решению Р-185 граница «экран →
   * база» была пробита в четырёх файлах: экран читал то же, что рядом
   * читала служба, а условие доступа стояло на экране.
   *
   * Отсюда три запрета. Они проверяются по исходникам, потому что
   * касаются того, как написан код, а не того, что вышло на экран.
   */
  it('экран и серверное действие не обращаются к базе напрямую', () => {
    const guilty = sources(SCREENS, 'both')
      .filter((file) => /from\s+'[^']*lib\/db'/u.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(SCREENS, file));
    assert.deepEqual(
      guilty,
      [],
      'выборка должна лежать в lib/cabinet и сама спрашивать разрешение',
    );
  });

  it('предметная область не знает об оформлении и о каркасе', () => {
    const root = path.join(SCREENS, '..', '..', 'lib', 'cabinet');
    const guilty: string[] = [];
    for (const file of sources(root, 'both')) {
      const code = readFileSync(file, 'utf8');
      const name = path.relative(root, file);
      // Исключения — модули cookie запроса: сессия и одноразовое сообщение
      // об отказе (решение Р-243). Без `next/headers` cookie не прочесть;
      // к оформлению они не обращаются и под это исключение не подпадают.
      const cookieModule = name === 'session.ts' || name === 'flash.ts';
      if (/from\s+'[^']*components\//u.test(code) || (!cookieModule && /from\s+'next\//u.test(code))) {
        guilty.push(name);
      }
    }
    assert.deepEqual(guilty, [], 'слой предметной области тянет за собой разметку');
  });

  it('выборка, читающая данные, спрашивает разрешение сама', () => {
    // Функция, которая делает `prisma.<модель>.find*` и не упоминает ни
    // `ensure`, ни `can`, ни `scope*`, закрыта только тем, что её никто
    // не вызывает не оттуда. Это не защита (решение Р-185).
    const root = path.join(SCREENS, '..', '..', 'lib', 'cabinet');
    // Перечень закрытый: каждая из этих выборок закрыта не правом, и
    // причина названа рядом. Новая такая функция потребует решения.
    const allowed = new Set([
      'auth.ts', // до появления действующего лица: вход, токены, сессии
      'outbox.ts', // фоновая рассылка по расписанию, закрыта секретом маршрута
      'projects.ts', // `projectRef` — помощник самого механизма прав
      'import/apply.ts', // `assemble` — внутренний помощник разбора книги
      'admin.ts', // `ownChannels` и `saveOwnChannels` — своя учётная запись
      'queries.ts', // `moderatorIds` — идентификаторы для очереди, без данных
      'readiness.ts',
    ]);
    const guilty: string[] = [];
    for (const file of sources(root, 'both')) {
      const name = path.relative(root, file);
      if (allowed.has(name)) continue;
      const code = readFileSync(file, 'utf8');
      if (!/prisma\.[a-zA-Z]+\.(findMany|findFirst|findUnique|count|groupBy)/u.test(code)) continue;
      if (!/\bensure\(|\bcan\(|\bscope[A-Z]/u.test(code)) guilty.push(name);
    }
    assert.deepEqual(guilty, [], 'выборка читает данные, не спрашивая разрешения');
  });

  it('каждое записываемое действие названо в словаре журнала', async () => {
    // Перечень действий для отбора берётся из словаря названий, а не
    // обходом журнала. Значит код, записанный мимо словаря, пропал бы из
    // отбора молча — и в журнале остался бы машинной строкой (Р-186).
    const { actionCodes } = await import('../src/lib/cabinet/journal-labels.ts');
    const known = new Set(actionCodes());
    const root = path.join(SCREENS, '..', '..', 'lib', 'cabinet');
    // Расписание пишет в журнал наравне с экранами: зеркало на диске и
    // мост «Диск → база» ведутся скриптами, и их виды действия обходили
    // правило стороной (решение Р-202).
    const scripts = path.join(SCREENS, '..', '..', '..', 'scripts');
    const unnamed = new Set<string>();
    for (const file of [...sources(root, 'both'), ...sources(SCREENS), ...sources(scripts, '.ts')]) {
      const code = readFileSync(file, 'utf8');
      // Только записи в журнал: у `can` и `ensure` тем же словом названо
      // право, и оно к словарю журнала отношения не имеет.
      for (const call of code.matchAll(/\brecord\([\s\S]{0,400}?\}\)/gu)) {
        const hit = /\baction:\s*'([A-Z][A-Z0-9_]+)'/u.exec(call[0]);
        if (hit !== null && !known.has(hit[1]!)) unnamed.add(hit[1]!);
      }
    }
    assert.deepEqual([...unnamed].sort(), [], 'действие пишется в журнал, но не названо по-русски');
  });
});

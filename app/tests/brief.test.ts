/**
 * Разбор документов «Метка: значение» и предпроверка (решение Р-556): на
 * подобиях четырёх образцов владельца, на шаблоне-таблице, на книге Excel
 * и на негодных файлах.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { guessServiceCode, matchLabel, parseBrief } from '../src/lib/cabinet/brief/parse.ts';
import { BriefError, readBrief } from '../src/lib/cabinet/brief/read.ts';
import { SAMPLES, makeDocx } from './helpers/make-docx.ts';
import { excelSerial, makeWorkbook, zip } from './helpers/make-workbook.ts';

const parse = (bytes: Buffer) => parseBrief(readBrief(bytes).lines);

describe('метка строки (Р-556)', () => {
  it('разделитель — двоеточие, тире, дефис или ничего при номере', () => {
    assert.deepEqual(
      ['Тема работы: Х', 'Университет – Вуз', 'КАФЕДРА - Каф', '1. Тема статьи Алгоритм'].map((line) => {
        const match = matchLabel(line)!;
        return [match.key, match.value];
      }),
      [
        ['topic', 'Х'],
        ['university', 'Вуз'],
        ['chair', 'Каф'],
        ['topic', 'Алгоритм'],
      ],
    );
  });

  it('«ФИО руководителя» — не «ФИО»; «Темы работы» — тема; регистр и «ё» не мешают', () => {
    assert.equal(matchLabel('ФИО Руководителя: Иванов')?.key, 'supervisor');
    assert.equal(matchLabel('ФИО: Петров')?.key, 'customer');
    assert.equal(matchLabel('Темы работы: «Т»')?.key, 'topic');
    assert.equal(matchLabel('ЦЕЛЬ РАБОТЫ: Ц')?.value, 'Ц');
  });

  it('длинный абзац без разделителя — текст, а не метка', () => {
    assert.equal(matchLabel(`Актуальность темы обусловлена ${'необходимостью '.repeat(6)}`), null);
    assert.equal(matchLabel('Тематика работ кафедры'), null, 'синоним — целое слово');
  });
});

describe('подобия образцов владельца (Р-556)', () => {
  it('ВКР: шапка, тема, цель, задачи; ФИО пусто; введение сплошным текстом', () => {
    const brief = parse(makeDocx(SAMPLES.thesis));
    assert.equal(brief.fields.university, 'Технологический университет');
    assert.equal(brief.fields.institute, 'Инженерных систем');
    assert.equal(brief.fields.chair, 'Теплотехники');
    assert.equal(brief.fields.direction, 'Энергетика промышленных предприятий');
    assert.equal(brief.fields.topic, '«Оценка эффективности утилизации теплоты отходящих газов»');
    assert.match(brief.fields.goal ?? '', /^Оценить эффективность/u);
    assert.equal(brief.fields.tasks?.split('\n').length, 3);
    assert.match(brief.fields.tasks ?? '', /^1\. Провести анализ/u);
    assert.ok(brief.issues.some((issue) => issue.includes('«ФИО автора»')));
    assert.ok(brief.issues.some((issue) => issue.startsWith('Введение — сплошным текстом')));
    // «Введение» и «Список…» внутри плана — пункты, а не повтор раздела.
    assert.ok(!brief.issues.some((issue) => issue.startsWith('Раздел повторяется')), brief.issues.join(' | '));
    assert.equal(brief.fields.sources?.split('\n').length, 3);
  });

  it('ВКР: повтор «Задачи работы», пустые ФИО и руководитель, «Актуальность темы» не метка', () => {
    const brief = parse(makeDocx(SAMPLES.model));
    assert.equal(brief.fields.topic, 'Моделирование теплопроводности стенки печи', 'фрагменты абзаца склеены');
    assert.ok(brief.issues.some((issue) => issue.startsWith('Раздел повторяется: «Задачи работы')));
    assert.ok(brief.issues.some((issue) => issue.includes('«ФИО научного руководителя»')));
    assert.match(brief.fields.relevance ?? '', /^Актуальность темы обусловлена/u);
    assert.equal(brief.fields.sources?.split('\n').length, 2);
  });

  it('ВКР с одним вариантом: метка-одиночка, склеенные пункты, след выгрузки, вид — по шифру', () => {
    const brief = parse(makeDocx(SAMPLES.variant));
    assert.equal(brief.variants.length, 0, 'вариант один — поля в общих');
    assert.equal(brief.fields.topic, 'Модернизация мельничного оборудования обогатительной фабрики');
    assert.ok(brief.issues.some((issue) => issue.startsWith('Одиночная метка «Вариант 1')));
    assert.ok(brief.issues.some((issue) => issue.startsWith('Склеенные пункты')));
    assert.ok(brief.issues.some((issue) => issue.startsWith('Служебный след')));
    assert.equal(guessServiceCode(brief), 'diploma');
  });

  it('статья: метки с номером без разделителя, подсказка шаблона, вид — статья', () => {
    const brief = parse(makeDocx(SAMPLES.article));
    assert.equal(brief.fields.topic, 'Алгоритм переключения режимов гибридного энергокомплекса');
    assert.match(brief.fields.goal ?? '', /^Разработка и проверка/u);
    assert.equal(brief.fields.tasks?.split('\n').length, 2);
    assert.ok(brief.issues.some((issue) => issue.includes('«(2–3 задачи)»')));
    assert.ok(brief.article);
    assert.equal(guessServiceCode(brief), 'article');
    assert.match(brief.fields.results ?? '', /0,5 \| 12 \| 895/u, 'таблица данных — строками текста');
  });
});

describe('варианты темы, таблица, Excel (Р-556)', () => {
  it('несколько вариантов: тема, цель, задачи — у варианта, шапка — общая', () => {
    const brief = parse(
      makeDocx([
        'Вариант 1. Первая тема',
        'Цель работы: Первая цель.',
        'Вариант 2. Вторая тема',
        'Тема работы: Уточнённая вторая тема',
        'Цель работы: Вторая цель.',
        'Задачи работы:',
        'Задача А.',
        'Университет: Вуз',
      ]),
    );
    assert.equal(brief.variants.length, 2);
    assert.deepEqual(brief.variants[0]!.fields, { topic: 'Первая тема', goal: 'Первая цель.' });
    assert.equal(brief.variants[1]!.fields.topic, 'Уточнённая вторая тема');
    assert.equal(brief.variants[1]!.fields.tasks, '1. Задача А.');
    assert.equal(brief.fields.university, 'Вуз');
    assert.ok(!brief.issues.some((issue) => issue.startsWith('Одиночная')));
  });

  it('шаблон-таблица: метка в первой ячейке, значение и задачи — во второй', () => {
    const brief = parse(
      makeDocx([
        'Анкета заказа',
        {
          table: [
            ['ФИО заказчика', 'Иванова Анна Сергеевна'],
            ['Почта', 'anna@example.org'],
            ['Вид работы', 'Сопровождение выпускной квалификационной работы'],
            ['Тема', 'Анализ рынка'],
            ['Задачи', 'Собрать данные\nПостроить модель'],
            ['Срок', '15.06.2027'],
            ['Группа', ''],
          ],
        },
      ]),
    );
    assert.equal(brief.fields.customer, 'Иванова Анна Сергеевна');
    assert.equal(brief.fields.email, 'anna@example.org');
    assert.equal(brief.fields.deadline, '15.06.2027');
    assert.equal(brief.fields.tasks, '1. Собрать данные\n2. Построить модель');
    assert.equal(brief.fields.group, undefined, 'пустое значение не переносится');
    assert.equal(guessServiceCode(brief), 'diploma');
  });

  it('книга Excel: колонки A и B, числовая дата остаётся числом для разбора срока', () => {
    const brief = parse(
      makeWorkbook([
        ['ФИО заказчика', 'Петров Пётр'],
        ['Тема', 'Тема из Excel'],
        ['Срок', excelSerial('2027-06-15')],
      ]),
    );
    assert.equal(brief.fields.customer, 'Петров Пётр');
    assert.equal(brief.fields.topic, 'Тема из Excel');
    assert.match(brief.fields.deadline ?? '', /^\d{5}$/u);
  });

  it('разрыв строки внутри абзаца — две строки, а не склейка', () => {
    const brief = parse(
      makeDocx(['СОДЕРЖАНИЕ', { lines: ['3.5. Анализ чувствительности параметров', '3.6. Выводы по главе 3'] }, 'Заключение']),
    );
    assert.equal(brief.fields.plan, '3.5. Анализ чувствительности параметров\n3.6. Выводы по главе 3\nЗаключение');
    assert.ok(!brief.issues.some((issue) => issue.startsWith('Склеенные')));
  });

  it('значение длиннее предела не обрезается молча', () => {
    const brief = parse(makeDocx([`Тема: ${'длинная тема '.repeat(60)}`]));
    assert.equal(brief.fields.topic, undefined);
    assert.ok(brief.manual.some((note) => note.includes('«Тема» длиннее 500 знаков')));
  });

  it('номер ссылки больше числа источников — замечание', () => {
    const brief = parse(makeDocx(['Введение', 'Как показано [1] и [4].', 'Список литературы', 'Один.', 'Два.']));
    assert.ok(brief.issues.some((issue) => issue === 'Ссылка [4] при 2 источниках в списке.'), brief.issues.join(' | '));
  });
});

describe('негодный файл — отказ с причиной (Р-556)', () => {
  it('пустой, не архив, архив без документа, слишком большой', () => {
    assert.throws(() => readBrief(Buffer.alloc(0)), BriefError);
    assert.throws(() => readBrief(Buffer.from('просто текст, а не документ')), /не документ Word/u);
    assert.throws(() => readBrief(zip([{ name: 'readme.txt', content: 'x' }])), /не документ Word/u);
    assert.throws(() => readBrief(Buffer.alloc(2 * 1024 * 1024 + 1, 1)), /больше 2 МБ/u);
  });

  it('документ без текста', () => {
    assert.throws(() => readBrief(makeDocx([])), /нет текста/u);
  });
});

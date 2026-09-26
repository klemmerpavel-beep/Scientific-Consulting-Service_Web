/**
 * Зеркало на Яндекс Диске: имена, план выгрузки и разговор по WebDAV.
 *
 * Из среды разработки наружу ходу нет, и проверить зеркало «вживую» нельзя.
 * Поэтому проверяемое отделено от сети: имена и план — чистые функции,
 * а клиент WebDAV принимает переносчик запросов снаружи и в проверке
 * получает поддельный. Так ловится всё, кроме поведения самого Яндекса.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { foldersFor, materialFolders, projectFolder, safeSegment, tablePath, versionPath, webdavUrl }
  from '../src/lib/disk/paths.ts';
import { formatManifest, parseManifest, planSync } from '../src/lib/disk/plan.ts';
import { csv, rub } from '../src/lib/disk/table.ts';
import { DiskError, YandexDisk, type Transport } from '../src/lib/disk/webdav.ts';

describe('имена в зеркале', () => {
  it('разделитель пути в имени файла не порождает папку', () => {
    const name = safeSegment('глава 1/2: черновик.docx');
    assert.ok(!name.includes('/'), name);
    assert.ok(!name.includes(':'), name);
    assert.equal(name, 'глава 1 2 черновик.docx');
  });

  it('пустое и точечное имя заменяется, а не уходит пустым', () => {
    assert.equal(safeSegment('   '), 'без названия');
    assert.equal(safeSegment('...'), 'без названия');
  });

  it('длинное имя обрезается, но расширение остаётся', () => {
    const long = `${'диссертация '.repeat(20)}.docx`;
    const short = safeSegment(long);
    assert.ok(short.length <= 80, String(short.length));
    assert.ok(short.endsWith('.docx'), short);
  });

  it('путь версии читается человеком и содержит номер впереди', () => {
    const p = versionPath('PD-2026-001', 'Глава 2', 3, 'глава-2.docx');
    assert.equal(p, 'Работы/PD-2026-001/Глава 2/v3 — глава-2.docx');
    assert.equal(projectFolder('PD-2026-001'), 'Работы/PD-2026-001');
    assert.equal(tablePath('raboty.csv'), 'Таблицы/raboty.csv');
  });

  it('кириллица в адресе кодируется по отрезкам, а не целиком', () => {
    const url = webdavUrl('https://webdav.yandex.ru/', 'ProDisser', 'Работы/PD-2026-001/файл.docx');
    assert.ok(url.startsWith('https://webdav.yandex.ru/ProDisser/'), url);
    assert.equal(url.split('/').length, 7, url);
    assert.ok(!url.includes('Работы'), 'кириллица осталась незакодированной');
  });

  it('папки перечисляются от корня к файлу', () => {
    assert.deepEqual(foldersFor('Работы/PD-2026-001/Глава 2/v1 — файл.docx'), [
      'Работы',
      'Работы/PD-2026-001',
      'Работы/PD-2026-001/Глава 2',
    ]);
  });
});

describe('план выгрузки', () => {
  const manifest = parseManifest(
    formatManifest([
      { path: 'Таблицы/raboty.csv', sha256: 'aaa', sizeBytes: 10 },
      { path: 'Работы/PD-1/м/v1 — a.docx', sha256: 'bbb', sizeBytes: 20 },
      { path: 'Работы/PD-1/м/v2 — b.docx', sha256: 'ccc', sizeBytes: 30 },
    ]),
  );

  it('опись переживает запись и разбор', () => {
    assert.equal(manifest.size, 3);
    assert.equal(manifest.get('Таблицы/raboty.csv')?.sha256, 'aaa');
    assert.equal(manifest.get('Работы/PD-1/м/v1 — a.docx')?.sizeBytes, 20);
  });

  it('неизменившееся не отправляется, изменившееся отправляется', () => {
    const plan = planSync(
      [
        { path: 'Таблицы/raboty.csv', sha256: 'aaa', sizeBytes: 10 },
        { path: 'Работы/PD-1/м/v1 — a.docx', sha256: 'иная', sizeBytes: 21 },
        { path: 'Работы/PD-2/м/v1 — c.docx', sha256: 'ddd', sizeBytes: 40 },
      ],
      manifest,
    );
    assert.equal(plan.keep, 1);
    assert.deepEqual(plan.upload.map((e) => e.path), [
      'Работы/PD-1/м/v1 — a.docx',
      'Работы/PD-2/м/v1 — c.docx',
    ]);
  });

  it('исчезнувшее с сервера удаляется с Диска', () => {
    // Изъятие материала по требованию субъекта не должно оставлять копию
    // в облаке: она пережила бы обезличивание на сервере.
    const plan = planSync([{ path: 'Таблицы/raboty.csv', sha256: 'aaa', sizeBytes: 10 }], manifest);
    assert.deepEqual([...plan.remove].sort(), [
      'Работы/PD-1/м/v1 — a.docx',
      'Работы/PD-1/м/v2 — b.docx',
    ]);
  });
});

describe('строки таблиц', () => {
  it('кавычки удваиваются, метка BOM и CRLF на месте', () => {
    const body = csv(['Тема'], [['Он сказал: "да"']]);
    assert.ok(body.startsWith('﻿'), 'нет метки BOM');
    assert.ok(body.includes('"Он сказал: ""да"""'), body);
    assert.ok(body.endsWith('\r\n'));
  });

  it('деньги пишутся числом с запятой и без пробелов', () => {
    assert.equal(rub(12345678n), '123456,78');
    assert.equal(rub(0n), '0,00');
    assert.equal(rub(-5000n), '-50,00');
    assert.equal(rub(null), '');
    assert.ok(!rub(100000000n).includes(' '), 'пробел превратит число в текст');
  });
});

function fake(answers: (number | Error)[]): { transport: Transport; calls: string[] } {
  const calls: string[] = [];
  let i = 0;
  const transport: Transport = async (url, init) => {
    calls.push(`${init.method} ${url}`);
    const answer = answers[Math.min(i++, answers.length - 1)];
    if (answer instanceof Error) throw answer;
    return new Response(answer === 200 ? 'тело' : null, { status: answer });
  };
  return { transport, calls };
}

describe('разговор по WebDAV', () => {
  const opts = { base: 'https://webdav.yandex.ru', user: 'u', password: 'p', folder: 'ProDisser' };

  it('существующая папка (405) ошибкой не считается', async () => {
    const { transport, calls } = fake([405, 405, 201]);
    const disk = new YandexDisk({ ...opts, transport });
    await disk.put('Таблицы/raboty.csv', Buffer.from('1'));
    assert.ok(calls.some((c) => c.startsWith('MKCOL')), calls.join('\n'));
    assert.ok(calls.at(-1)?.startsWith('PUT'), String(calls.at(-1)));
  });

  it('вторая запись не заводит уже заведённую папку', async () => {
    const { transport, calls } = fake([405, 405, 201, 201]);
    const disk = new YandexDisk({ ...opts, transport });
    await disk.put('Таблицы/a.csv', Buffer.from('1'));
    const first = calls.filter((c) => c.startsWith('MKCOL')).length;
    await disk.put('Таблицы/b.csv', Buffer.from('2'));
    assert.equal(calls.filter((c) => c.startsWith('MKCOL')).length, first);
  });

  it('неверный пароль не повторяется: дело не в сети', async () => {
    const { transport, calls } = fake([401]);
    const disk = new YandexDisk({ ...opts, transport });
    await assert.rejects(() => disk.put('Таблицы/a.csv', Buffer.from('1')), DiskError);
    assert.equal(calls.length, 1, 'запрос повторён при отказе по существу');
  });

  it('временный отказ повторяется и доходит', async () => {
    const { transport, calls } = fake([405, 405, 500, 201]);
    const disk = new YandexDisk({ ...opts, transport, retries: 3 });
    await disk.put('Таблицы/a.csv', Buffer.from('1'));
    assert.equal(calls.filter((c) => c.startsWith('PUT')).length, 2);
  });

  it('отсутствующая опись читается как пустая, а не роняет прогон', async () => {
    const { transport } = fake([404]);
    const disk = new YandexDisk({ ...opts, transport });
    assert.equal(await disk.get('.opis-zerkala.tsv'), null);
  });

  it('удаление отсутствующего файла — не ошибка: цель достигнута', async () => {
    const { transport } = fake([404]);
    const disk = new YandexDisk({ ...opts, transport });
    await disk.remove('Работы/PD-1/м/v1 — a.docx');
  });
});

describe('зеркало: формулы, эмодзи на границе, одноимённые материалы (решение Р-246)', () => {
  it('значение-формула в таблице получает апостроф, отрицательная сумма — нет', () => {
    const text = csv(['Имя', 'Сумма'], [['=HYPERLINK("http://evil/")', '-5,00'], ['@cmd', '+1']]);
    assert.match(text, /"'=HYPERLINK\(""http:\/\/evil\/""\)"/u);
    assert.match(text, /"-5,00"/u);
    assert.match(text, /"'@cmd"/u);
    assert.match(text, /"'\+1"/u);
  });

  it('обрезка не разрывает эмодзи, адрес WebDAV собирается', () => {
    const name = `${'а'.repeat(59)}😀${'б'.repeat(30)}.docx`;
    const cut = safeSegment(name, 70);
    assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u.test(cut), 'одиночный суррогат');
    assert.doesNotThrow(() => webdavUrl('https://webdav.example', 'Зеркало', `Работы/${cut}`));
  });

  it('одноимённые материалы одной работы получают разные папки; первый сохраняет прежнюю', () => {
    const at = (s: number) => new Date(Date.UTC(2026, 8, 1, 0, 0, s));
    const folders = materialFolders([
      { id: 'b', createdAt: at(2), title: 'Счёт.pdf', project: { code: 'PD-1' } },
      { id: 'a', createdAt: at(1), title: 'Счёт.pdf', project: { code: 'PD-1' } },
      { id: 'c', createdAt: at(3), title: 'Счёт.pdf', project: { code: 'PD-2' } },
    ]);
    assert.equal(folders.get('a'), 'Счёт.pdf');
    assert.equal(folders.get('b'), 'Счёт.pdf (2)');
    assert.equal(folders.get('c'), 'Счёт.pdf');
    const paths = ['a', 'b'].map((id) => versionPath('PD-1', folders.get(id)!, 1, 'Счёт.pdf'));
    assert.notEqual(paths[0], paths[1]);
  });
});

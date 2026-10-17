/**
 * Анкета эксперта (решение Р-580): правила полей и файлов, приём запроса,
 * страница сайта и предел nginx. Без базы и без сети.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  EXPERT_CONSENT_VERSION,
  EXPERIENCE_IN_RESUME,
  ExpertInputError,
  consentVersionLabel,
  experienceLabel,
  expertFiles,
  normalizeOrcid,
  normalizeSpin,
  parseExpertForm,
} from '../src/lib/expert-application.ts';
import { receiveExpertApplication } from '../src/lib/expert-intake.ts';
import { RateLimiter } from '../src/lib/rate-limit.ts';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');

const PDF = Buffer.from('%PDF-1.7\n%тест\n', 'utf8');
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(32)]);

function filled(extra: Record<string, string> = {}): FormData {
  const form = new FormData();
  const base: Record<string, string> = {
    fullName: 'Иванова Мария Петровна',
    email: 'maria@почта.рф',
    phone: '+7 (916) 123-45-67',
    degree: 'Кандидат наук',
    speciality: '5.2.3. Региональная и отраслевая экономика',
    fields: 'Экономика отраслевых рынков, ВКР и диссертации',
    experience: 'Руководила двенадцатью ВКР, рецензент журнала ВАК, 30 публикаций',
    links: 'https://elibrary.ru/author_profile.asp?id=1',
    consent: 'on',
    elapsed: '60000',
    ...extra,
  };
  for (const [key, value] of Object.entries(base)) form.set(key, value);
  if (!('services' in extra)) {
    form.append('services', 'ВКР и магистерские диссертации');
    form.append('services', 'Научные статьи');
  }
  return form;
}

describe('анкета эксперта: поля (Р-580)', () => {
  it('полная анкета принимается, кириллический домен почты — тоже', () => {
    const input = parseExpertForm(filled());
    assert.equal(input.fullName, 'Иванова Мария Петровна');
    assert.equal(input.degree, 'Кандидат наук');
    assert.equal(input.consent, true);
  });

  it('пустой опыт называется одной фразой на экране и в выгрузке', () => {
    assert.equal(experienceLabel(''), EXPERIENCE_IN_RESUME);
    assert.equal(experienceLabel('Руководство ВКР'), 'Руководство ВКР');
  });

  it('опыт — текстом или резюме: с приложенным файлом поле опыта можно оставить пустым (Р-597)', () => {
    const form = filled({ experience: '' });
    form.append('files', new File([PDF], 'Резюме.pdf', { type: 'application/pdf' }));
    const input = parseExpertForm(form);
    assert.equal(input.experience, '');
    assert.equal('resume' in input, false);
    // Пустое поле файла резюме не заменяет.
    const empty = filled({ experience: '' });
    empty.append('files', new File([], '', { type: 'application/octet-stream' }));
    assert.throws(() => parseExpertForm(empty), (error: unknown) => error instanceof ExpertInputError && /резюме/u.test(error.message));
  });

  it('без согласия, без опыта, с чужой степенью и неверной почтой — понятный отказ', () => {
    const cases: [Record<string, string>, RegExp][] = [
      [{ consent: '' }, /согласия/u],
      [{ experience: 'мало' }, /опыт/iu],
      [{ experience: '' }, /опыт.*резюме/iu],
      [{ degree: 'Профессор' }, /степень/u],
      [{ email: 'maria@' }, /адрес/u],
      [{ phone: '12-34' }, /номер/u],
    ];
    for (const [extra, message] of cases) {
      assert.throws(() => parseExpertForm(filled(extra)), (error: unknown) => error instanceof ExpertInputError && message.test(error.message));
    }
  });

  it('редакция согласия кандидата — та, что названа на странице', () => {
    const page = read('design', 'ExpertsPage.dc.html');
    const [, year, month, day, revision] = /^(\d{4})-(\d{2})-(\d{2})(?:\.(\d+))?$/u.exec(EXPERT_CONSENT_VERSION)!;
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const label = revision === undefined ? 'Редакция согласия' : `Редакция согласия ${revision}`;
    assert.ok(page.includes(`${label} от ${Number(day)} ${months[Number(month) - 1]} ${year} года`));
    assert.equal(consentVersionLabel('2026-10-14.2'), '2 от 14.10.2026');
    assert.equal(consentVersionLabel('2026-10-14'), 'от 14.10.2026');
  });
});

describe('профессиональная анкета (Р-584)', () => {
  it('разделы анкеты разбираются: звание, место работы, стаж, виды работ, опыт, профили, загрузка', () => {
    const form = filled({
      academicTitle: 'Доцент',
      workplace: 'Доцент кафедры экономики',
      seniority: '3–10 лет',
      elibrarySpin: '1234 5678',
      orcid: 'https://orcid.org/0000-0002-1825-0097',
      weeklyHours: '5–10 часов',
    });
    form.append('roles', 'Руководство ВКР');
    form.append('roles', 'Руководство ВКР');
    const input = parseExpertForm(form);
    assert.equal(input.academicTitle, 'Доцент');
    assert.deepEqual(input.services, ['ВКР и магистерские диссертации', 'Научные статьи']);
    assert.deepEqual(input.roles, ['Руководство ВКР']);
    assert.equal(input.elibrarySpin, '1234-5678');
    assert.equal(input.orcid, '0000-0002-1825-0097');
  });

  it('без вида работ, с чужим значением перечня, с неверным SPIN или ORCID — понятный отказ', () => {
    const noServices = filled({ services: '' });
    noServices.delete('services');
    const foreign = filled();
    foreign.append('roles', 'Ректор');
    const cases: [FormData, RegExp][] = [
      [noServices, /вид работ/u],
      [filled({ academicTitle: 'Академик' }), /звание/u],
      [foreign, /опыт/iu],
      [filled({ elibrarySpin: '12-34' }), /SPIN/u],
      [filled({ orcid: '0000-0002-1825-0098' }), /ORCID/u],
      [filled({ weeklyHours: 'Сколько скажете' }), /загрузку/u],
    ];
    for (const [form, message] of cases) {
      assert.throws(() => parseExpertForm(form), (error: unknown) => error instanceof ExpertInputError && message.test(error.message));
    }
  });

  it('SPIN-код и ORCID приводятся к одному виду, контрольная цифра ORCID сверяется', () => {
    assert.equal(normalizeSpin('12345678'), '1234-5678');
    assert.equal(normalizeSpin('1234-567'), null);
    assert.equal(normalizeOrcid('0000-0002-1694-233x'), '0000-0002-1694-233X');
    assert.equal(normalizeOrcid('0000000218250097'), '0000-0002-1825-0097');
    assert.equal(normalizeOrcid('0000-0002-1825-0098'), null);
  });
});

describe('анкета эксперта: файлы (Р-580)', () => {
  it('PDF и DOCX принимаются, тип — по расширению', async () => {
    const form = filled();
    form.append('files', new File([PDF], 'Резюме.pdf'));
    form.append('files', new File([DOCX], 'Статья.docx'));
    const files = await expertFiles(form);
    assert.deepEqual(files.map((file) => file.contentType), [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);
  });

  it('пустое поле файла не считается файлом', async () => {
    const form = filled();
    form.append('files', new File([], ''));
    assert.deepEqual(await expertFiles(form), []);
  });

  it('чужое расширение, подмена содержимого, четвёртый файл — отказ', async () => {
    const cases: [File[], RegExp][] = [
      [[new File([PDF], 'фото.jpg')], /не принят/u],
      [[new File([Buffer.from('MZ\x90\x00')], 'резюме.pdf')], /не похож/u],
      [[1, 2, 3, 4].map((n) => new File([PDF], `${n}.pdf`)), /Не больше 3/u],
    ];
    for (const [files, message] of cases) {
      const form = filled();
      for (const file of files) form.append('files', file);
      await assert.rejects(expertFiles(form), (error: unknown) => error instanceof ExpertInputError && message.test(error.message));
    }
  });
});

describe('анкета эксперта: приём запроса (Р-580)', () => {
  const request = (form: FormData) => new Request('http://localhost/api/experts', { method: 'POST', body: form });
  const limiter = () => new RateLimiter({ windowMs: 60_000, limit: 5, maxKeys: 10 });

  it('анкета с файлом записывается, сигнал уходит после записи', async () => {
    const saved: string[] = [];
    const signalled: string[] = [];
    const form = filled();
    form.append('files', new File([PDF], 'Резюме.pdf'));
    const response = await receiveExpertApplication(request(form), {
      limiter: limiter(),
      save: async (input, files) => {
        saved.push(`${input.fullName}:${files.length}`);
        return { id: 'a1' };
      },
      after: (id) => signalled.push(id),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.deepEqual(saved, ['Иванова Мария Петровна:1']);
    assert.deepEqual(signalled, ['a1']);
  });

  it('ловушка и слишком быстрая отправка — «принято» без записи', async () => {
    for (const extra of [{ company_website: 'spam.example' }, { elapsed: '500' }] as Record<string, string>[]) {
      let saved = false;
      const response = await receiveExpertApplication(request(filled(extra)), {
        limiter: limiter(),
        save: async () => {
          saved = true;
          return { id: 'x' };
        },
      });
      assert.equal(response.status, 200);
      assert.equal(saved, false);
    }
  });

  it('ошибка анкеты — 422 с текстом для человека, а не сбой', async () => {
    const response = await receiveExpertApplication(request(filled({ consent: '' })), {
      limiter: limiter(),
      save: async () => ({ id: 'x' }),
    });
    assert.equal(response.status, 422);
    assert.match((await response.json()).error, /согласия/u);
  });

  it('шестая анкета за час с одного адреса — 429', async () => {
    const shared = limiter();
    let last = 0;
    for (let i = 0; i < 6; i += 1) {
      const response = await receiveExpertApplication(request(filled()), { limiter: shared, save: async () => ({ id: 'x' }) });
      last = response.status;
    }
    assert.equal(last, 429);
  });
});

describe('страница «Экспертам» (Р-580)', () => {
  const design = read('design', 'ExpertsPage.dc.html');

  it('анкета уходит своим обработчиком на /api/experts, а не обёрткой заявки', () => {
    assert.match(design, /onSubmit="\{\{ sendApplication \}\}"/u);
    assert.match(design, /fetch\('\/api\/experts'/u);
    assert.doesNotMatch(design, /onSubmit="\{\{ submit/u);
  });

  it('согласие кандидата — обязательная отметка и текст на странице', () => {
    assert.match(design, /name="consent" type="checkbox" required="\{\{ true \}\}"/u);
    assert.match(design, /Цель обработки — оценка моей квалификации/u);
    assert.match(design, /не более шести месяцев/u);
  });

  it('на странице нет «авторов работ»: практика работ за клиентов не пишет', () => {
    assert.doesNotMatch(design, /стать автором|авторам работ|напишем|написание/iu);
    assert.match(design, /Автором работы всегда остаётся клиент/u);
  });

  it('страница вне поиска: noindex и нет в карте сайта', () => {
    assert.match(read('app', 'src', 'app', 'experts', 'page.tsx'), /robots: \{ index: false, follow: true \}/u);
    assert.doesNotMatch(read('app', 'src', 'app', 'sitemap.ts'), /experts/u);
  });

  it('перенос макета — в общем цикле CI', () => {
    assert.match(read('.github', 'workflows', 'ci.yml'), /"ExpertsPage:ExpertsPage:landing"/u);
  });

  it('nginx пропускает анкету с файлами: предел как у приёма', () => {
    const conf = read('deploy', 'nginx.conf');
    const block = conf.slice(conf.indexOf('location = /api/experts'));
    assert.match(block.slice(0, block.indexOf('}')), /client_max_body_size 21m;/u);
  });
});

/**
 * Наполнение базы для снятия артбордов кабинета.
 *
 * Артборд — это разметка настоящего экрана со всем, что на нём есть,
 * включая ФИО клиентов и суммы договоров. Репозиторий сайта открыт,
 * поэтому снимать артборды с базы, куда перенесена настоящая книга
 * заказов, нельзя ни при каких условиях. Здесь заводятся вымышленные
 * люди и вымышленные деньги, но все состояния, которые артборд обязан
 * показать: этап в согласовании, непрочитанное сообщение, непубликованный
 * комментарий эксперта, просроченный транш, отчёт переноса со всеми
 * классами замечаний, витрины аналитики с ненулевыми числами.
 *
 * Скрипт отказывается работать с базой, в имени которой нет «artboard»:
 * ошибиться подключением здесь — значит засеять демонстрационными людьми
 * рабочую базу.
 *
 * Запуск: DATABASE_URL=…/prodisser_artboards npm run seed:artboards
 */

import { prisma } from '../src/lib/db.ts';
import { createRawToken, digest } from '../src/lib/cabinet/token.ts';
import { previewBook } from '../src/lib/cabinet/import/apply.ts';
import type { Actor } from '../src/lib/cabinet/access.ts';
import { excelSerial, makeWorkbook, type TestRow } from '../tests/helpers/make-workbook.ts';

const DOMAIN = 'artboard.example';
const GREEN = 'FF00B050';
const RED = 'FFFF0000';

/** Вымышленные заказчики. Совпадения с настоящими клиентами практики нет. */
const CLIENTS = [
  'Астахова Вера Николаевна',
  'Белов Радислав Игоревич',
  'Ветрова Аглая Германовна',
  'Тихомиров Глеб Русланович',
  'Дьяченко Ирина Леонидовна',
  'Ермаков Станислав Юрьевич',
  'Жукова Полина Андреевна',
  'Зимин Кирилл Максимович',
  'Ильина Наталья Борисовна',
  'Кравцов Роман Витальевич',
  'Лазарева Екатерина Олеговна',
  'Мартынов Денис Сергеевич',
] as const;

const TYPES = [
  ['dissertation', 'Сопровождение диссертационного исследования', 10],
  ['postgrad', 'Сопровождение поступления и обучения в аспирантуре', 20],
  ['consulting', 'Научный консалтинг и сопровождение до защиты', 30],
  ['research', 'НИР, НИОКР и отчётные материалы', 40],
  ['article', 'Научные публикации и патентные материалы', 50],
  ['diploma', 'Сопровождение выпускной квалификационной работы', 60],
] as const;

/** Темы работ — нейтральные и узнаваемые, без отсылок к настоящим заказам. */
const TOPICS = [
  'Методы повышения устойчивости вычислений на сверхпроводниковых кубитах',
  'Диагностика режимов работы карьерного транспорта по вибрационным данным',
  'Модель распределения нагрузки в распределённых системах хранения',
  'Оценка энергоэффективности систем оборотного водоснабжения',
  'Алгоритмы восстановления сигнала при неполных измерениях',
  'Управление рисками научно-технических проектов в условиях неопределённости',
] as const;

/**
 * Отсчёт дат ведётся от постоянной точки, а не от текущего момента:
 * иначе каждый снимок отличался бы от предыдущего одними только датами,
 * и разбор изменений в артбордах стал бы нечитаемым.
 */
const REFERENCE = Date.UTC(2026, 8, 16, 9, 0, 0);

function day(offsetDays: number): Date {
  return new Date(REFERENCE - offsetDays * 86_400_000);
}

function money(rubles: number): bigint {
  return BigInt(rubles) * 100n;
}

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/artboard/i.test(url)) {
    throw new Error(
      'База для артбордов должна называться так, чтобы её нельзя было спутать ' +
        'с рабочей: в DATABASE_URL нет слова «artboard». Наполнение остановлено.',
    );
  }

  // ── Справочники ─────────────────────────────────────────────────────────
  const typeIds = new Map<string, string>();
  for (const [code, name, sortOrder] of TYPES) {
    const type = await prisma.serviceType.upsert({
      where: { code },
      create: { code, name, sortOrder },
      update: { name, sortOrder },
    });
    typeIds.set(code, type.id);
  }
  for (const [argb, mapsTo, description] of [
    [GREEN, 'CLOSED', 'Зелёная: работа доведена'],
    [RED, 'STOPPED', 'Красная: работа остановлена'],
  ] as const) {
    await prisma.importColorMap.upsert({
      where: { argb },
      create: { argb, mapsTo, description },
      update: { mapsTo, description },
    });
  }

  // ── Люди ────────────────────────────────────────────────────────────────
  const head = await prisma.user.upsert({
    where: { email: `head@${DOMAIN}` },
    create: { email: `head@${DOMAIN}`, fullName: 'Соколов Павел Андреевич', role: 'HEAD' },
    update: {},
  });
  const manager = await prisma.user.upsert({
    where: { email: `manager@${DOMAIN}` },
    create: { email: `manager@${DOMAIN}`, fullName: 'Нечаева Ксения Ильинична', role: 'MANAGER' },
    update: {},
  });
  const expertUser = await prisma.user.upsert({
    where: { email: `expert@${DOMAIN}` },
    create: { email: `expert@${DOMAIN}`, fullName: 'Григорьев Антон Эдуардович', role: 'EXPERT' },
    update: {},
  });
  await prisma.expertProfile.upsert({
    where: { userId: expertUser.id },
    create: {
      userId: expertUser.id,
      degree: 'д.т.н.',
      academicTitle: 'профессор',
      specialization: 'теория надёжности технических систем',
      ndaSignedAt: day(400),
    },
    update: { ndaSignedAt: day(400) },
  });

  // ── Клиенты и проекты ───────────────────────────────────────────────────
  //
  // Двенадцать заказчиков, двадцать пять работ за два года: столько нужно,
  // чтобы витрины аналитики показывали не заглушки, а числа — сезонность,
  // сегменты, концентрацию и разброс чека.
  const clientIds: string[] = [];
  for (const [index, fullName] of CLIENTS.entries()) {
    const client = await prisma.clientProfile.upsert({
      where: { id: `artboard-client-${index}` },
      create: {
        id: `artboard-client-${index}`,
        fullName,
        normalizedName: fullName.toLowerCase(),
        phone: `+7 900 000-00-${String(10 + index).padStart(2, '0')}`,
        email: `client${index}@${DOMAIN}`,
        university: index % 3 === 0 ? 'МГТУ имени Н. Э. Баумана' : 'СПбПУ Петра Великого',
        speciality: index % 2 === 0 ? '2.8.6' : '1.3.11',
      },
      update: {},
    });
    clientIds.push(client.id);
  }

  const clientUser = await prisma.user.upsert({
    where: { email: `client@${DOMAIN}` },
    create: { email: `client@${DOMAIN}`, fullName: CLIENTS[0], role: 'CLIENT' },
    update: {},
  });
  await prisma.clientProfile.update({
    where: { id: clientIds[0]! },
    data: { userId: clientUser.id },
  });

  await prisma.projectCodeCounter.upsert({
    where: { year: 2026 },
    create: { year: 2026, lastNumber: 0 },
    update: {},
  });

  /** Разброс работ по месяцам, типам и суммам — основа витрин аналитики. */
  const PLAN: readonly {
    client: number;
    type: string;
    cost: number;
    paid: number;
    startedDaysAgo: number;
    durationDays: number;
    status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  }[] = [
    { client: 0, type: 'dissertation', cost: 240_000, paid: 120_000, startedDaysAgo: 120, durationDays: 180, status: 'ACTIVE' },
    { client: 0, type: 'article', cost: 45_000, paid: 45_000, startedDaysAgo: 420, durationDays: 60, status: 'COMPLETED' },
    { client: 1, type: 'postgrad', cost: 90_000, paid: 90_000, startedDaysAgo: 300, durationDays: 90, status: 'COMPLETED' },
    { client: 1, type: 'dissertation', cost: 300_000, paid: 150_000, startedDaysAgo: 60, durationDays: 240, status: 'ACTIVE' },
    { client: 2, type: 'diploma', cost: 35_000, paid: 35_000, startedDaysAgo: 520, durationDays: 45, status: 'COMPLETED' },
    { client: 3, type: 'consulting', cost: 200_000, paid: 50_000, startedDaysAgo: 260, durationDays: 150, status: 'PAUSED' },
    { client: 4, type: 'research', cost: 150_000, paid: 150_000, startedDaysAgo: 380, durationDays: 120, status: 'COMPLETED' },
    { client: 5, type: 'article', cost: 25_000, paid: 25_000, startedDaysAgo: 200, durationDays: 30, status: 'COMPLETED' },
    { client: 5, type: 'article', cost: 120_000, paid: 60_000, startedDaysAgo: 90, durationDays: 90, status: 'ACTIVE' },
    { client: 6, type: 'dissertation', cost: 260_000, paid: 260_000, startedDaysAgo: 610, durationDays: 300, status: 'COMPLETED' },
    { client: 7, type: 'postgrad', cost: 80_000, paid: 40_000, startedDaysAgo: 45, durationDays: 90, status: 'ACTIVE' },
    { client: 8, type: 'research', cost: 180_000, paid: 180_000, startedDaysAgo: 470, durationDays: 150, status: 'COMPLETED' },
    { client: 9, type: 'diploma', cost: 40_000, paid: 0, startedDaysAgo: 30, durationDays: 60, status: 'ACTIVE' },
    { client: 10, type: 'consulting', cost: 220_000, paid: 110_000, startedDaysAgo: 150, durationDays: 210, status: 'ACTIVE' },
    { client: 11, type: 'dissertation', cost: 280_000, paid: 280_000, startedDaysAgo: 700, durationDays: 330, status: 'COMPLETED' },
    { client: 2, type: 'research', cost: 95_000, paid: 45_000, startedDaysAgo: 340, durationDays: 120, status: 'PAUSED' },
    { client: 3, type: 'article', cost: 30_000, paid: 30_000, startedDaysAgo: 510, durationDays: 40, status: 'COMPLETED' },
    { client: 4, type: 'diploma', cost: 38_000, paid: 38_000, startedDaysAgo: 250, durationDays: 50, status: 'COMPLETED' },
    { client: 6, type: 'postgrad', cost: 85_000, paid: 85_000, startedDaysAgo: 180, durationDays: 90, status: 'COMPLETED' },
    { client: 8, type: 'consulting', cost: 190_000, paid: 95_000, startedDaysAgo: 75, durationDays: 180, status: 'ACTIVE' },
  ];

  const projectIds: string[] = [];
  for (const [index, row] of PLAN.entries()) {
    const startedOn = day(row.startedDaysAgo);
    const dueOn = new Date(startedOn.getTime() + row.durationDays * 86_400_000);
    const closedOn = row.status === 'COMPLETED' ? dueOn : null;
    const year = startedOn.getUTCFullYear();
    const code = `PD-${year}-${String(index + 1).padStart(3, '0')}`;

    const project = await prisma.project.upsert({
      where: { code },
      create: {
        code,
        clientId: clientIds[row.client]!,
        serviceTypeId: typeIds.get(row.type)!,
        title: TYPES.find((type) => type[0] === row.type)![1],
        topic: TOPICS[index % TOPICS.length]!,
        managerId: manager.id,
        expertId: index % 3 === 0 ? expertUser.id : null,
        status: row.status,
        source: index % 4 === 0 ? 'IMPORT' : 'WEB',
        startedOn,
        dueOn,
        closedOn,
      },
      update: {},
      select: { id: true },
    });
    projectIds.push(project.id);

    if (row.cost > 0) {
      const contract = await prisma.contract.upsert({
        where: { projectId: project.id },
        create: {
          projectId: project.id,
          number: `Д-${code}`,
          signedOn: startedOn,
          totalAmount: money(row.cost),
        },
        update: {},
        select: { id: true, tranches: { select: { id: true } } },
      });
      if (contract.tranches.length === 0) {
        if (row.paid > 0) {
          await prisma.tranche.create({
            data: {
              contractId: contract.id,
              title: 'Первый платёж',
              amount: money(row.paid),
              status: 'PAID',
              paidOn: startedOn,
            },
          });
        }
        if (row.cost > row.paid) {
          await prisma.tranche.create({
            data: {
              contractId: contract.id,
              title: 'Остаток по договору',
              amount: money(row.cost - row.paid),
              plannedDate: dueOn,
              status: 'PLANNED',
            },
          });
        }
      }
    }

    const payouts = await prisma.expertPayout.count({ where: { projectId: project.id } });
    if (payouts === 0 && index % 3 === 0 && row.status !== 'COMPLETED') {
      await prisma.expertPayout.create({
        data: {
          projectId: project.id,
          expertId: expertUser.id,
          amount: money(Math.round(row.cost * 0.35)),
          status: index % 2 === 0 ? 'PAID' : 'ACCRUED',
          paidOn: index % 2 === 0 ? day(row.startedDaysAgo - 10) : null,
        },
      });
    }
  }

  // ── Показательный проект клиента: этапы, материалы, переписка ────────────
  const showcase = projectIds[0]!;
  const stageRows = [
    { title: 'Постановка задачи и план работы', state: 'DONE' as const, offset: 100 },
    { title: 'Обзор источников и методика', state: 'DONE' as const, offset: 70 },
    { title: 'Расчётная часть: первая редакция', state: 'IN_APPROVAL' as const, offset: 20 },
    { title: 'Апробация и публикации', state: 'AWAITING_CLIENT' as const, offset: 10 },
    { title: 'Подготовка к предзащите', state: 'NOT_STARTED' as const, offset: 0 },
  ];
  const stageIds: string[] = [];
  for (const [position, stage] of stageRows.entries()) {
    const created = await prisma.stage.upsert({
      where: { projectId_position: { projectId: showcase, position: position + 1 } },
      create: {
        projectId: showcase,
        position: position + 1,
        title: stage.title,
        state: stage.state,
        dueOn: day(stage.offset - 30),
        expertId: expertUser.id,
        startedAt: stage.state === 'NOT_STARTED' ? null : day(stage.offset + 20),
        completedAt: stage.state === 'DONE' ? day(stage.offset) : null,
        awaitingClientSince: stage.state === 'AWAITING_CLIENT' ? day(18) : null,
      },
      update: {},
      select: { id: true },
    });
    stageIds.push(created.id);
  }

  const material = await prisma.material.upsert({
    where: { id: 'artboard-material-1' },
    create: {
      id: 'artboard-material-1',
      projectId: showcase,
      stageId: stageIds[2],
      title: 'Расчётная часть, глава 2',
      createdById: expertUser.id,
    },
    update: {},
  });
  for (const [number, author] of [
    [1, expertUser.id],
    [2, clientUser.id],
  ] as const) {
    await prisma.materialVersion.upsert({
      where: { materialId_number: { materialId: material.id, number } },
      create: {
        materialId: material.id,
        number,
        storageKey: `artboards/material/v${number}`,
        originalName: `Глава 2, редакция ${number}.docx`,
        sizeBytes: BigInt(180_000 + number * 24_000),
        sha256: 'a'.repeat(64),
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        uploadedById: author,
        uploadedAt: day(number === 1 ? 24 : 12),
      },
      update: {},
    });
  }
  const version = await prisma.materialVersion.findFirst({
    where: { materialId: material.id, number: 2 },
    select: { id: true },
  });
  if (version !== null) {
    const comments = await prisma.versionComment.count({ where: { versionId: version.id } });
    if (comments === 0) {
      await prisma.versionComment.createMany({
        data: [
          {
            versionId: version.id,
            authorId: manager.id,
            body: 'Принято в работу. Эксперт смотрит методическую часть.',
            moderationStatus: 'PUBLISHED',
            publishedAt: day(11),
          },
          {
            versionId: version.id,
            authorId: expertUser.id,
            body: 'В разделе 2.3 нужен вывод формулы (7): без него переход к оценке не следует.',
            moderationStatus: 'PENDING',
          },
        ],
      });
    }
  }

  const messages = await prisma.message.count({ where: { projectId: showcase } });
  if (messages === 0) {
    await prisma.message.createMany({
      data: [
        {
          projectId: showcase,
          authorId: manager.id,
          body: 'Добрый день. Замечания эксперта по главе 2 будут завтра, план не сдвигается.',
          createdAt: day(3),
          readAt: day(3),
        },
        {
          projectId: showcase,
          authorId: clientUser.id,
          body: 'Спасибо. Мой телефон +7 900 000-00-10, если удобнее голосом.',
          createdAt: day(2),
          containsContactHint: true,
        },
      ],
    });
  }

  const events = await prisma.projectEvent.count({ where: { projectId: showcase } });
  if (events === 0) {
    await prisma.projectEvent.createMany({
      data: [
        { projectId: showcase, actorId: manager.id, kind: 'PROJECT_CREATED', createdAt: day(120) },
        { projectId: showcase, actorId: expertUser.id, kind: 'VERSION_UPLOADED', createdAt: day(24) },
        { projectId: showcase, actorId: clientUser.id, kind: 'VERSION_UPLOADED', createdAt: day(12) },
        { projectId: showcase, actorId: manager.id, kind: 'STAGE_STATE_CHANGED', createdAt: day(10) },
      ],
    });
  }

  // ── Заявка в очереди менеджера ──────────────────────────────────────────
  const lead = await prisma.lead.findFirst({ where: { contact: `lead@${DOMAIN}` } });
  if (lead === null) {
    await prisma.lead.create({
      data: {
        source: 'postgrad',
        form: 'request',
        name: 'Панкратов Егор Максимович',
        contactKind: 'email',
        contact: `lead@${DOMAIN}`,
        topic: 'Сопровождение подготовки к поступлению в аспирантуру по направлению 2.8.6',
        speciality: '2.8.6',
        message: 'Нужна помощь с реферативной частью и планом исследования.',
        consentGiven: true,
        consentVersion: '2026-08-21',
        termsAccepted: true,
      },
    });
  }

  // ── Отчёт переноса книги заказов ────────────────────────────────────────
  //
  // Книга собирается тем же сборщиком, что и в проверках: вымышленные имена,
  // но все шесть классов замечаний воспроизведены. Предпросмотр вызывается
  // по-настоящему — артборд показывает отчёт, а не его макет.
  const batches = await prisma.importBatch.count();
  if (batches === 0) {
    const HEADER: TestRow = [
      'Дата',
      'Заказчик (ФИО)',
      'Тип работы',
      'Описание работы',
      'Дедлайн',
      'Стоимость',
      'Статутус работы',
      'Оплачено',
    ];
    const book = makeWorkbook([
      HEADER,
      [excelSerial('2025-01-14'), 'Астахова Вера Николаевна', 'Диссертция', 'Кандидатская, физика', excelSerial('2025-06-01'), '150000', { value: 'закрыт', fill: GREEN }, '150000'],
      [excelSerial('2025-02-03'), 'Астахова Вера Николаевна', 'Аспирнтура', 'Пакет поступления', '31.04.2025', '90000', { value: 'в работе', fill: GREEN }, '40000'],
      [excelSerial('2025-03-11'), 'Белов Радислав Игоревич', 'Статья ВАК', 'Обзорная статья', '31 апреля 2025', '25000', { value: 'закрыт', fill: GREEN }, '30000'],
      [excelSerial('2025-11-02'), 'Белов Радислав Игоревич', 'Отчет НИР', 'Отчёт по этапу', '18 декабря', '60000', { value: 'закрыт', fill: GREEN }, '20000'],
      [excelSerial('2025-04-07'), 'Ветрова Аглая Германовна', 'Консультационное сопровождение до защиты', 'Сопровождение', 'к лету', '200000', { value: 'закрыт', fill: RED }, '50000'],
      [excelSerial('2025-05-19'), 'Тихомиров Глеб Русланович', 'Дипломная работа', 'Специалитет', '20.12.2025', '35000', { value: 'на старте', fill: null }, '0'],
    ]);
    const actor: Actor = {
      id: head.id,
      role: 'HEAD',
      status: 'ACTIVE',
      clientProfileId: null,
      expertNdaSignedAt: null,
    };
    await previewBook(actor, { fileName: 'Книга заказов (образец).xlsx', bytes: book });
  }

  // ── Требование об удалении и записи журнала ─────────────────────────────
  const erasures = await prisma.erasureRequest.count();
  if (erasures === 0) {
    await prisma.erasureRequest.create({
      data: { clientId: clientIds[11]!, scope: 'PERSONAL_DATA_AND_FILES' },
    });
  }
  const audits = await prisma.auditEvent.count();
  if (audits < 5) {
    await prisma.auditEvent.createMany({
      data: [
        { actorId: manager.id, actorRole: 'MANAGER', action: 'LEAD_APPROVED', objectType: 'Lead', projectId: showcase, occurredAt: day(120) },
        { actorId: expertUser.id, actorRole: 'EXPERT', action: 'VERSION_UPLOADED', objectType: 'MaterialVersion', projectId: showcase, occurredAt: day(24) },
        { actorId: manager.id, actorRole: 'MANAGER', action: 'COMMENT_PUBLISHED', objectType: 'VersionComment', projectId: showcase, occurredAt: day(11) },
        { actorId: head.id, actorRole: 'HEAD', action: 'CONTRACT_SAVED', objectType: 'Contract', projectId: showcase, occurredAt: day(100) },
        { actorId: head.id, actorRole: 'HEAD', action: 'IMPORT_PREVIEWED', objectType: 'ImportBatch', occurredAt: day(1) },
      ],
    });
  }

  // ── Ссылки входа для снимка ─────────────────────────────────────────────
  const links: Record<string, string> = {};
  for (const [role, user] of [
    ['client', clientUser],
    ['expert', expertUser],
    ['manager', manager],
    ['head', head],
  ] as const) {
    const token = createRawToken();
    await prisma.loginToken.create({
      data: {
        selector: token.selector,
        verifierHash: digest(token.verifier),
        userId: user.id,
        expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
        requestIp: 'artboards',
      },
    });
    links[role] = token.value;
  }

  // Токены печатаются машинно разбираемой строкой: их читает скрипт снимка.
  process.stdout.write(`${JSON.stringify({ links, showcase: PLAN.length > 0 ? 'ok' : 'empty' })}\n`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  process.stderr.write(`${String(error)}\n`);
  await prisma.$disconnect();
  process.exit(1);
});

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

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { prisma } from '../src/lib/db.ts';
import { createRawToken, digest } from '../src/lib/cabinet/token.ts';
import { previewBook } from '../src/lib/cabinet/import/apply.ts';
import type { Actor } from '../src/lib/cabinet/access.ts';
import { excelSerial, makeWorkbook, type TestRow } from '../tests/helpers/make-workbook.ts';

const DOMAIN = 'artboard.example';
const GREEN = 'FF00B050';
const RED = 'FFFF0000';

/**
 * Заказы берутся из обезличенного свода книги (`scripts/data/book.json`).
 *
 * Показывать заказчику вымышленную практику бессмысленно: ему нужно видеть
 * свои работы, свои сроки и свои деньги. Настоящая книга в репозиторий не
 * попадает — свод собирает `tools/anonymize-book.mjs`: суммы, сроки, типы
 * и состояния настоящие, имена заменены, темы обобщены (решение Р-141).
 */
interface BookOrder {
  readonly orderedOn: string;
  readonly client: string;
  readonly typeCode: string;
  readonly typeName: string;
  readonly topic: string;
  readonly dueOn: string | null;
  readonly cost: number;
  readonly paid: number;
  readonly state: 'ACTIVE' | 'STOPPED' | 'COMPLETED';
  readonly statusRaw: string | null;
}

const BOOK = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'data', 'book.json'), 'utf8'),
) as { orders: BookOrder[] };

/** Заказчики в порядке первого появления в книге. */
const CLIENTS = [...new Set(BOOK.orders.map((order) => order.client))] as const;

const TYPES = [
  ['dissertation', 'Сопровождение диссертационного исследования', 10],
  ['postgrad', 'Сопровождение поступления и обучения в аспирантуре', 20],
  ['consulting', 'Научный консалтинг и сопровождение до защиты', 30],
  ['research', 'НИР, НИОКР и отчётные материалы', 40],
  ['article', 'Научные публикации и патентные материалы', 50],
  ['diploma', 'Сопровождение выпускной квалификационной работы', 60],
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
  // Показательный клиент — заказчик самой крупной действующей работы:
  // кабинет открывается на том, что идёт сейчас, а не на архиве.
  const showcaseOrder = BOOK.orders
    .filter((order) => order.state === 'ACTIVE')
    .sort((a, b) => b.cost - a.cost)[0]!;
  const showcaseClient = CLIENTS.indexOf(showcaseOrder.client);

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
    where: { id: clientIds[showcaseClient]! },
    data: { userId: clientUser.id },
  });

  // Стенд задаёт исходное состояние целиком, включая сессии: обход
  // прототипа входит под четырьмя ролями и оставляет по сессии за прогон,
  // а экран учётных записей их считает. Без очистки снимок менялся от
  // одного прогона к другому и переставал быть воспроизводимым
  // (решение Р-186).
  const staff = [head.id, manager.id, expertUser.id, clientUser.id];
  await prisma.session.deleteMany({ where: { userId: { in: staff } } });
  await prisma.loginToken.deleteMany({ where: { userId: { in: staff } } });
  await prisma.loginAttempt.deleteMany({
    where: { emailNormalized: { endsWith: `@${DOMAIN}` } },
  });

  await prisma.projectCodeCounter.upsert({
    where: { year: 2026 },
    create: { year: 2026, lastNumber: 0 },
    update: {},
  });

  /** Разброс работ по месяцам, типам и суммам — основа витрин аналитики. */
  /**
   * План работ — это книга заказов. Порядок сохраняется: код проекта
   * выдаётся по году заказа, как и при настоящем переносе.
   */
  const PLAN = BOOK.orders.map((order) => ({
    client: CLIENTS.indexOf(order.client),
    type: order.typeCode,
    topic: order.topic,
    cost: order.cost,
    paid: order.paid,
    orderedOn: new Date(`${order.orderedOn}T09:00:00Z`),
    dueOn: order.dueOn === null ? null : new Date(`${order.dueOn}T09:00:00Z`),
    status:
      order.state === 'ACTIVE' ? ('ACTIVE' as const)
      : order.state === 'STOPPED' ? ('PAUSED' as const)
      : ('COMPLETED' as const),
  }));

  const projectIds: string[] = [];

  /**
   * Короткое описание задачи: чем работа занята по существу. Его пишет
   * куратор в карточке работы, а клиент читает под раскрытием «О работе»
   * (решение Р-190). В наполнении описание задаётся по типу сопровождения
   * — так же, как план работ.
   */
  const SUMMARY: Record<string, string> = {
    dissertation:
      'Сопровождение диссертационного исследования от постановки задачи до предзащиты: методика, расчётная часть, апробация и подготовка материалов к обсуждению на кафедре.',
    article:
      'Подготовка научной статьи к подаче в рецензируемый журнал: структура, расчёты и иллюстрации, редактура под требования издания.',
    postgrad:
      'Сопровождение аспирантской подготовки в пределах семестра: план, реферативная часть, подготовка к сдаче.',
    research:
      'Научно-исследовательская работа по программе заказчика: постановка эксперимента, обработка результатов, отчёт и презентация.',
    consulting:
      'Консультационное сопровождение по задаче заказчика: разбор постановки, рекомендации и сопровождение до защиты.',
    diploma:
      'Сопровождение выпускной квалификационной работы: план и введение, основная часть, нормоконтроль и подготовка к защите.',
  };

  for (const [index, row] of PLAN.entries()) {
    const startedOn = row.orderedOn;
    const dueOn = row.dueOn ?? new Date(startedOn.getTime() + 120 * 86_400_000);
    const closedOn = row.status === 'COMPLETED' ? dueOn : null;
    const year = startedOn.getUTCFullYear();
    const code = `PD-${year}-${String(index + 1).padStart(3, '0')}`;

    // Часть работ ведёт руководитель сам, остальные — менеджер: иначе у
    // третьей роли перечень совпадал бы с перечнем руководителя, и
    // разграничение в прототипе было бы не видно (решение Р-149).
    const curatorId = index % 3 === 0 ? head.id : manager.id;

    const project = await prisma.project.upsert({
      where: { code },
      create: {
        code,
        clientId: clientIds[row.client]!,
        serviceTypeId: typeIds.get(row.type)!,
        title: TYPES.find((type) => type[0] === row.type)![1],
        topic: row.topic,
        managerId: curatorId,
        expertId: index % 3 === 0 ? expertUser.id : null,
        status: row.status,
        source: index % 4 === 0 ? 'IMPORT' : 'WEB',
        startedOn,
        dueOn,
        closedOn,
        summary: SUMMARY[row.type] ?? SUMMARY.consulting!,
      },
      // Куратор переназначается при каждом наполнении: правка распределения
      // в этом файле должна доезжать до снимка.
      update: { managerId: curatorId, summary: SUMMARY[row.type] ?? SUMMARY.consulting! },
      select: { id: true },
    });
    projectIds.push(project.id);

    if (row.cost > 0) {
      const contract = await prisma.contract.upsert({
        where: { projectId: project.id },
        create: {
          projectId: project.id,
          // Номер договора не повторяет внутренний код работы: код с
          // экранов убран, и в номере он всплывал бы снова (Р-189).
          number: `Д-${code.replace(/^PD-/u, '').replace('-', '/')}`,
          signedOn: startedOn,
          totalAmount: money(row.cost),
        },
        // Номер правится и на существующем стенде: прежде он собирался
        // из кода работы, и `update: {}` оставил бы старый (Р-189).
        update: { number: `Д-${code.replace(/^PD-/u, '').replace('-', '/')}` },
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
          paidOn: index % 2 === 0 ? dueOn : null,
        },
      });
    }
  }

  // ── Показательный проект клиента: этапы, материалы, переписка ────────────
  /**
   * Этапы действующих работ.
   *
   * В книге заказов этапов нет — там одна строка на заказ. План работ
   * разворачивается по типу сопровождения: это то, что менеджер завёл бы
   * руками при одобрении заявки, и то, ради чего клиент открывает кабинет.
   * Доля пройденного берётся от доли оплаты: чем больше внесено, тем
   * дальше работа.
   */
  const STAGE_PLAN: Record<string, readonly string[]> = {
    dissertation: [
      'Постановка задачи и план исследования',
      'Обзор источников и методика',
      'Расчётная часть: первая редакция',
      'Апробация: статья и конференция',
      'Подготовка к предзащите',
    ],
    article: ['Структура и черновик', 'Расчёты и иллюстрации', 'Редактура и подача в журнал'],
    postgrad: ['План на семестр', 'Реферативная часть', 'Сдача и проверка'],
    research: ['Программа работ', 'Эксперимент и обработка', 'Отчёт и презентация'],
    consulting: ['Разбор задачи', 'Рекомендации', 'Сопровождение до защиты'],
    diploma: ['План и введение', 'Основная часть', 'Нормоконтроль и защита'],
  };

  for (const [index, row] of PLAN.entries()) {
    if (row.status !== 'ACTIVE') continue;
    const projectId = projectIds[index]!;
    const titles = STAGE_PLAN[row.type] ?? STAGE_PLAN.consulting!;
    const paidShare = row.cost === 0 ? 0 : row.paid / row.cost;
    // Завершёнными считаются этапы, покрытые оплатой; следующий — текущий.
    const doneCount = Math.min(titles.length - 1, Math.floor(paidShare * titles.length));
    const dueOn = row.dueOn ?? new Date(row.orderedOn.getTime() + 120 * 86_400_000);
    const span = (dueOn.getTime() - row.orderedOn.getTime()) / titles.length;

    for (const [position, title] of titles.entries()) {
      const state =
        position < doneCount ? ('DONE' as const)
        : position === doneCount ? (index % 3 === 0 ? ('AWAITING_CLIENT' as const) : ('IN_PROGRESS' as const))
        : ('NOT_STARTED' as const);
      const stageDue = new Date(row.orderedOn.getTime() + span * (position + 1));
      await prisma.stage.upsert({
        where: { projectId_position: { projectId, position: position + 1 } },
        create: {
          projectId,
          position: position + 1,
          title,
          state,
          dueOn: stageDue,
          startedAt: state === 'NOT_STARTED' ? null : new Date(row.orderedOn.getTime() + span * position),
          completedAt: state === 'DONE' ? stageDue : null,
          awaitingClientSince: state === 'AWAITING_CLIENT' ? day(9) : null,
          blockedReason:
            state === 'AWAITING_CLIENT'
              ? 'Ждём исходные данные по разделу: без них расчёт продолжить нельзя.'
              : null,
        },
        update: {},
      });
    }
  }

  const showcase = projectIds[BOOK.orders.indexOf(showcaseOrder)]!;
  const stageRows = [
    {
      title: 'Постановка задачи и план исследования',
      state: 'DONE' as const,
      offset: 150,
      summary:
        'Согласованы предмет, объект и границы исследования; составлен календарный план с контрольными точками.',
    },
    {
      title: 'Обзор источников и методика',
      state: 'DONE' as const,
      offset: 100,
      summary:
        'Разобраны отечественные и зарубежные источники по теме, выбран и обоснован метод расчёта.',
    },
    {
      title: 'Расчётная часть: первая редакция',
      state: 'IN_APPROVAL' as const,
      offset: 20,
      summary:
        'Получены расчётные зависимости и проведена проверка на контрольном примере. Этап закончится вашим согласованием редакции.',
    },
    {
      title: 'Апробация: статья и конференция',
      state: 'AWAITING_CLIENT' as const,
      offset: 10,
      summary:
        'Материалы готовятся к публикации и докладу. Нужен ваш выбор журнала и конференции из подобранного перечня.',
    },
    {
      title: 'Подготовка к предзащите',
      state: 'NOT_STARTED' as const,
      offset: -30,
      summary:
        'Сборка работы целиком, доклад и раздаточные материалы, разбор вопросов к предзащите.',
    },
  ];
  const stageIds: string[] = [];
  for (const [position, stage] of stageRows.entries()) {
    const created = await prisma.stage.upsert({
      where: { projectId_position: { projectId: showcase, position: position + 1 } },
      create: {
        projectId: showcase,
        position: position + 1,
        title: stage.title,
        summary: stage.summary,
        state: stage.state,
        dueOn: day(stage.offset - 30),
        expertId: expertUser.id,
        startedAt: stage.state === 'NOT_STARTED' ? null : day(stage.offset + 20),
        completedAt: stage.state === 'DONE' ? day(stage.offset) : null,
        awaitingClientSince: stage.state === 'AWAITING_CLIENT' ? day(18) : null,
      },
      // Суть выполнения переписывается при каждом наполнении: правка
      // текста в этом файле должна доезжать до снимка.
      update: { summary: stage.summary },
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
    // Замечания, как и переписка, переписываются заново: правка текста здесь
    // должна доезжать до снимка, а не упираться в уже созданные строки.
    await prisma.versionComment.deleteMany({ where: { versionId: version.id } });
    {
      await prisma.versionComment.createMany({
        data: [
          {
            versionId: version.id,
            authorId: manager.id,
            body: 'Принято в работу. Методическую часть смотрим отдельно.',
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

  // Переписка переписывается заново при каждом наполнении: при проверке
  // «создать, если пусто» правка текста в этом файле не доезжала до снимка —
  // строки уже были, и снимок показывал старую редакцию.
  await prisma.message.deleteMany({ where: { projectId: showcase } });
  {
    await prisma.message.createMany({
      data: [
        {
          projectId: showcase,
          authorId: manager.id,
          body: 'Добрый день. Замечания по главе 2 будут завтра, план не сдвигается.',
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

  // ── Очередь уведомлений ─────────────────────────────────────────────────
  // Прототип должен показывать экран состояния очереди не пустым: одна
  // ушедшая строка, одна ждущая и одна недоставленная. Иначе ссылка на
  // экран не появляется в «Требует внимания», и экран не попадает в снимок.
  await prisma.notificationOutbox.deleteMany({ where: { userId: clientUser.id } });
  await prisma.notificationOutbox.createMany({
    data: [
      {
        userId: clientUser.id,
        projectId: showcase,
        channel: 'EMAIL',
        eventKind: 'STAGE_IN_APPROVAL',
        subject: 'Этап «Апробация: статья и конференция» ждёт согласования',
        body: 'Ход работы виден в кабинете.',
        dedupKey: `artboard:stage-approval:${showcase}`,
        state: 'SENT',
        attempts: 1,
        sentAt: day(1),
      },
      {
        userId: clientUser.id,
        projectId: showcase,
        channel: 'EMAIL',
        eventKind: 'DEADLINE_IN_3_DAYS',
        subject: 'Срок этапа «Расчёты и иллюстрации» подходит',
        body: 'Ход работы виден в кабинете.',
        dedupKey: `artboard:deadline:${showcase}`,
        state: 'PENDING',
        attempts: 0,
        lastError: 'канал не настроен',
      },
      {
        userId: clientUser.id,
        projectId: showcase,
        channel: 'TELEGRAM',
        eventKind: 'VERSION_UPLOADED',
        subject: 'Загружена новая версия материала',
        body: 'Ход работы виден в кабинете.',
        dedupKey: `artboard:version:${showcase}`,
        state: 'FAILED',
        attempts: 5,
        lastError: 'привязка Telegram снята',
      },
    ],
  });

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

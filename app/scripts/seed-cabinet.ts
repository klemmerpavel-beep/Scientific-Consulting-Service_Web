/**
 * Наполнение демонстрационного стенда кабинета.
 *
 * Скрипт идемпотентен: повторный запуск не плодит записи. Боевой базы он
 * не касается по устройству — работает только с адресами `@example.org`
 * и отказывается запускаться без явного согласия на адрес, не похожий на
 * стенд разработки.
 *
 * Запуск: npm run seed:cabinet
 */

import { prisma } from '../src/lib/db.ts';
import { createRawToken, digest, loginLink } from '../src/lib/cabinet/token.ts';

const DEMO_DOMAIN = 'example.org';

async function upsertUser(
  email: string,
  fullName: string,
  role: 'CLIENT' | 'EXPERT' | 'MANAGER' | 'HEAD',
) {
  return prisma.user.upsert({
    where: { email },
    create: { email, fullName, role },
    update: { fullName, role, status: 'ACTIVE' },
  });
}

/** Выдать ссылку входа, не отправляя письма: на стенде почты может не быть. */
async function issueLink(userId: string): Promise<string> {
  const token = createRawToken();
  await prisma.loginToken.create({
    data: {
      selector: token.selector,
      verifierHash: digest(token.verifier),
      userId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      requestIp: 'seed',
    },
  });
  return loginLink(token.value);
}

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url) && process.env.SEED_FORCE !== '1') {
    throw new Error(
      'Стенд наполняется только на локальной базе. Для другой базы задайте SEED_FORCE=1 осознанно.',
    );
  }

  const manager = await upsertUser(`manager@${DEMO_DOMAIN}`, 'Клеммер Павел Сергеевич', 'MANAGER');
  const head = await upsertUser(`head@${DEMO_DOMAIN}`, 'Руководитель практики', 'HEAD');
  const expert = await upsertUser(`expert@${DEMO_DOMAIN}`, 'Соловьёв Дмитрий Викторович', 'EXPERT');

  await prisma.expertProfile.upsert({
    where: { userId: expert.id },
    create: {
      userId: expert.id,
      degree: 'к.т.н.',
      specialization: 'надёжность горных машин',
      ndaSignedAt: new Date(),
    },
    update: { ndaSignedAt: new Date() },
  });

  const types = [
    ['dissertation', 'Кандидатская диссертация'],
    ['article', 'Научная статья'],
    ['diploma', 'Дипломная работа'],
    ['research', 'НИР, НИОКР, ОКР'],
    ['postgrad', 'Пакет аспирантуры'],
    ['consulting', 'Научный консалтинг и сопровождение'],
  ] as const;

  for (const [code, name] of types) {
    await prisma.serviceType.upsert({
      where: { code },
      create: { code, name, sortOrder: types.findIndex((t) => t[0] === code) },
      update: { name },
    });
  }

  const existing = await prisma.lead.findFirst({
    where: { contact: `client@${DEMO_DOMAIN}`, projectId: null },
  });
  const lead =
    existing ??
    (await prisma.lead.create({
      data: {
        source: 'postgrad',
        form: 'request',
        name: 'Руденко Иван Сергеевич',
        contactKind: 'email',
        contact: `client@${DEMO_DOMAIN}`,
        topic:
          'Повышение эффективности технического обслуживания и ремонта карьерных экскаваторов',
        speciality: '2.8.6',
        message: 'Нужна помощь по главе 2 и подготовке к предзащите.',
        consentGiven: true,
        consentVersion: '2026-08-21',
        termsAccepted: true,
      },
    }));

  const links = {
    Менеджер: await issueLink(manager.id),
    Руководитель: await issueLink(head.id),
    Эксперт: await issueLink(expert.id),
  };

  process.stdout.write(`Стенд наполнен. Заявка в очереди: ${lead.id}\n\n`);
  for (const [role, link] of Object.entries(links)) {
    process.stdout.write(`${role}: ${link}\n`);
  }
  process.stdout.write(
    '\nУчётная запись клиента заводится при одобрении заявки — ссылку для неё\n' +
      'выдаст повторный запуск скрипта либо форма входа.\n',
  );
  await prisma.$disconnect();
}

main().catch(async (error) => {
  process.stderr.write(`${String(error)}\n`);
  await prisma.$disconnect();
  process.exit(1);
});

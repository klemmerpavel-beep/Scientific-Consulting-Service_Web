/**
 * Заведение учётной записи кабинета и выдача ссылки входа.
 *
 * На боевом сервере после первого выката в кабинете нет ни одной учётной
 * записи: наполнение стенда (`seed:cabinet`) работает только с адресами
 * `@example.org` и до боевой базы не допускается по устройству. Войти было бы
 * некому — этим скриптом заводится первая запись руководителя, а дальше
 * учётные записи клиентов создаются при одобрении заявок.
 *
 * Скрипт выдаёт полные права в кабинете, поэтому доступен только тому, у кого
 * есть доступ к серверу: он запускается внутри контейнера, наружу не смотрит
 * и в приложении никак не вызывается.
 *
 *   node --env-file=.env scripts/grant-role.ts адрес@домен HEAD "Фамилия Имя Отчество"
 *
 * Повторный запуск не плодит записи: адрес — единственный ключ, роль и имя
 * обновляются. Ссылка входа печатается в вывод: пока почта не подключена,
 * письмо отправить некуда, а войти нужно.
 */
import { prisma } from '../src/lib/db.ts';
import { createRawToken, digest, loginLink, normalizeEmail } from '../src/lib/cabinet/token.ts';

const ROLES = ['CLIENT', 'EXPERT', 'MANAGER', 'HEAD'] as const;
type Role = (typeof ROLES)[number];

const email = normalizeEmail(process.argv[2] ?? '');
const role = (process.argv[3] ?? '').toUpperCase() as Role;
const fullName = (process.argv[4] ?? '').trim();

if (email.length === 0 || !ROLES.includes(role) || fullName.length === 0) {
  process.stderr.write(
    'Укажите адрес, роль и имя:\n' +
      '  node --env-file=.env scripts/grant-role.ts адрес@домен HEAD "Фамилия Имя Отчество"\n' +
      `Роли: ${ROLES.join(', ')}.\n`,
  );
  process.exit(1);
}

const user = await prisma.user.upsert({
  where: { email },
  create: { email, fullName, role },
  // Состояние возвращается в ACTIVE намеренно: скриптом пользуются в том
  // числе чтобы вернуть доступ приостановленной записи. Обезличенную запись
  // (ERASED) он не трогает — это отказ субъекта, восстановление невозможно.
  update: { fullName, role },
});

if (user.status === 'ERASED') {
  process.stderr.write(
    `Запись ${email} обезличена по требованию субъекта — вход в неё невозможен.\n`,
  );
  await prisma.$disconnect();
  process.exit(1);
}

if (user.status !== 'ACTIVE') {
  await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
}

const token = createRawToken();
await prisma.loginToken.create({
  data: {
    selector: token.selector,
    verifierHash: digest(token.verifier),
    userId: user.id,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    requestIp: 'cli',
  },
});

process.stdout.write(`Учётная запись: ${email}, роль ${role}, ${fullName}\n`);
process.stdout.write(`Ссылка входа (час, один раз): ${loginLink(token.value)}\n`);
await prisma.$disconnect();

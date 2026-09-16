/**
 * Разовая выдача ссылки входа по адресу почты. Нужна на стенде, где почты
 * нет: письмо отправить некуда, а войти под ролью требуется.
 *
 * Запуск: node --env-file=.env scripts/issue-link.ts адрес@example.org
 */

import { prisma } from '../src/lib/db.ts';
import { createRawToken, digest, loginLink, normalizeEmail } from '../src/lib/cabinet/token.ts';

const email = normalizeEmail(process.argv[2] ?? '');
if (email.length === 0) {
  process.stderr.write('Укажите адрес почты.\n');
  process.exit(1);
}

const user = await prisma.user.findUnique({ where: { email } });
if (user === null) {
  process.stderr.write(`Учётной записи ${email} нет.\n`);
  await prisma.$disconnect();
  process.exit(1);
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
process.stdout.write(`${loginLink(token.value)}\n`);
await prisma.$disconnect();

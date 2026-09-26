/**
 * Служебные маршруты и интеграции (решение Р-246): секреты сравниваются за
 * постоянное время, счётчик напоминаний считает новые строки, рассылка
 * перепроверяет адресата, устаревшее напоминание не повторяется, сценарии
 * выката чистят файлы заявок и не принимают оборванный дамп.
 *
 * Проверки с базой пропускаются без её адреса; запускаются `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 's'.repeat(48);

const ROOT = path.join(import.meta.dirname, '..', '..');
const APP = path.join(ROOT, 'app');
const enabled = Boolean(process.env.DATABASE_URL);

describe('секреты и сценарии выката', () => {
  it('секрет сравнивается за постоянное время и не путает префикс с совпадением', async () => {
    const { sameSecret } = await import('../src/lib/cabinet/token.ts');
    assert.equal(sameSecret('abc', 'abc'), true);
    assert.equal(sameSecret('ab', 'abc'), false);
    assert.equal(sameSecret(null, 'abc'), false);
    for (const file of ['src/app/api/telegram/route.ts', 'src/app/cabinet/api/outbox/route.ts']) {
      const source = readFileSync(path.join(APP, file), 'utf8');
      assert.match(source, /sameSecret\(/u, file);
      assert.doesNotMatch(source, /!== secret/u, file);
    }
  });

  it('сроки хранения: файлы вложений убираются, чистка кабинета без раннего выхода', () => {
    const script = readFileSync(path.join(ROOT, 'deploy/retention.sh'), 'utf8');
    assert.match(script, /LeadAttachment/u);
    assert.match(script, /rm -f "\$DIR\/storage\/\$KEY"/u);
    const beforeCabinet = script.slice(0, script.indexOf('SQL_TOKENS='));
    assert.doesNotMatch(beforeCabinet, /\n\s*exit 0\n/u, 'ранний выход до чистки кабинета');
  });

  it('копия базы требует отметки о завершении дампа и убирает недописанное', () => {
    const script = readFileSync(path.join(ROOT, 'deploy/backup.sh'), 'utf8');
    assert.match(script, /PostgreSQL database dump complete/u);
    assert.match(script, /trap 'rm -f/u);
  });

  it('nginx: предел частоты POST в кабинет и HSTS на статике', () => {
    const conf = readFileSync(path.join(ROOT, 'deploy/nginx.conf'), 'utf8');
    assert.match(conf, /limit_req_zone \$prodisser_cabinet_post/u);
    assert.match(conf, /limit_req zone=prodisser_cabinet_post/u);
    const statics = conf.slice(conf.indexOf('location /_next/static/'), conf.indexOf('location /cabinet'));
    assert.match(statics, /Strict-Transport-Security/u);
  });

  it('compose передаёт приложению признаки зеркала и путь моста, но не пароль', () => {
    const compose = readFileSync(path.join(ROOT, 'deploy/docker-compose.yml'), 'utf8');
    const web = compose.slice(compose.indexOf('\n  web:'), compose.indexOf('\n  migrate:'));
    assert.match(web, /YANDEX_DISK_CONFIGURED: \$\{YANDEX_DISK_PASSWORD:\+yes\}/u);
    assert.doesNotMatch(web, /YANDEX_DISK_PASSWORD: /u);
    assert.match(compose.slice(compose.indexOf('\n  tools:')), /BOOK_PULL_PATH:/u);
  });
});

describe('очередь уведомлений: адресат и повтор', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { dispatch, enqueueDeadlineReminders, retryFailed } = await import('../src/lib/cabinet/outbox.ts');

  const stamp = Date.now();
  const ids: Record<string, string> = {};

  before(async () => {
    const off = await prisma.user.create({
      data: {
        email: `sr-off-${stamp}@example.org`,
        fullName: 'Приостановленный',
        role: 'CLIENT',
        status: 'SUSPENDED',
      },
    });
    const head = await prisma.user.create({
      data: { email: `sr-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' },
    });
    Object.assign(ids, { off: off.id, head: head.id });
  });

  after(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { userId: { in: [ids.off!, ids.head!] } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: ids.head } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.off!, ids.head!] } } });
    await prisma.$disconnect();
  });

  it('приостановленному после постановки письмо не уходит', async () => {
    const row = await prisma.notificationOutbox.create({
      data: {
        userId: ids.off!,
        channel: 'EMAIL',
        eventKind: 'STAGE_IN_APPROVAL',
        subject: 'Этап готов к согласованию',
        body: 'Проект.',
        dedupKey: `sr-${stamp}-off`,
        scheduledAt: new Date(0),
      },
    });
    await dispatch(5000);
    const after = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(after.state, 'FAILED');
    assert.match(after.lastError ?? '', /доступ закрыт/u);
  });

  it('напоминание о сроке старше суток не возвращается в очередь', async () => {
    const row = await prisma.notificationOutbox.create({
      data: {
        userId: ids.head!,
        channel: 'EMAIL',
        eventKind: 'DEADLINE_IN_3_DAYS',
        subject: 'Срок этапа подходит',
        body: 'Проект.',
        dedupKey: `sr-${stamp}-deadline`,
        state: 'FAILED',
        createdAt: new Date(Date.now() - 3 * 86_400_000),
      },
    });
    const head: Actor = {
      id: ids.head!,
      role: 'HEAD',
      status: 'ACTIVE',
      clientProfileId: null,
      expertNdaSignedAt: null,
    };
    await assert.rejects(() => retryFailed(head, row.id), /старше суток/u);
  });

  it('повторный прогон напоминаний не насчитывает уже поставленные', async () => {
    await enqueueDeadlineReminders();
    assert.equal(await enqueueDeadlineReminders(), 0);
  });
});

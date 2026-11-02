/**
 * Согласия куратора отмечает сам куратор (П-12, решение Р-768): права —
 * руководитель и менеджер согласие не ставят, куратор — только своё;
 * форма руководителя согласий не принимает; витрина без текста не
 * отмечается; смена текста делает прежние согласия данными на прежний
 * текст; журнал — отметка, отзыв и смена текста.
 *
 * Текст согласия на витрину — общая настройка практики: прежнее значение
 * возвращается после проверок.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';
import type { CuratorProfileInput } from '../src/lib/cabinet/admin.ts';

process.env.SESSION_SECRET ??= 'c'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('согласия куратора (П-12)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const admin = await import('../src/lib/cabinet/admin.ts');
  const settings = await import('../src/lib/cabinet/practice-settings.ts');
  const consents = await import('../src/lib/cabinet/curator-consents.ts');

  const KEY = 'showcaseConsentText';
  const TEXT_A = `Согласие на витрину кураторов, редакция А ${stamp}.`;
  const TEXT_B = `Согласие на витрину кураторов, редакция Б ${stamp}.`;
  const ids: Record<string, string> = {};
  let previousText: string | null = null;

  const who = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? new Date() : null,
  });
  const head = () => who(ids.head!, 'HEAD');
  const manager = () => who(ids.manager!, 'MANAGER');
  const curator = () => who(ids.curator!, 'EXPERT');
  const marksOf = (userId: string) =>
    prisma.expertProfile.findUnique({
      where: { userId },
      select: { cameraConsentAt: true, showcaseConsentAt: true, showcaseConsentHash: true },
    });
  const journal = (action: string) =>
    prisma.auditEvent.findMany({ where: { action, objectId: ids.curator }, orderBy: { occurredAt: 'asc' } });
  const camera = consents.consentTextHash(consents.CAMERA_CONSENT_TEXT);

  before(async () => {
    previousText = (await prisma.practiceSetting.findUnique({ where: { key: KEY } }))?.value ?? null;
    await prisma.practiceSetting.deleteMany({ where: { key: KEY } });
    const make = (suffix: string, role: Actor['role']) =>
      prisma.user.create({ data: { email: `cc-${suffix}-${stamp}@example.org`, fullName: `Согласия ${suffix}`, role } });
    const [h, m, c, o] = await Promise.all([make('head', 'HEAD'), make('mgr', 'MANAGER'), make('cur', 'EXPERT'), make('oth', 'EXPERT')]);
    await prisma.expertProfile.create({ data: { userId: c.id, degree: 'д.т.н.', ndaSignedAt: new Date() } });
    Object.assign(ids, { head: h.id, manager: m.id, curator: c.id, other: o.id });
  });

  after(async () => {
    const users = [ids.head!, ids.manager!, ids.curator!, ids.other!];
    await prisma.auditEvent.deleteMany({
      where: { OR: [{ actorId: { in: users } }, { objectId: { in: users } }] },
    });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    if (previousText === null) await prisma.practiceSetting.deleteMany({ where: { key: KEY } });
    else await prisma.practiceSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: previousText }, update: { value: previousText } });
  });

  it('руководитель, менеджер и клиент согласие не ставят', async () => {
    for (const actor of [head(), manager(), who(ids.head!, 'CLIENT')]) {
      await assert.rejects(admin.saveOwnConsent(actor, { kind: 'camera', give: true, seenHash: camera }), /сам куратор/u);
    }
    assert.deepEqual(await marksOf(ids.curator!), { cameraConsentAt: null, showcaseConsentAt: null, showcaseConsentHash: null });
  });

  it('форма руководителя согласий не принимает: лишние поля запроса не пишутся', async () => {
    const input = {
      degree: 'д.т.н.',
      academicTitle: '',
      position: '',
      specialtyCode: '',
      specialization: '',
      university: '',
      defaultPayout: '',
      experienceYears: '20',
      cameraConsent: true,
      showcaseConsent: true,
      cameraConsentAt: new Date(),
      showcaseConsentAt: new Date(),
    } as unknown as CuratorProfileInput;
    await admin.saveCuratorProfile(head(), ids.curator!, input);
    const saved = await prisma.expertProfile.findUniqueOrThrow({ where: { userId: ids.curator } });
    assert.equal(saved.experienceYears, 20);
    assert.equal(saved.cameraConsentAt, null);
    assert.equal(saved.showcaseConsentAt, null);
    assert.equal((await journal('CURATOR_CONSENT_GIVEN')).length, 0);
  });

  it('камера: куратор отмечает своё, повтор без новой записи, отзыв — пусто; чужой профиль не трогается', async () => {
    await assert.rejects(
      admin.saveOwnConsent(curator(), { kind: 'camera', give: true, seenHash: 'не та свёртка' }),
      /Текст согласия изменился/u,
    );
    assert.equal((await marksOf(ids.curator!))?.cameraConsentAt, null);
    await admin.saveOwnConsent(curator(), { kind: 'camera', give: true, seenHash: camera });
    const first = (await marksOf(ids.curator!))?.cameraConsentAt;
    assert.ok(first instanceof Date, 'согласие на камеру не отмечено');
    await admin.saveOwnConsent(curator(), { kind: 'camera', give: true, seenHash: camera });
    assert.equal((await marksOf(ids.curator!))?.cameraConsentAt?.getTime(), first.getTime(), 'день согласия сдвинулся');
    assert.equal(await marksOf(ids.other!), null, 'у чужого куратора появился профиль');
    const given = await journal('CURATOR_CONSENT_GIVEN');
    assert.equal(given.length, 1);
    assert.deepEqual(given[0]!.payload, { consent: 'camera', textHash: camera.slice(0, 12) });
    assert.equal(given[0]!.actorId, ids.curator);

    await admin.saveOwnConsent(curator(), { kind: 'camera', give: false });
    assert.equal((await marksOf(ids.curator!))?.cameraConsentAt, null);
    const withdrawn = await journal('CURATOR_CONSENT_WITHDRAWN');
    assert.equal(withdrawn.length, 1);
    assert.deepEqual(withdrawn[0]!.payload, { consent: 'camera' });
    // Отзыв без отметки — без записи.
    await admin.saveOwnConsent(curator(), { kind: 'camera', give: false });
    assert.equal((await journal('CURATOR_CONSENT_WITHDRAWN')).length, 1);
  });

  it('куратор без профиля отмечает согласие — профиль заводится на нём самом', async () => {
    await admin.saveOwnConsent(who(ids.other!, 'EXPERT'), { kind: 'camera', give: true, seenHash: camera });
    assert.ok((await marksOf(ids.other!))?.cameraConsentAt instanceof Date);
    assert.equal((await marksOf(ids.curator!))?.cameraConsentAt, null);
  });

  it('витрина без текста: отметка не принимается, у куратора её нет', async () => {
    assert.equal(await settings.showcaseConsentText(), '');
    await assert.rejects(
      admin.saveOwnConsent(curator(), { kind: 'showcase', give: true, seenHash: consents.consentTextHash('') }),
      /ещё не утверждён/u,
    );
    const marks = await marksOf(ids.curator!);
    assert.equal(marks?.showcaseConsentAt, null);
    assert.equal(consents.showcaseOffered(marks, await settings.showcaseConsentText()), false);
  });

  it('текст вносит только руководитель; длиннее предела — отказ', async () => {
    await assert.rejects(settings.saveShowcaseConsentText(manager(), TEXT_A), /не разрешено/u);
    await assert.rejects(settings.saveShowcaseConsentText(curator(), TEXT_A), /не разрешено/u);
    await assert.rejects(settings.saveShowcaseConsentText(head(), 'а'.repeat(4001)), /не длиннее 4000 знаков/u);
    assert.equal(await settings.showcaseConsentText(), '');
  });

  it('согласие на текст А действует; после смены на Б — дано на прежний текст, до новой отметки не действует', async () => {
    await settings.saveShowcaseConsentText(head(), `  ${TEXT_A}\r\n`);
    assert.equal(await settings.showcaseConsentText(), TEXT_A);
    const hashA = consents.consentTextHash(TEXT_A);
    await admin.saveOwnConsent(curator(), { kind: 'showcase', give: true, seenHash: hashA });
    const onA = await marksOf(ids.curator!);
    assert.equal(onA?.showcaseConsentHash, hashA);
    assert.equal(consents.showcaseConsentValid(onA, await settings.showcaseConsentText()), true);

    await settings.saveShowcaseConsentText(head(), TEXT_B);
    const textB = await settings.showcaseConsentText();
    assert.equal(consents.showcaseState(onA, textB), 'stale');
    assert.equal(consents.showcaseConsentValid(onA, textB), false);
    // Экран открыт на тексте А, а сохраняется уже Б — отказ, отметка прежняя.
    await assert.rejects(
      admin.saveOwnConsent(curator(), { kind: 'showcase', give: true, seenHash: hashA }),
      /Текст согласия изменился/u,
    );
    assert.deepEqual(await marksOf(ids.curator!), onA);

    const hashB = consents.consentTextHash(TEXT_B);
    await admin.saveOwnConsent(curator(), { kind: 'showcase', give: true, seenHash: hashB });
    const onB = await marksOf(ids.curator!);
    assert.equal(onB?.showcaseConsentHash, hashB);
    assert.ok(onB!.showcaseConsentAt!.getTime() >= onA!.showcaseConsentAt!.getTime());
    assert.equal(consents.showcaseConsentValid(onB, textB), true);

    const saved = await prisma.auditEvent.findMany({
      where: { action: 'SHOWCASE_CONSENT_TEXT_SAVED', actorId: ids.head },
      orderBy: { occurredAt: 'asc' },
    });
    assert.equal(saved.length, 2);
    assert.deepEqual(saved[1]!.payload, {
      from: hashA.slice(0, 12),
      to: hashB.slice(0, 12),
      chars: TEXT_B.length,
      text: TEXT_B,
    });
    const given = (await journal('CURATOR_CONSENT_GIVEN')).filter(
      (row) => (row.payload as { consent: string }).consent === 'showcase',
    );
    assert.deepEqual(
      given.map((row) => (row.payload as { textHash: string }).textHash),
      [hashA.slice(0, 12), hashB.slice(0, 12)],
    );
  });

  it('текст снят — прежняя отметка не действует, но отозвать её можно', async () => {
    await settings.saveShowcaseConsentText(head(), '');
    const marks = await marksOf(ids.curator!);
    assert.equal(consents.showcaseConsentValid(marks, ''), false);
    assert.equal(consents.showcaseOffered(marks, ''), true);
    await admin.saveOwnConsent(curator(), { kind: 'showcase', give: false });
    assert.deepEqual(await marksOf(ids.curator!), {
      cameraConsentAt: null,
      showcaseConsentAt: null,
      showcaseConsentHash: null,
    });
    const last = (await journal('CURATOR_CONSENT_WITHDRAWN')).at(-1);
    assert.deepEqual(last?.payload, { consent: 'showcase' });
  });

  it('руководитель видит отметку и день в перечне кураторов', async () => {
    await admin.saveOwnConsent(curator(), { kind: 'camera', give: true, seenHash: camera });
    const row = (await admin.curatorProfiles(head())).find((user) => user.id === ids.curator);
    assert.ok(row?.expertProfile?.cameraConsentAt instanceof Date);
    assert.match(consents.consentStatusForHead('camera', row!.expertProfile!, ''), /^куратор отметил согласие \d{1,2} [а-я]+ \d{4}$/u);
    const own = await admin.ownCuratorProfile(curator());
    assert.ok(own?.cameraConsentAt instanceof Date);
  });
});

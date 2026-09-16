import { redirect } from 'next/navigation';

import Shell from '../../../components/cabinet/Shell';
import { SANS } from '../../../components/cabinet/tokens';
import { Button, Card, Heading, Mono, Notice, Text } from '../../../components/cabinet/ui';
import { createTelegramBindLink } from '../../../lib/cabinet/auth';
import { currentActor } from '../../../lib/cabinet/session';
import { prisma } from '../../../lib/db';
import { dropTelegram, saveNotificationChannels } from '../actions';

export const dynamic = 'force-dynamic';

export default async function SettingsScreen({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');

  const [params, user] = await Promise.all([
    searchParams,
    prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: {
        email: true,
        notifyEmail: true,
        notifyTelegram: true,
        telegramChatId: true,
        consentAcceptedAt: true,
      },
    }),
  ]);

  const bound = user.telegramChatId !== null;
  const bindLink = bound ? null : await createTelegramBindLink(actor.id);

  const checkbox = { width: 18, height: 18 };

  return (
    <Shell actor={actor} current="/cabinet/settings">
      <div style={{ maxWidth: 680 }}>
        <Mono>Уведомления</Mono>
        <Heading level={1} style={{ margin: '12px 0 12px' }}>
          Как сообщать о ходе работы
        </Heading>
        <Text style={{ marginBottom: 24 }}>
          Уведомления приходят о том, что требует действия: этап ждёт материалов, материал готов
          к согласованию, эксперт оставил замечание, приближается срок. Переписка из кабинета
          наружу не пересылается — её содержание остаётся внутри контура.
        </Text>

        {params.saved === undefined ? null : (
          <div style={{ marginBottom: 20 }}>
            <Notice>Настройки сохранены.</Notice>
          </div>
        )}

        <Card style={{ marginBottom: 20 }}>
          <form action={saveNotificationChannels} style={{ display: 'grid', gap: 16 }}>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                name="notifyEmail"
                defaultChecked={user.notifyEmail}
                style={checkbox}
              />
              <span style={{ fontFamily: SANS, fontSize: 15 }}>
                Электронная почта — <strong>{user.email}</strong>
              </span>
            </label>

            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                name="notifyTelegram"
                defaultChecked={user.notifyTelegram}
                disabled={!bound}
                style={checkbox}
              />
              <span style={{ fontFamily: SANS, fontSize: 15 }}>
                Telegram{bound ? '' : ' — сначала привяжите аккаунт'}
              </span>
            </label>

            <div>
              <Button>Сохранить</Button>
            </div>
          </form>
        </Card>

        <Card>
          <Heading level={3} style={{ marginBottom: 12 }}>
            Telegram
          </Heading>
          {bound ? (
            <>
              <Text style={{ marginBottom: 16 }}>Аккаунт привязан, уведомления доходят.</Text>
              <form action={dropTelegram}>
                <Button tone="quiet">Отвязать</Button>
              </form>
            </>
          ) : bindLink === null ? (
            <Text muted>
              Канал не настроен на стороне сервиса. Пока уведомления приходят только почтой.
            </Text>
          ) : (
            <>
              <Text style={{ marginBottom: 16 }}>
                Откройте ссылку и нажмите «Начать» — бот запомнит, куда присылать уведомления.
                Ссылка действует час и срабатывает один раз; войти по ней в кабинет нельзя.
              </Text>
              <a
                href={bindLink}
                className="cab-btn cab-btn-primary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: 44,
                  padding: '0 20px',
                  borderRadius: 999,
                  background: 'var(--pd-accent)',
                  color: 'var(--pd-ink-inverse)',
                  fontFamily: SANS,
                  fontSize: 15,
                  fontWeight: 500,
                }}
              >
                Привязать Telegram
              </a>
            </>
          )}
        </Card>

        {user.consentAcceptedAt === null ? null : (
          <Text muted size={13} style={{ marginTop: 24 }}>
            Согласие на обработку персональных данных принято{' '}
            {user.consentAcceptedAt.toISOString().slice(0, 10)}. Отозвать его и потребовать
            удаления данных можно письмом менеджеру.
          </Text>
        )}
      </div>
    </Shell>
  );
}

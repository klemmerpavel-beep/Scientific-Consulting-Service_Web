import { redirect } from 'next/navigation';

import Shell from '../../../components/cabinet/Shell';
import {
  Button,
  ButtonLink,
  Card,
  Checkbox,
  Form,
  FormActions,
  Heading,
  Narrow,
  Notice,
  ScreenHead,
  Text,
  formatDate,
} from '../../../components/cabinet/ui';
import { createTelegramBindLink } from '../../../lib/cabinet/auth';
import { ownChannels } from '../../../lib/cabinet/admin';
import { currentActor } from '../../../lib/cabinet/session';
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
    ownChannels(actor),
  ]);

  const bound = user.telegramChatId !== null;
  const bindLink = bound ? null : await createTelegramBindLink(actor.id);

  return (
    <Shell actor={actor} current="/cabinet/settings">
      <Narrow width={680}>
        <ScreenHead title="Как сообщать о ходе работы" />
        <Text style={{ marginBottom: 24 }}>
          Уведомления приходят о том, что требует действия: этап ждёт материалов, материал готов к
          согласованию, приближается срок. Содержание переписки наружу не пересылается.
        </Text>

        {params.saved === undefined ? null : (
          <div style={{ marginBottom: 20 }}>
            <Notice>Настройки сохранены.</Notice>
          </div>
        )}

        <Card style={{ marginBottom: 20 }}>
          <Form action={saveNotificationChannels}>
            <Checkbox
              name="notifyEmail"
              defaultChecked={user.notifyEmail}
              label={
                <>
                  Электронная почта — <strong>{user.email}</strong>
                </>
              }
            />
            <Checkbox
              name="notifyTelegram"
              defaultChecked={user.notifyTelegram}
              disabled={!bound}
              label={`Telegram${bound ? '' : ' — сначала привяжите аккаунт'}`}
            />
            <FormActions>
              <Button>Сохранить</Button>
            </FormActions>
          </Form>
        </Card>

        <Card>
          <Heading level={2} size={3} style={{ marginBottom: 12 }}>
            Telegram
          </Heading>
          {bound ? (
            <>
              <Text style={{ marginBottom: 16 }}>Аккаунт привязан, уведомления доходят.</Text>
              <Form action={dropTelegram} inline>
                <Button tone="quiet">Отвязать</Button>
              </Form>
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
              <ButtonLink href={bindLink} tone="primary">
                Привязать Telegram
              </ButtonLink>
            </>
          )}
        </Card>

        {user.consentAcceptedAt === null ? null : (
          <Text muted size={13} style={{ marginTop: 24 }}>
            Согласие на обработку персональных данных принято{' '}
            {formatDate(user.consentAcceptedAt)}. Отозвать его и потребовать удаления данных
            можно письмом менеджеру.
          </Text>
        )}
      </Narrow>
    </Shell>
  );
}

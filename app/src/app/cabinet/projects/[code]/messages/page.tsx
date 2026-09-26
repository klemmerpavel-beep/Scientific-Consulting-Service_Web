import { notFound, redirect } from 'next/navigation';

import ActionError from '../../../../../components/cabinet/ActionError';
import Shell from '../../../../../components/cabinet/Shell';
import {
  Button,
  Card,
  Field,
  Form,
  FormActions,
  Narrow,
  ScreenHead,
  Thread,
} from '../../../../../components/cabinet/ui';
import { can } from '../../../../../lib/cabinet/access';
import { listMessages, markRead } from '../../../../../lib/cabinet/messages';
import { projectByCode } from '../../../../../lib/cabinet/queries';
import { currentActor } from '../../../../../lib/cabinet/session';
import { postMessage } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function MessagesScreen({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');

  const { code } = await params;
  const project = await projectByCode(actor, decodeURIComponent(code));
  if (project === null) notFound();

  const ref = {
    id: project.id,
    clientId: project.clientId,
    managerId: project.managerId,
    expertId: project.expertId,
  };
  // Эксперту канал недоступен: чужой раздел не отличается от несуществующего.
  if (!can(actor, 'MESSAGE_READ', ref)) notFound();

  const messages = await listMessages(actor, project.id);
  // Открытие экрана и есть прочтение: отдельная кнопка «отметить прочитанным»
  // ничего не добавляет, а счётчик без неё не обнулялся бы.
  await markRead(actor, project.id);

  const mayModerate = can(actor, 'COMMENT_MODERATE', ref);
  const forClient = actor.role === 'CLIENT';
  // Подзаголовок называет собеседника, а не повторяет название работы:
  // оно уже стоит строкой возврата над заголовком (решение Р-190).
  const counterpart = forClient
    ? `с куратором · ${project.manager.fullName}`
    : `с клиентом · ${project.client.fullName}`;

  return (
    <Shell actor={actor} current="/cabinet/projects">
      <Narrow width={780}>
        <ScreenHead
          backHref={`/cabinet/projects/${project.code}`}
          backLabel={project.title}
          title="Переписка"
          note={counterpart}
        />

        <ActionError id={(await searchParams).error} />

        <Card>
          <Thread
            messages={messages}
            viewer={actor}
            flagContacts={mayModerate}
            empty={
              forClient
                ? 'Переписки пока нет — напишите куратору, он ответит в рабочее время.'
                : 'Переписки пока нет.'
            }
          />

          <Form
            action={postMessage}
            style={{
              marginTop: 24,
              paddingTop: 20,
              borderTop: '1px solid var(--pd-divider)',
            }}
          >
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="code" value={project.code} />
            <Field
              label="Новое сообщение"
              name="body"
              multiline
              required
              placeholder={forClient ? 'Написать куратору' : 'Написать клиенту'}
              hint="Переписка ведётся внутри кабинета: она остаётся при работе и доступна обеим сторонам."
            />
            <FormActions>
              <Button>Отправить</Button>
            </FormActions>
          </Form>
        </Card>
      </Narrow>
    </Shell>
  );
}

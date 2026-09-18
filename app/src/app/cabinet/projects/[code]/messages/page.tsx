import { notFound, redirect } from 'next/navigation';

import Shell from '../../../../../components/cabinet/Shell';
import { MONO } from '../../../../../components/cabinet/tokens';
import {
  Button,
  Card,
  Field,
  Heading,
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
}: {
  params: Promise<{ code: string }>;
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

  return (
    <Shell actor={actor} current="/cabinet/projects">
      <div style={{ maxWidth: 780 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <a
            href={`/cabinet/projects/${project.code}`}
            className="cab-mark"
            style={{ fontFamily: MONO, fontSize: 12 }}
          >
            {project.code}
          </a>
        </div>

        <Heading level={1} style={{ margin: '16px 0 24px' }}>
          Переписка: {project.title}
        </Heading>

        <Card>
          <Thread messages={messages} viewer={actor} flagContacts={mayModerate} />

          <form
            action={postMessage}
            style={{
              display: 'grid',
              gap: 12,
              marginTop: 24,
              paddingTop: 20,
              borderTop: '1px solid var(--pd-divider)',
            }}
          >
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="code" value={project.code} />
            <Field label="Сообщение" name="body" multiline required />
            <div>
              <Button>Отправить</Button>
            </div>
          </form>
        </Card>
      </div>
    </Shell>
  );
}

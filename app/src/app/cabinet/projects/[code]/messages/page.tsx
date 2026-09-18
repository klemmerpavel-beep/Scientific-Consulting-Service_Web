import { notFound, redirect } from 'next/navigation';

import Shell from '../../../../../components/cabinet/Shell';
import { MONO, SANS } from '../../../../../components/cabinet/tokens';
import {
  Button,
  Card,
  Chip,
  Field,
  Heading,
  Text,
  formatDate,
} from '../../../../../components/cabinet/ui';
import { can } from '../../../../../lib/cabinet/access';
import { listMessages, markRead } from '../../../../../lib/cabinet/messages';
import { projectByCode } from '../../../../../lib/cabinet/queries';
import { currentActor } from '../../../../../lib/cabinet/session';
import { postMessage } from '../../../actions';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = {
  CLIENT: 'клиент',
  EXPERT: 'эксперт',
  MANAGER: 'куратор',
  HEAD: 'руководитель',
};

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
          {messages.length === 0 ? (
            <Text muted>Сообщений пока нет.</Text>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 18 }}>
              {messages.map((message) => {
                const mine = message.author.id === actor.id;
                return (
                  <li
                    key={message.id}
                    style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}
                  >
                    <div style={{ maxWidth: '78%' }}>
                      <div
                        style={{
                          padding: '12px 16px',
                          borderRadius: 14,
                          background: mine ? 'var(--pd-accent-tint)' : 'var(--pd-surface-quiet)',
                          border: `1px solid ${mine ? 'var(--pd-accent-edge)' : 'var(--pd-border)'}`,
                          fontFamily: SANS,
                          fontSize: 15,
                          lineHeight: 1.6,
                          color: 'var(--pd-ink)',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {message.body}
                      </div>
                      <div
                        style={{
                          marginTop: 6,
                          display: 'flex',
                          gap: 8,
                          alignItems: 'center',
                          justifyContent: mine ? 'flex-end' : 'flex-start',
                          flexWrap: 'wrap',
                        }}
                      >
                        <Text muted size={13}>
                          {mine ? 'Вы' : message.author.fullName} ·{' '}
                          {ROLE_LABEL[message.author.role] ?? message.author.role} ·{' '}
                          {formatDate(message.createdAt)}
                        </Text>
                        {mayModerate && message.containsContactHint ? (
                          <Chip tone="warn">похоже на передачу контактов</Chip>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

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

import { notFound } from 'next/navigation';

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
  formatDate,
} from '../../../../../components/cabinet/ui';
import { can } from '../../../../../lib/cabinet/access';
import { listMessages, markRead } from '../../../../../lib/cabinet/messages';
import { projectByCode } from '../../../../../lib/cabinet/queries';
import { requireActor } from '../../../../../lib/cabinet/session';
import { draftsFor, draftText } from '../../../../../lib/cabinet/message-drafts';
import { now as clockNow } from '../../../../../lib/cabinet/clock';
import { postMessage } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function MessagesScreen({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string; draft?: string }>;
}) {
  const actor = await requireActor(`/cabinet/projects/${(await params).code}/messages`);

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
  // Заготовка подставляет текст в поле; отправляет только «Отправить»
  // (требование Т-20, решение Р-316). Этап — текущий: первый не
  // завершённый.
  const sp = await searchParams;
  const current = project.stages.find((stage) => stage.state !== 'DONE') ?? null;
  // Напоминание о материалах называет этап, который ждёт клиента (М-21,
  // Р-317); остальные заготовки — текущий этап.
  const awaiting = project.stages.find((stage) => stage.state === 'AWAITING_CLIENT') ?? null;
  const draft = draftText(actor.role, sp.draft, {
    stage: (sp.draft === 'remind' ? (awaiting ?? current) : current)?.title ?? null,
    today: formatDate(clockNow()) ?? '',
  });
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

        <ActionError id={sp.error} />

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
              defaultValue={draft ?? undefined}
            />
            {/* Файлы — в материалах, заготовки — ссылками на этот же экран:
                ни одна не отправляет сообщение сама (Т-20, Р-316, Р-178). */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline', marginTop: 4 }}>
              <a className="cab-mark" href={`/cabinet/projects/${project.code}/materials`} style={{ fontSize: 14 }}>
                Файлы прикладывайте в материалах работы
              </a>
              {draftsFor(actor.role).map((item) => (
                <a
                  key={item.key}
                  className="cab-mark"
                  href={`/cabinet/projects/${project.code}/messages?draft=${item.key}#body`}
                  style={{ fontSize: 14 }}
                >
                  {item.label}
                </a>
              ))}
            </div>
            <FormActions>
              <Button>Отправить</Button>
            </FormActions>
          </Form>
        </Card>
      </Narrow>
    </Shell>
  );
}

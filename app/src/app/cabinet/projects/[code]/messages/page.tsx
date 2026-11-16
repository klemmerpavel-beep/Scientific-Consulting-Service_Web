import type { Metadata } from 'next';
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
  Tabs,
  Thread,
  formatDate,
} from '../../../../../components/cabinet/ui';
import { can } from '../../../../../lib/cabinet/access';
import {
  MESSAGE_MAX,
  curatorUnread,
  internalUnread,
  listCurator,
  listInternal,
  listMessages,
  markRead,
  readCurator,
  readInternal,
} from '../../../../../lib/cabinet/messages';
import { formDraft } from '../../../../../lib/cabinet/flash';
import { projectByCode } from '../../../../../lib/cabinet/queries';
import { requireActor } from '../../../../../lib/cabinet/session';
import { draftsFor, draftText, withTemplate } from '../../../../../lib/cabinet/message-drafts';
import { messageFormTexts } from '../../../../../lib/cabinet/staff-texts';
import { trancheForReminder } from '../../../../../lib/cabinet/finance';
import { THREAD_WINDOW, sliceWindow, threadWindow } from '../../../../../lib/cabinet/thread-window';
import { moscowToday, now as clockNow } from '../../../../../lib/cabinet/clock';
import { insertMessageTemplate, postCuratorMessage, postInternalMessage, postMessage } from '../../../actions';

export const metadata: Metadata = { title: 'Переписка' };

export const dynamic = 'force-dynamic';

/** Предел в подсказке — с разрядом, как в тексте отказа (решение Р-722). */
const LIMIT = MESSAGE_MAX.toLocaleString('ru-RU');

/** Ссылка в подсказке поля — подчёркнута, как ссылка в сплошном тексте (Р-168). */
const HINT_LINK = { textDecoration: 'underline', textUnderlineOffset: 3, textDecorationThickness: 1 } as const;

export default async function MessagesScreen({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string; draft?: string; tab?: string; tranche?: string; show?: string }>;
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
  // Ветка «куратор — менеджер» (Н-6, решение Р-935): куратору экран
  // переписки открыт ради неё одной — в переписку с клиентом и во
  // внутреннюю ветку он не входит (Р-150, Р-336), и без назначения работа
  // для него не отличается от несуществующей. Практике ветка видна, пока
  // у работы есть куратор.
  const mayClientThread = can(actor, 'MESSAGE_READ', ref);
  const mayCurator = can(actor, 'CURATOR_MESSAGE', ref) && project.expertId !== null;
  if (!mayClientThread && !mayCurator) notFound();

  // Внутренняя переписка по работе — вкладка менеджера работы и
  // руководителя; клиенту и куратору её нет (требование РК-07, решение
  // Р-336).
  const mayInternal = can(actor, 'INTERNAL_MESSAGE', ref);
  const askedTab = (await searchParams).tab;
  const curatorTab = mayCurator && (!mayClientThread || askedTab === 'curator');
  const internalTab = !curatorTab && mayInternal && askedTab === 'internal';
  const base = `/cabinet/projects/${project.code}/messages`;

  if (curatorTab) {
    const shownHere = threadWindow((await searchParams).show);
    const window = sliceWindow(await listCurator(actor, project.id, { last: shownHere + 1 }), shownHere);
    await readCurator(actor, project.id);
    const back = (await formDraft((await searchParams).error)) ?? {};
    const forCurator = actor.role === 'EXPERT';
    const internalCount = mayInternal ? await internalUnread(actor, project.id) : 0;
    return (
      <Shell actor={actor} current="/cabinet/projects">
        <Narrow width={780}>
          <ScreenHead
            backHref={`/cabinet/projects/${project.code}`}
            backLabel={project.title}
            title="Переписка"
            note={forCurator ? 'с менеджером работы; клиент её не видит' : 'с куратором работы; клиент её не видит'}
          />
          <ActionError id={(await searchParams).error} />
          {mayClientThread ? (
            <Tabs
              label="Ветки переписки"
              items={[
                { href: base, label: 'С клиентом', active: false },
                ...(mayInternal
                  ? [{ href: `${base}?tab=internal`, label: internalCount === 0 ? 'Внутренняя' : `Внутренняя · ${internalCount}`, active: false }]
                  : []),
                { href: `${base}?tab=curator`, label: 'С куратором', active: true },
              ]}
            />
          ) : null}
          <Card>
            <Thread
              messages={window.messages}
              viewer={actor}
              earlierHref={window.earlier ? `${base}?tab=curator&show=${shownHere + THREAD_WINDOW}` : undefined}
              empty={
                forCurator
                  ? 'Переписки пока нет — задайте вопрос менеджеру, он ответит в рабочее время.'
                  : 'Переписки с куратором пока нет.'
              }
            />
            <Form
              action={postCuratorMessage}
              style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--pd-divider)' }}
            >
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="code" value={project.code} />
              <Field
                label={forCurator ? 'Сообщение менеджеру' : 'Сообщение куратору'}
                name="body"
                multiline
                required
                maxLength={MESSAGE_MAX}
                placeholder={forCurator ? 'Вопрос по заданию, сроку или материалам' : 'Ответ или уточнение по заданию'}
                hint={`Клиент этой переписки не видит. До ${LIMIT} знаков; файлы — в материалах работы.`}
                defaultValue={back.body}
              />
              <FormActions>
                <Button>{forCurator ? 'Отправить менеджеру' : 'Отправить куратору'}</Button>
              </FormActions>
            </Form>
          </Card>
        </Narrow>
      </Shell>
    );
  }

  // Лента открывается на последних ста сообщениях; ранние — ссылкой над
  // ней, каждое нажатие добавляет ещё сто (решение Р-636).
  const shown = threadWindow((await searchParams).show);
  const { messages, earlier } = sliceWindow(
    internalTab
      ? await listInternal(actor, project.id, { last: shown + 1 })
      : await listMessages(actor, project.id, { last: shown + 1 }),
    shown,
  );
  const earlierHref = earlier
    ? `/cabinet/projects/${project.code}/messages?${internalTab ? 'tab=internal&' : ''}show=${shown + THREAD_WINDOW}`
    : undefined;
  // Открытие экрана и есть прочтение: отдельная кнопка «отметить прочитанным»
  // ничего не добавляет, а счётчик без неё не обнулялся бы.
  if (internalTab) await readInternal(actor, project.id);
  else await markRead(actor, project.id);
  const internalNew = mayInternal && !internalTab ? await internalUnread(actor, project.id) : 0;
  const curatorNew = mayCurator ? await curatorUnread(actor, project.id) : 0;
  // Набранное возвращается в поле своей ветки: после отказа и после выбора
  // заготовки (Р-336 и решение Р-722).
  const formBack = (await formDraft((await searchParams).error)) ?? {};
  const internalDraft = internalTab ? formBack : {};

  const mayModerate = can(actor, 'COMMENT_MODERATE', ref);
  const forClient = actor.role === 'CLIENT';
  // Заготовка подставляет текст в поле; отправляет только кнопка отправки
  // (требование Т-20, решения Р-316, Р-726). Этап — текущий: первый не
  // завершённый.
  const sp = await searchParams;
  const current = project.stages.find((stage) => stage.state !== 'DONE') ?? null;
  // Напоминание о материалах называет этап, который ждёт клиента (М-21,
  // Р-317); остальные заготовки — текущий этап.
  const awaiting = project.stages.find((stage) => stage.state === 'AWAITING_CLIENT') ?? null;
  // Напоминание об оплате называет транш из «Должников» (РК-10, Р-345).
  const tranche =
    sp.draft === 'payment' && sp.tranche !== undefined ? await trancheForReminder(actor, project.id, sp.tranche) : null;
  const draft = draftText(actor.role, sp.draft, {
    stage: (sp.draft === 'remind' ? (awaiting ?? current) : current)?.title ?? null,
    // Сегодня — московский день: ночью черновик ставил вчерашнюю дату (Р-473).
    today: formatDate(moscowToday(clockNow())) ?? '',
    payment: tranche === null ? null : { title: tranche.title, date: formatDate(tranche.plannedDate) },
  });
  // Заготовка ставится перед набранным текстом и не стирает его (Р-722).
  const fieldText = withTemplate(draft, internalTab ? undefined : formBack.body);
  const templates = draftsFor(actor.role);
  // Поле и кнопка называют адресата: клиенту или руководителю (менеджеру),
  // которого клиент не видит (решение Р-726).
  const form = messageFormTexts(actor.role, internalTab ? 'internal' : 'client');
  // Подзаголовок называет собеседника, а не повторяет название работы:
  // оно уже стоит строкой возврата над заголовком (решение Р-190).
  const counterpart = forClient
    ? 'с менеджером'
    : internalTab
      ? 'внутренняя: менеджер работы и руководитель; клиент её не видит'
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

        {mayInternal || mayCurator ? (
          <Tabs
            label="Ветки переписки"
            items={[
              { href: base, label: 'С клиентом', active: !internalTab },
              ...(mayInternal
                ? [
                    {
                      href: `${base}?tab=internal`,
                      label: internalNew === 0 ? 'Внутренняя' : `Внутренняя · ${internalNew}`,
                      active: internalTab,
                    },
                  ]
                : []),
              ...(mayCurator
                ? [{ href: `${base}?tab=curator`, label: curatorNew === 0 ? 'С куратором' : `С куратором · ${curatorNew}`, active: false }]
                : []),
            ]}
          />
        ) : null}

        {internalTab ? (
          <Card>
            <Thread
              messages={messages}
              viewer={actor}
              earlierHref={earlierHref}
              empty="Внутренней переписки пока нет."
            />
            <Form
              action={postInternalMessage}
              style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--pd-divider)' }}
            >
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="code" value={project.code} />
              <Field
                label={form.label}
                name="body"
                multiline
                required
                maxLength={MESSAGE_MAX}
                placeholder={actor.role === 'HEAD' ? 'Написать менеджеру работы' : 'Написать руководителю'}
                hint={`Клиент и куратор этой переписки не видят. До ${LIMIT} знаков; файлы — в материалах работы.`}
                defaultValue={internalDraft.body}
              />
              <FormActions>
                <Button>{form.button}</Button>
              </FormActions>
            </Form>
          </Card>
        ) : (
        <Card>
          <Thread
            messages={messages}
            viewer={actor}
            earlierHref={earlierHref}
            flagContacts={mayModerate}
            empty={
              forClient
                ? 'Переписки пока нет — напишите менеджеру, он ответит в рабочее время.'
                : 'Переписки пока нет.'
            }
          />

          <Form
            action={postMessage}
            id="message"
            style={{
              marginTop: 24,
              paddingTop: 20,
              borderTop: '1px solid var(--pd-divider)',
            }}
          >
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="code" value={project.code} />
            {/* Отказ отправки — у формы, набранное — в поле (Р-722). */}
            <ActionError id={sp.error} slot="message" />
            <Field
              label={form.label}
              name="body"
              multiline
              required
              maxLength={MESSAGE_MAX}
              placeholder={forClient ? 'Написать менеджеру' : 'Написать клиенту'}
              hint={
                <>
                  {`Переписка ведётся внутри кабинета: она остаётся при работе и доступна обеим сторонам. До ${LIMIT} знаков; файлы — `}
                  <a href={`/cabinet/projects/${project.code}/materials`} style={HINT_LINK}>
                    в материалах работы
                  </a>
                  .
                </>
              }
              defaultValue={fieldText}
            />
            {/* Заготовки — кнопки своего действия: текст поля уходит вместе
                с выбором и возвращается после заготовки; сообщение не
                отправляется — только кнопка отправки (Т-20, Р-316, Р-178,
                решение Р-722). Проверка поля снята: заготовке пустое поле
                не помеха. */}
            {templates.length === 0 ? null : (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline', marginTop: 4 }}>
                {templates.map((item) => (
                  <Button
                    key={item.key}
                    tone="link"
                    formAction={insertMessageTemplate.bind(null, item.key)}
                    formNoValidate
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            )}
            <FormActions>
              <Button>{form.button}</Button>
            </FormActions>
          </Form>
        </Card>
        )}
      </Narrow>
    </Shell>
  );
}

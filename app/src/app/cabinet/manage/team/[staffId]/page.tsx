import { notFound, redirect } from 'next/navigation';

import ActionError from '../../../../../components/cabinet/ActionError';
import Shell from '../../../../../components/cabinet/Shell';
import { Button, Card, Field, Form, FormActions, Narrow, ScreenHead, Thread } from '../../../../../components/cabinet/ui';
import { formDraft } from '../../../../../lib/cabinet/flash';
import { listStaffThread, readStaffThread, staffThreads } from '../../../../../lib/cabinet/messages';
import { THREAD_WINDOW, sliceWindow, threadWindow } from '../../../../../lib/cabinet/thread-window';
import { TOOLS_HREF, homeFor } from '../../../../../lib/cabinet/nav';
import { requireActor } from '../../../../../lib/cabinet/session';
import { postStaffMessage } from '../../../actions';

export const dynamic = 'force-dynamic';

/** Ветка руководителя с менеджером (требование РК-07, решение Р-336). */
export default async function StaffThreadScreen({
  params,
  searchParams,
}: {
  params: Promise<{ staffId: string }>;
  searchParams: Promise<{ error?: string; show?: string }>;
}) {
  const { staffId } = await params;
  const actor = await requireActor(`/cabinet/manage/team/${staffId}`);
  if (actor.role !== 'HEAD') redirect(homeFor(actor));
  const staff = (await staffThreads(actor)).find((row) => row.staffId === staffId);
  if (staff === undefined) notFound();
  const sp = await searchParams;
  // Окно последних сообщений и ссылка на ранние (решение Р-636).
  const shown = threadWindow(sp.show);
  const { messages, earlier } = sliceWindow(await listStaffThread(actor, staffId, { last: shown + 1 }), shown);
  await readStaffThread(actor, staffId);
  const draft = (await formDraft(sp.error)) ?? {};

  return (
    <Shell actor={actor} current={TOOLS_HREF}>
      <Narrow width={780}>
        <ScreenHead backHref="/cabinet/manage/team" backLabel="Команда" title={staff.fullName} note="переписка с менеджером" />
        <ActionError id={sp.error} />
        <Card>
          <Thread
            messages={messages}
            viewer={actor}
            earlierHref={earlier ? `/cabinet/manage/team/${staffId}?show=${shown + THREAD_WINDOW}` : undefined}
            empty="Переписки пока нет."
          />
          <Form action={postStaffMessage} style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--pd-divider)' }}>
            <input type="hidden" name="staffId" value={staffId} />
            <Field
              label="Новое сообщение"
              name="body"
              multiline
              required
              hint="Менеджер получит уведомление без текста. До 10 000 знаков."
              defaultValue={draft.body}
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

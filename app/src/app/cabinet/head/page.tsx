import { redirect } from 'next/navigation';

import ActionError from '../../../components/cabinet/ActionError';
import Shell from '../../../components/cabinet/Shell';
import { Button, Card, Field, Form, FormActions, Narrow, ScreenHead, Thread } from '../../../components/cabinet/ui';
import { formDraft } from '../../../lib/cabinet/flash';
import { listStaffThread, readStaffThread } from '../../../lib/cabinet/messages';
import { homeFor } from '../../../lib/cabinet/nav';
import { requireActor } from '../../../lib/cabinet/session';
import { postStaffMessage } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * Переписка менеджера с руководителем практики (требование РК-07, решение
 * Р-336). Заменяет карточку «Спросить руководителя», которая отправляла
 * письмо без ответа в кабинете (Р-199, Р-306). Пункта меню нет: вход — с
 * кнопки «Написать руководителю» на «Сегодня» и из уведомления.
 */
export default async function HeadThreadScreen({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await requireActor('/cabinet/head');
  if (actor.role !== 'MANAGER') redirect(homeFor(actor));
  const sp = await searchParams;
  const messages = await listStaffThread(actor, actor.id);
  await readStaffThread(actor, actor.id);
  const draft = (await formDraft(sp.error)) ?? {};

  return (
    <Shell actor={actor} current="/cabinet/manage">
      <Narrow width={780}>
        <ScreenHead
          backHref="/cabinet/manage"
          backLabel="Сегодня"
          title="Руководитель"
          note="переписка с руководителем практики: вопрос и ответ остаются в кабинете"
        />
        <ActionError id={sp.error} />
        <Card>
          <Thread
            messages={messages}
            viewer={actor}
            empty="Переписки пока нет. Спорный случай, нестандартная просьба клиента, сомнение по срокам или цене — напишите руководителю."
          />
          <Form action={postStaffMessage} style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--pd-divider)' }}>
            <input type="hidden" name="staffId" value={actor.id} />
            <Field
              label="Новое сообщение"
              name="body"
              multiline
              required
              placeholder="Клиент просит перенести защиту на месяц. Стоит ли пересматривать договор?"
              hint="Руководитель получит уведомление без текста и ответит здесь. До 10 000 знаков."
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

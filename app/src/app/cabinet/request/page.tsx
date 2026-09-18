import { redirect } from 'next/navigation';

import Shell from '../../../components/cabinet/Shell';
import {
  Button,
  Card,
  Field,
  Form,
  FormActions,
  Heading,
  Mono,
  Notice,
  Select,
  Text,
} from '../../../components/cabinet/ui';
import { can } from '../../../lib/cabinet/access';
import { serviceTypes } from '../../../lib/cabinet/queries';
import { currentActor } from '../../../lib/cabinet/session';
import { submitCabinetRequest } from '../actions';

export const dynamic = 'force-dynamic';

export default async function NewRequestScreen({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  if (!can(actor, 'REQUEST_CREATE')) redirect('/cabinet/projects');

  const [params, types] = await Promise.all([searchParams, serviceTypes()]);

  return (
    <Shell actor={actor} current="/cabinet/request">
      <div style={{ maxWidth: 680 }}>
        <Mono>Новая заявка</Mono>
        <Heading level={1} style={{ margin: '12px 0 12px' }}>
          Обращение по новой работе
        </Heading>
        <Text style={{ marginBottom: 24 }}>
          Заявка попадёт в ту же очередь, что и обращения с сайта. Менеджер рассмотрит её и либо
          развернёт в проект сопровождения, либо ответит с причиной. Контакты брать заново не нужно
          — они уже в вашей карточке.
        </Text>

        {params.sent === undefined ? (
          <Card>
            <Form action={submitCabinetRequest}>
              <Select label="Тип сопровождения" name="need">
                <option value="">— уточню при разговоре —</option>
                {types.map((type) => (
                  <option key={type.id} value={type.name}>
                    {type.name}
                  </option>
                ))}
              </Select>

              <Field
                label="Тема работы"
                name="topic"
                required
                placeholder="Статистический анализ отказов оборудования карьерных экскаваторов"
              />

              <Field
                label="Желаемый срок"
                name="deadline"
                placeholder="до 15 января 2027"
                hint="Достаточно ориентира: точные сроки этапов согласуем после разбора задачи."
              />

              <Field
                label="Что требуется"
                name="message"
                multiline
                hint="Коротко о задаче, о том, что уже сделано, и о требованиях кафедры или журнала."
              />

              <FormActions>
                <Button>Отправить заявку</Button>
              </FormActions>
            </Form>
          </Card>
        ) : (
          <>
            <Notice>
              Заявка принята и передана менеджеру. Ответ придёт на вашу почту, а ход работы будет
              виден в разделе «Мои работы».
            </Notice>
            <Text style={{ marginTop: 20 }}>
              <a href="/cabinet/request">Подать ещё одну заявку</a> ·{' '}
              <a href="/cabinet/projects">Вернуться к работам</a>
            </Text>
          </>
        )}
      </div>
    </Shell>
  );
}

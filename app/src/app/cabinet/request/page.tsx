import { redirect } from 'next/navigation';

import Shell from '../../../components/cabinet/Shell';
import {
  Button,
  ButtonLink,
  Card,
  Disclosure,
  Field,
  FileField,
  Form,
  FormActions,
  Notice,
  Narrow,
  ScreenHead,
  Select,
  Text,
} from '../../../components/cabinet/ui';
import { can } from '../../../lib/cabinet/access';
import {
  REQUEST_FILES_MAX,
  requestDefaults,
  serviceTypes,
} from '../../../lib/cabinet/queries';
import { currentActor } from '../../../lib/cabinet/session';
import { submitCabinetRequest } from '../actions';

export const dynamic = 'force-dynamic';

export default async function NewRequestScreen({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; lost?: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  if (!can(actor, 'REQUEST_CREATE')) redirect('/cabinet/projects');

  const [params, types, defaults] = await Promise.all([
    searchParams,
    serviceTypes(actor),
    requestDefaults(actor),
  ]);

  // Число берётся из адреса, поэтому читается как число, а не как текст.
  const lost = Math.max(0, Number.parseInt(params.lost ?? '0', 10) || 0);

  return (
    <Shell actor={actor} current="/cabinet/request">
      <Narrow width={680}>
        <ScreenHead title="Обращение по новой работе" />
        <Text style={{ marginBottom: 24 }}>
          Заявка попадёт в ту же очередь, что и обращения с сайта. Менеджер рассмотрит её и либо
          развернёт в проект сопровождения, либо ответит с причиной. Что известно из вашей
          карточки, уже подставлено.
        </Text>

        {params.sent === undefined ? (
          <Card>
            <Form action={submitCabinetRequest}>
                <Field
                label="ФИО заказчика"
                name="applicantName"
                required
                defaultValue={defaults.fullName}
                hint="Подставлено из вашей карточки; поправьте, если работа оформляется на другое лицо."
              />

              <Field
                label="ФИО научного руководителя"
                name="supervisorName"
                placeholder="Соловьёв Дмитрий Викторович"
                hint="Если руководитель назначен: его требования учитываются с первого этапа."
              />

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

              <FileField
                label="Приложить файлы"
                name="files"
                multiple
                hint={`Черновик, требования кафедры, отзыв рецензента — до ${REQUEST_FILES_MAX} файлов по 25 МБ. Файлы видят менеджеры, разбирающие заявки; после одобрения они перейдут в материалы работы.`}
              />

              {/* Место учёбы и контакт нужны не каждой заявке: у постоянного
                  клиента они уже в карточке и подставлены. Под свёрткой они
                  не занимают места, но и не теряются (решение Р-191). */}
              <Disclosure title="Место учёбы и контакт для связи">
                <Field
                  label="Организация или вуз"
                  name="organization"
                  defaultValue={defaults.organization}
                  placeholder="Горный университет"
                />
                <Field
                  label="Направление подготовки"
                  name="speciality"
                  defaultValue={defaults.speciality}
                  placeholder="2.8.6 — Горные машины и оборудование"
                />
                <Field
                  label="Контактный телефон"
                  name="phone"
                  type="tel"
                  defaultValue={defaults.phone}
                  hint="Для срочной связи; письма по-прежнему идут на адрес, которым вы вошли."
                />
              </Disclosure>

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
            {lost === 0 ? null : (
              <Notice tone="error">
                Не сохранились приложенные файлы: {lost}. Заявка принята без них — пришлите
                их менеджеру в переписке после одобрения.
              </Notice>
            )}
            {/* Следующее действие — кнопкой, а не строчной ссылкой: две
                ссылки через точку давали цель нажатия вдвое мельче
                положенных 44 пикселей (решение Р-172). */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
              <ButtonLink href="/cabinet/projects" tone="primary">
                К моим работам
              </ButtonLink>
              <ButtonLink href="/cabinet/request">Подать ещё одну заявку</ButtonLink>
            </div>
          </>
        )}
      </Narrow>
    </Shell>
  );
}

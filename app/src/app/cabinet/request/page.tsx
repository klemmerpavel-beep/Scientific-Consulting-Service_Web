import { redirect } from 'next/navigation';

import Shell from '../../../components/cabinet/Shell';
import {
  Button,
  ButtonLink,
  Card,
  Checkbox,
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
import ActionError from '../../../components/cabinet/ActionError';
import { formDraft } from '../../../lib/cabinet/flash';

export const dynamic = 'force-dynamic';

// Ссылка остаётся строчной, чтобы подпись переносилась как текст, а цель
// нажатия добирается до 44 пикселей отступом сверху и снизу. Подчёркнута
// она общим правилом `:is(p,label) a`: цветом от текста подписи она
// отличалась лишь на 1,78:1 (решение Р-253).
const LEGAL_LINK = {
  color: 'var(--pd-accent)',
  padding: '14px 0',
} as const;

export default async function NewRequestScreen({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; lost?: string; error?: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  if (!can(actor, 'REQUEST_CREATE')) redirect('/cabinet/projects');

  const [params, types, defaults] = await Promise.all([
    searchParams,
    serviceTypes(actor),
    requestDefaults(actor),
  ]);

  // Отказ — с набранным: заявку не приходится заполнять заново (Т-22,
  // решения Р-279, Р-296).
  const draft = (await formDraft(params.error)) ?? {};
  // Число берётся из адреса, поэтому читается как число, а не как текст.
  const lost = Math.max(0, Number.parseInt(params.lost ?? '0', 10) || 0);

  return (
    <Shell actor={actor} current="/cabinet/request">
      <Narrow width={680}>
        <ScreenHead title="Обращение по новой работе" />
        <Text style={{ marginBottom: 24 }}>
          Заявка попадёт в ту же очередь, что и обращения с сайта. Мы рассмотрим её и либо
          откроем новую работу, либо ответим с причиной. Что известно из вашей карточки, уже
          подставлено.
        </Text>

        {params.sent === undefined ? (
          <Card>
            <ActionError id={params.error} />
            <Form action={submitCabinetRequest}>
                <Field
                label="Ваши ФИО"
                name="applicantName"
                required
                defaultValue={draft.applicantName ?? defaults.fullName}
                hint="Подставлено из вашей карточки. Если работа оформляется на другого человека, укажите его ФИО."
              />

              <Field
                label="ФИО научного руководителя"
                name="supervisorName"
                defaultValue={draft.supervisorName ?? ''}
                placeholder="Соловьёв Дмитрий Викторович"
                hint="Если руководитель назначен: его требования учитываются с первого этапа."
              />

              <Select label="Тип сопровождения" name="need" defaultValue={draft.need ?? ''}>
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
                defaultValue={draft.topic ?? ''}
                placeholder="Статистический анализ отказов оборудования карьерных экскаваторов"
              />

              <Field
                label="Желаемый срок"
                name="deadline"
                defaultValue={draft.deadline ?? ''}
                placeholder="до 15 января 2027"
                hint="Достаточно ориентира: точные сроки этапов согласуем после разбора задачи."
              />

              <Field
                label="Что требуется"
                name="message"
                multiline
                defaultValue={draft.message ?? ''}
                hint="Коротко о задаче, о том, что уже сделано, и о требованиях кафедры или журнала."
              />

              <FileField
                label="Приложить файлы"
                name="files"
                multiple
                hint={`Черновик, требования кафедры, отзыв рецензента — до ${REQUEST_FILES_MAX} файлов по 25 МБ. Исполняемые файлы и установщики не принимаются. Файлы видят только сотрудники ProDisser, разбирающие заявки; после одобрения они перейдут в материалы работы.`}
              />

              {/* Место учёбы и контакт нужны не каждой заявке: у постоянного
                  клиента они уже в карточке и подставлены. Под свёрткой они
                  не занимают места, но и не теряются (решение Р-191). */}
              <Disclosure title="Место учёбы и контакт для связи">
                <Field
                  label="Организация или вуз"
                  name="organization"
                  defaultValue={draft.organization ?? defaults.organization}
                  placeholder="Горный университет"
                />
                <Field
                  label="Направление подготовки"
                  name="speciality"
                  defaultValue={draft.speciality ?? defaults.speciality}
                  placeholder="2.8.6 — Горные машины и оборудование"
                />
                <Field
                  label="Контактный телефон"
                  name="phone"
                  type="tel"
                  defaultValue={draft.phone ?? defaults.phone}
                  hint="Для срочной связи; письма по-прежнему идут на адрес, которым вы вошли."
                />
              </Disclosure>

              {/* Согласие спрашивается, пока его нет в учётной записи: теми же
                  отметками и той же редакцией, что на сайте (решение Р-238).
                  Кто пришёл заявкой с сайта, дал его там — ему отметок нет.
                  Ссылки внутри подписи добраны отступом до 44 пикселей:
                  строчная ссылка давала цель нажатия в 17 пикселей. */}
              {defaults.consentNeeded ? (
                <div style={{ marginTop: 8 }}>
                  <Checkbox
                    name="consent"
                    required
                    label={
                      <>
                        Даю{' '}
                        <a href="/consent" style={LEGAL_LINK}>
                          согласие на обработку персональных данных
                        </a>
                      </>
                    }
                  />
                  <Checkbox
                    name="terms"
                    required
                    label={
                      <>
                        Принимаю{' '}
                        <a href="/offer" style={LEGAL_LINK}>
                          оферту
                        </a>{' '}
                        и{' '}
                        <a href="/privacy" style={LEGAL_LINK}>
                          политику
                        </a>
                      </>
                    }
                  />
                </div>
              ) : null}

              <FormActions>
                <Button>Отправить заявку</Button>
              </FormActions>
            </Form>
          </Card>
        ) : (
          <>
            <Notice>
              Заявка принята и передана куратору. Ответ придёт на вашу почту, а ход работы будет
              виден в разделе «Мои работы».
            </Notice>
            {lost === 0 ? null : (
              <Notice tone="error">
                Не сохранились приложенные файлы: {lost}. Заявка принята без них — приложите
                их в материалах работы после одобрения.
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

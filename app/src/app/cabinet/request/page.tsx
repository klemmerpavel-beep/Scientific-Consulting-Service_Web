import { redirect } from 'next/navigation';

import Shell from '../../../components/cabinet/Shell';
import { SANS } from '../../../components/cabinet/tokens';
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
  Heading,
  Notice,
  Narrow,
  ScreenHead,
  Select,
  Tabs,
  Text,
} from '../../../components/cabinet/ui';
import { can } from '../../../lib/cabinet/access';
import { loadBrief } from '../../../lib/cabinet/brief/intake';
import { requestDraftFromBrief } from '../../../lib/cabinet/brief/request-draft';
import { variantFields } from '../../../lib/cabinet/brief/work-rows';
import {
  REQUEST_FILES_MAX,
  requestDefaults,
  serviceTypes,
} from '../../../lib/cabinet/queries';
import { requireActor } from '../../../lib/cabinet/session';
import { homeFor } from '../../../lib/cabinet/nav';
import { parseRequestBrief, submitCabinetRequest } from '../actions';
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
  searchParams: Promise<{ sent?: string; lost?: string; error?: string; brief?: string; variant?: string }>;
}) {
  const actor = await requireActor('/cabinet/request');
  if (!can(actor, 'REQUEST_CREATE')) redirect(homeFor(actor));

  const [params, types, defaults] = await Promise.all([
    searchParams,
    serviceTypes(actor),
    requestDefaults(actor),
  ]);

  // Анкета или исходные данные заполняют форму сами (решение Р-559). Из
  // нескольких вариантов темы клиент выбирает один — как на карточке
  // работы (Р-557).
  const loaded = params.brief === undefined ? null : await loadBrief(actor, 'REQUEST_CREATE', params.brief);
  const variants = loaded?.brief.variants ?? [];
  const variantRaw = params.variant !== undefined && /^\d+$/u.test(params.variant) ? Number(params.variant) : null;
  const variant = variantRaw !== null && variants[variantRaw] !== undefined ? variantRaw : variants.length === 1 ? 0 : null;
  const needVariant = variants.length > 1 && variant === null;
  const fromBrief = loaded === null ? null : requestDraftFromBrief(loaded.brief, variantFields(loaded.brief, variant), types);
  const briefHref = (index: number) => `/cabinet/request?brief=${encodeURIComponent(params.brief ?? '')}&variant=${index}`;
  const filled = (key: string) => (fromBrief?.values[key] ?? '') || undefined;

  // Отказ — с набранным: заявку не приходится заполнять заново (Т-22,
  // решения Р-279, Р-296). Набранное важнее разобранного.
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
            {/* Заполненная анкета или исходные данные заполняют форму сами;
                документ ложится вложением заявки (решение Р-559). */}
            <Disclosure title="Заполнить из документа" open={params.brief !== undefined && loaded === null} style={{ marginBottom: 16 }}>
              <Form action={parseRequestBrief}>
                <FileField
                  label="Анкета для заявки или исходные данные"
                  name="brief"
                  accept=".docx,.xlsx"
                  required
                  hint="Word или Excel до 2 МБ. Шаблон анкеты — в разделе «Материалы»."
                />
                <FormActions>
                  <Button tone="quiet">Заполнить</Button>
                </FormActions>
              </Form>
            </Disclosure>
            {params.brief !== undefined && loaded === null ? (
              <div style={{ marginBottom: 16 }}>
                <Notice tone="quiet" role="status">
                  Документ не найден: загрузите его снова.
                </Notice>
              </div>
            ) : null}
            {fromBrief === null ? null : (
              <div style={{ marginBottom: 16, display: 'grid', gap: 12 }}>
                {variants.length > 1 ? (
                  <Tabs
                    label="Вариант темы"
                    items={variants.map((item, index) => ({ href: briefHref(index), label: item.label, active: index === variant }))}
                  />
                ) : null}
                <Notice tone="quiet" role="status">
                  {needVariant
                    ? 'В документе несколько вариантов темы. Выберите вариант выше: тема и цель подставятся из него.'
                    : 'Поля заполнены из документа: проверьте их перед отправкой. Сам документ будет приложен к заявке и займёт одно из пяти мест для файлов.'}
                  {[...loaded!.brief.issues, ...fromBrief.notes].length === 0 ? null : (
                    <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                      {[...loaded!.brief.issues, ...fromBrief.notes].map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                </Notice>
              </div>
            )}
            <Form action={submitCabinetRequest}>
              {loaded === null ? null : <input type="hidden" name="brief" value={params.brief} />}
              {variant === null ? null : <input type="hidden" name="variant" value={variant} />}
              <Field
                label="Ваши ФИО"
                name="applicantName"
                required
                defaultValue={draft.applicantName ?? filled('applicantName') ?? defaults.fullName}
                hint="Подставлено из вашей карточки. Если работа оформляется на другого человека, укажите его ФИО."
              />

              <Field
                label="ФИО научного руководителя"
                name="supervisorName"
                defaultValue={draft.supervisorName ?? filled('supervisorName') ?? ''}
                placeholder="Соловьёв Дмитрий Викторович"
                hint="Если руководитель назначен: его требования учитываются с первого этапа."
              />

              <Select label="Тип сопровождения" name="need" defaultValue={draft.need ?? filled('need') ?? ''}>
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
                defaultValue={draft.topic ?? filled('topic') ?? ''}
                placeholder="Статистический анализ отказов оборудования карьерных экскаваторов"
              />

              <Field
                label="Желаемый срок"
                name="deadline"
                defaultValue={draft.deadline ?? filled('deadline') ?? ''}
                placeholder="до 15 января 2027"
                hint="Достаточно ориентира: точные сроки этапов согласуем после разбора задачи."
              />

              <Field
                label="Что требуется"
                name="message"
                multiline
                defaultValue={draft.message ?? filled('message') ?? ''}
                hint="Коротко о задаче, о том, что уже сделано, и о требованиях кафедры или журнала."
              />

              <FileField
                label="Приложить файлы"
                name="files"
                multiple
                hint={`Черновик, требования кафедры, отзыв рецензента — до ${REQUEST_FILES_MAX} файлов по 25 МБ${loaded === null ? '' : ', включая документ, из которого заполнена форма'}. Исполняемые файлы и установщики не принимаются. Файлы видят только сотрудники ProDisser, разбирающие заявки; после одобрения они перейдут в материалы работы.`}
              />

              {/* Место учёбы и контакт нужны не каждой заявке: у постоянного
                  клиента они уже в карточке и подставлены. Под свёрткой они
                  не занимают места, но и не теряются (решение Р-191). */}
              <Disclosure title="Место учёбы и контакт для связи" open={filled('organization') !== undefined || filled('speciality') !== undefined}>
                <Field
                  label="Организация или вуз"
                  name="organization"
                  defaultValue={draft.organization ?? filled('organization') ?? defaults.organization}
                  placeholder="Горный университет"
                />
                <Field
                  label="Направление подготовки"
                  name="speciality"
                  defaultValue={draft.speciality ?? filled('speciality') ?? defaults.speciality}
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
              Заявка принята и передана менеджеру. Ответ придёт на вашу почту, а ход работы будет
              виден в разделе «Мои работы».
            </Notice>
            {/* Тот же блок шагов, что после формы заявки на сайте; третий
                шаг — для того, у кого кабинет уже есть (требование Т-24,
                решение Р-318). */}
            <Card style={{ marginTop: 16 }}>
              <Heading level={2} size={3} style={{ marginBottom: 8 }}>
                Что будет дальше
              </Heading>
              <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 4 }}>
                <li style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.6 }}>
                  Менеджер разберёт заявку и ответит в течение рабочего дня.
                </li>
                <li style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.6 }}>
                  Свяжемся удобным вам способом, чтобы уточнить задачу.
                </li>
                <li style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.6 }}>
                  После согласования работа появится в «Моих работах».
                </li>
              </ol>
            </Card>
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

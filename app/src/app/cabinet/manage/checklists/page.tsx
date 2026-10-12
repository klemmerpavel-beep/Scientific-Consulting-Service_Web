import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import ActionError from '../../../../components/cabinet/ActionError';
import { Button } from '../../../../components/cabinet/Button';
import Shell from '../../../../components/cabinet/Shell';
import {
  ButtonLink,
  Card,
  Checkbox,
  Chip,
  Field,
  FileField,
  Form,
  FormActions,
  Heading,
  Outcome,
  ScreenHead,
  Select,
  Tabs,
  Text,
  formatDate,
  formatSize,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import {
  CHECKLIST_GROUPS,
  audienceLabel,
  checklistView,
  checklistViews,
  checklistsForView,
  stepAuto,
  stepText,
  type Checklist,
} from '../../../../lib/cabinet/checklists';
import { AUTO_NOTE, autoDone, type WorkState } from '../../../../lib/cabinet/checklist-auto';
import { workState } from '../../../../lib/cabinet/checklist-marks';
import { BRIEF_TEMPLATES } from '../../../../lib/cabinet/brief/templates';
import { DOWNLOAD_HREF } from '../../../../lib/cabinet/downloads';
import MaterialsList from '../../../../components/cabinet/MaterialsList';
import { formDraft } from '../../../../lib/cabinet/flash';
import { ownerTemplateLink } from '../../../../lib/cabinet/materials-hub';
import { AUDIENCE_LABEL, ownerTemplates } from '../../../../lib/cabinet/owner-templates';
import {
  SERVICE_PHASES,
  serviceChecklistsFor,
  type ServiceChecklist,
} from '../../../../lib/cabinet/service-checklists';
import { TOOLS_HREF, homeFor } from '../../../../lib/cabinet/nav';
import { requireActor } from '../../../../lib/cabinet/session';
import { removeOwnerTemplateAction, uploadOwnerTemplate } from '../../actions';

export const dynamic = 'force-dynamic';

const CHECKLISTS_HREF = '/cabinet/manage/checklists';

/** Колонка плашек: две колонки своей высоты, как на «Сводке» (Р-489). */
const STACK = { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, alignSelf: 'start' } as const;

function ChecklistCard({ list, head, state }: { list: Checklist; head: boolean; state: WorkState | null }) {
  return (
    <Card id={list.key}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 4 }}>
        <Heading level={3} size={3}>
          {list.title}
        </Heading>
        {/* Руководителю видно, кому адресован чек-лист: куратору и
            менеджеру видны только их собственные. */}
        {head ? <Chip>{audienceLabel(list.roles)}</Chip> : null}
      </div>
      <Text muted size={13} style={{ marginBottom: 10 }}>
        Когда: {list.when}
      </Text>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 2 }}>
        {list.steps.map((step, index) => {
          const text = `${index + 1}. ${stepText(step)}`;
          const rule = stepAuto(step);
          // Шаг с правилом, открытый по работе, отмечается по её состоянию
          // и нажатием не меняется (Р-556). Ответ «не положено знать» —
          // обычный флажок-памятка.
          const done = rule === null || state === null ? null : autoDone(rule, state);
          return (
            <li key={stepText(step)}>
              {done === null || rule === null ? (
                <Checkbox name={`${list.key}-${index + 1}`} label={text} />
              ) : (
                <Checkbox
                  name={`${list.key}-${index + 1}`}
                  defaultChecked={done}
                  disabled
                  label={
                    <>
                      {text}
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--pd-ink-muted)' }}>
                        {done ? `Отмечено кабинетом: ${AUTO_NOTE[rule]}.` : `Кабинет отметит сам: ${AUTO_NOTE[rule]}.`}
                      </span>
                    </>
                  }
                />
              )}
            </li>
          );
        })}
      </ol>
      {list.links.length === 0 ? null : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {list.links.map((link) => (
            <ButtonLink key={link.href} href={link.href}>
              {link.label}
            </ButtonLink>
          ))}
        </div>
      )}
    </Card>
  );
}

/**
 * Чек-лист вида работы (Р-554): шаги в трёх блоках — старт, по ходу,
 * сдача. Имя флажка — ключ шага: он же ключ отметки по работе (Р-555).
 */
function ServiceCard({ list }: { list: ServiceChecklist }) {
  return (
    <Card id={list.key}>
      <Heading level={3} size={3} style={{ marginBottom: 4 }}>
        {list.title}
      </Heading>
      <Text muted size={13} style={{ marginBottom: 10 }}>
        Когда: {list.when}
      </Text>
      {SERVICE_PHASES.map((phase) => {
        const steps = list.steps.filter((step) => step.phase === phase.key);
        return steps.length === 0 ? null : (
          <div key={phase.key} style={{ marginTop: 10 }}>
            <Text size={14} style={{ fontWeight: 600, marginBottom: 4 }}>
              {phase.title}
            </Text>
            <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 2 }}>
              {steps.map((step) => (
                <li key={step.key}>
                  <Checkbox name={`${list.key}-${step.key}`} label={step.text} />
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </Card>
  );
}

/** Две колонки своей высоты (Р-489): первая половина слева, вторая справа. */
function Columns({ cards }: { cards: readonly ReactNode[] }) {
  const half = Math.ceil(cards.length / 2);
  const left = cards.slice(0, half);
  const right = cards.slice(half);
  return (
    <div
      style={{
        display: 'grid',
        // Не больше двух плашек в ряду (решение Р-189).
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(440px,100%),1fr))',
        gap: 16,
      }}
    >
      <div style={STACK}>{left}</div>
      {right.length === 0 ? null : <div style={STACK}>{right}</div>}
    </div>
  );
}

type PracticeTemplate = Awaited<ReturnType<typeof ownerTemplates>>[number];

const TEMPLATE_OUTCOME = {
  uploaded: 'Шаблон загружен.',
  replaced: 'Шаблон заменён: прежний файл удалён, ссылка осталась та же.',
  removed: 'Шаблон убран.',
} as const;

/**
 * Шаблоны практики (задание владельца 12.10.2026, решение Р-562): договор,
 * техническое задание, памятки — файлы руководителя. Он их загружает и
 * убирает, остальные скачивают.
 */
function PracticeTemplates({
  templates,
  head,
  draft,
}: {
  templates: readonly PracticeTemplate[];
  head: boolean;
  draft: Readonly<Record<string, string>>;
}) {
  return (
    <Card id="practice-templates" style={{ marginBottom: 24 }}>
      <Heading level={2} size={3} style={{ marginBottom: 4 }}>
        Шаблоны практики
      </Heading>
      <Text muted size={14} style={{ marginBottom: 14 }}>
        {head
          ? 'Договор, техническое задание, памятки — ваши файлы. Они хранятся в кабинете и в открытый код сайта не попадают. Шаблон «всем» видят и клиенты в «Материалах»; шаблон с тем же названием заменяется.'
          : 'Договор, техническое задание, памятки — файлы руководителя практики.'}
      </Text>
      {templates.length === 0 ? (
        <Text muted size={14} style={{ marginBottom: head ? 14 : 0 }}>
          {head ? 'Шаблонов пока нет: загрузите первый формой ниже.' : 'Руководитель ещё не загрузил шаблоны.'}
        </Text>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 14 }}>
          {templates.map((template) => {
            const link = ownerTemplateLink(template);
            return (
              <li
                key={template.id}
                style={{ display: 'grid', gap: 8, paddingTop: 12, borderTop: '1px solid var(--pd-divider)' }}
              >
                <div>
                  <Heading level={3} size={3} style={{ marginBottom: 2 }}>
                    {template.title}
                  </Heading>
                  {template.note === null ? null : (
                    <Text muted size={13} style={{ margin: 0 }}>
                      {template.note}
                    </Text>
                  )}
                  <Text muted size={13} style={{ margin: 0 }}>
                    {formatSize(template.sizeBytes)} · {head ? `${AUDIENCE_LABEL[template.audience]} · ` : ''}обновлён{' '}
                    {formatDate(template.updatedAt)}
                  </Text>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <ButtonLink href={link.href} download>
                    {link.label}
                  </ButtonLink>
                  {head ? (
                    <Form action={removeOwnerTemplateAction} inline>
                      <input type="hidden" name="id" value={template.id} />
                      <Button tone="quiet">Убрать</Button>
                    </Form>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {head ? (
        <div id="template-upload" style={{ paddingTop: 16, marginTop: 16, borderTop: '1px solid var(--pd-divider)' }}>
          <Heading level={3} size={3} style={{ marginBottom: 12 }}>
            Загрузить шаблон
          </Heading>
          <Form action={uploadOwnerTemplate}>
            <Field label="Название" name="title" required defaultValue={draft.title} hint="Так шаблон называется в перечне и в имени файла." />
            <Field label="Пояснение" name="note" defaultValue={draft.note} hint="Необязательно: когда и кому его отправлять." />
            <Select label="Кому" name="audience" defaultValue={draft.audience === 'ALL' ? 'ALL' : 'STAFF'}>
              <option value="STAFF">Команде</option>
              <option value="ALL">Всем, включая клиентов</option>
            </Select>
            <FileField label="Файл" name="file" required hint="Word, Excel или PDF до 25 МБ." />
            <FormActions>
              <Button>Загрузить</Button>
            </FormActions>
          </Form>
        </div>
      ) : null}
    </Card>
  );
}

/**
 * «Чек-листы» (замечание владельца 08.10.2026, решение Р-494): порядок
 * основных дел практики по шагам. Руководителю — все чек-листы, куратору и
 * менеджеру — их (Р-552). Отметки на экране — памятка на одно дело и не
 * сохраняются.
 */
export default async function ChecklistsScreen({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; work?: string; template?: string; error?: string }>;
}) {
  const actor = await requireActor(CHECKLISTS_HREF);
  if (!can(actor, 'CHECKLIST_VIEW')) redirect(homeFor(actor));
  const head = actor.role === 'HEAD';
  // «Управление» есть у всех сотрудников (решение Р-559): экран чек-листов
  // открывается оттуда, и возврат — туда же (решение Р-562).
  const back = { href: TOOLS_HREF, label: 'Управление' };
  const params = await searchParams;
  const views = checklistViews(actor);
  const view = checklistView(actor, params.view);
  // Открыт по работе (Р-556): шаги, которые кабинет проверяет сам,
  // отмечены по её состоянию. Чужая или неизвестная работа — обычный экран.
  const work = params.work === undefined ? null : await workState(actor, params.work);
  const workQuery = work === null ? '' : `&work=${encodeURIComponent(work.code)}`;
  const lists = checklistsForView(actor, view);
  const templates = view === 'templates' ? await ownerTemplates(actor) : [];
  const draft = view === 'templates' ? ((await formDraft(params.error)) ?? {}) : {};
  const outcome = params.template === undefined ? undefined : TEMPLATE_OUTCOME[params.template as keyof typeof TEMPLATE_OUTCOME];
  const groups = CHECKLIST_GROUPS.map((group) => ({
    ...group,
    lists: lists.filter((list) => list.group === group.key),
  })).filter((group) => group.lists.length > 0);

  return (
    <Shell actor={actor} current={back.href}>
      <ScreenHead
        backHref={work === null ? back.href : `/cabinet/projects/${encodeURIComponent(work.code)}`}
        backLabel={work === null ? back.label : work.title}
        title="Чек-листы"
        note={
          work === null
            ? 'Порядок основных дел по шагам: что сделать и на каком экране. Отметки здесь — памятка на одно дело, они не сохраняются. Это первая редакция: правки к шагам присылайте кнопкой замечаний справа внизу.'
            : `По работе «${work.title}»: шаги, которые кабинет проверяет сам, отмечены по её состоянию. Остальные отметки — памятка, они не сохраняются.`
        }
        // Файлом Word — то, что на вкладке (решение Р-559); в PDF —
        // печатью страницы, подсказка — в «Управлении».
        action={
          view === 'templates' ? undefined : (
            <ButtonLink href={`${DOWNLOAD_HREF}/${view === 'service' ? 'chek-listy-po-vidam' : 'chek-listy'}`} download>
              Скачать .docx
            </ButtonLink>
          )
        }
      />

      <Tabs
        label="Чек-листы"
        items={views.map((item) => ({
          href: `${CHECKLISTS_HREF}?view=${item.key}${workQuery}`,
          label: item.label,
          active: item.key === view,
        }))}
      />

      <ActionError id={params.error} />
      {outcome === undefined ? null : <Outcome>{outcome}</Outcome>}

      {view === 'templates' ? (
        <>
          {/* Шаблоны документов: кабинет сам заполняет из них форму заказа
              и карточку работы (решения Р-557, Р-558). */}
          <MaterialsList
            title="Шаблоны документов"
            note="Заполненный шаблон загружается на «Новом заказе» и на карточке работы: поля заполнятся сами. Подписи полей не меняйте — по ним кабинет их узнаёт."
            rows={BRIEF_TEMPLATES.map((template) => ({
              title: template.title,
              note: template.note,
              files: [{ href: `${DOWNLOAD_HREF}/${template.key}`, label: `Скачать .${template.file.split('.').pop()}` }],
            }))}
          />
          <PracticeTemplates templates={templates} head={head} draft={draft} />
        </>
      ) : view === 'service' ? (
        <div className="cab-block" style={{ marginBottom: 24 }}>
          <Heading level={2} size={3} style={{ marginBottom: 4 }}>
            По видам работ
          </Heading>
          <Text muted size={14} style={{ marginBottom: 14 }}>
            Что проверить на старте, по ходу и при сдаче — по виду сопровождения.
          </Text>
          <Columns cards={serviceChecklistsFor(actor).map((list) => <ServiceCard key={list.key} list={list} />)} />
        </div>
      ) : (
        // Две колонки своей высоты: чек-листы разной длины в общей сетке
        // тянулись бы до соседа и стояли наполовину пустыми (Р-489). На
        // узком экране колонки встают одна под другой, и порядок дел
        // сохраняется.
        groups.map((group) => (
          <div className="cab-block" key={group.key} style={{ marginBottom: 24 }}>
            <Heading level={2} size={3} style={{ marginBottom: 4 }}>
              {group.title}
            </Heading>
            <Text muted size={14} style={{ marginBottom: 14 }}>
              {group.note}
            </Text>
            <Columns
              cards={group.lists.map((list) => (
                <ChecklistCard key={list.key} list={list} head={head} state={work?.state ?? null} />
              ))}
            />
          </div>
        ))
      )}
    </Shell>
  );
}

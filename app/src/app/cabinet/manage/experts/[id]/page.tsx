import { notFound, redirect } from 'next/navigation';

import ActionError from '../../../../../components/cabinet/ActionError';
import Shell from '../../../../../components/cabinet/Shell';
import {
  Button,
  ButtonLink,
  Card,
  Checkbox,
  Chip,
  Field,
  Form,
  FormActions,
  Heading,
  Narrow,
  Outcome,
  ScreenHead,
  Select,
  Text,
  formatSize,
} from '../../../../../components/cabinet/ui';
import { can } from '../../../../../lib/cabinet/access';
import { EXPERT_STATUSES, expertApplication } from '../../../../../lib/cabinet/expert-applications';
import { formatMoment } from '../../../../../lib/cabinet/journals';
import { homeFor } from '../../../../../lib/cabinet/nav';
import { currentActor } from '../../../../../lib/cabinet/session';
import { EXPERT_STATUS_LABEL } from '../../../../../lib/expert-application';
import { removeExpertApplication, saveExpertReview } from '../../../actions';

export const dynamic = 'force-dynamic';

const BASE = '/cabinet/manage/experts';

/** Строка анкеты: подпись и значение; пустое не показывается. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 4, paddingTop: 12, borderTop: '1px solid var(--pd-divider)' }}>
      <Text muted size={13}>
        {label}
      </Text>
      <Text style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--pd-ink)' }}>{children}</Text>
    </div>
  );
}

/**
 * Анкета эксперта целиком (решение Р-580): что о себе написал человек,
 * его файлы, разбор и удаление. Связаться — из своей почты по адресу из
 * анкеты: кабинет кандидату писем не шлёт.
 */
export default async function ExpertScreen({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  if (!can(actor, 'EXPERT_APPLICATION_REVIEW')) redirect(homeFor(actor));
  const { id } = await params;
  const sp = await searchParams;
  const row = await expertApplication(actor, id);
  if (row === null) notFound();

  return (
    <Shell actor={actor} current={BASE}>
      <ScreenHead
        backHref={BASE}
        backLabel="к анкетам"
        title={row.fullName}
        note={`Анкета от ${formatMoment(row.createdAt)} МСК · ${EXPERT_STATUS_LABEL[row.status]}`}
      />
      <Narrow>
        <ActionError id={sp.error} />
        {sp.saved === undefined ? null : <Outcome>Разбор сохранён.</Outcome>}

        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
            <Heading level={2} size={3}>
              Анкета
            </Heading>
            <Chip nowrap tone={row.status === 'NEW' ? 'accent' : 'neutral'}>
              {EXPERT_STATUS_LABEL[row.status]}
            </Chip>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <Row label="Почта">
              <a className="cab-mark" href={`mailto:${row.email}`}>
                {row.email}
              </a>
            </Row>
            {row.phone === null ? null : (
              <Row label="Телефон">
                <a className="cab-mark" href={`tel:${row.phone.replace(/[^\d+]/gu, '')}`}>
                  {row.phone}
                </a>
              </Row>
            )}
            <Row label="Учёная степень">{row.degree}</Row>
            {row.speciality === null ? null : <Row label="Научная специальность">{row.speciality}</Row>}
            <Row label="Сфера: направления и темы">{row.fields}</Row>
            <Row label="Опыт">{row.experience}</Row>
            {row.links === null ? null : <Row label="Ссылки">{row.links}</Row>}
            <Row label="Согласие на обработку данных">{`Дано, редакция от ${row.consentVersion.split('-').reverse().join('.')}`}</Row>
          </div>
        </Card>

        <Card style={{ marginBottom: 20 }}>
          <Heading level={2} size={3} style={{ marginBottom: 6 }}>
            Файлы
          </Heading>
          {row.files.length === 0 ? (
            <Text muted>Файлов к анкете не приложено.</Text>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
              {row.files.map((file) => (
                <li key={file.id}>
                  <ButtonLink href={`${BASE}/files/${file.id}`} download>
                    {`${file.originalName} · ${formatSize(file.sizeBytes)}`}
                  </ButtonLink>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card style={{ marginBottom: 20 }}>
          <Heading level={2} size={3} style={{ marginBottom: 6 }}>
            Разбор
          </Heading>
          <Text muted size={14} style={{ marginBottom: 14 }}>
            Ответ кандидату — из своей почты по адресу из анкеты. Приглашённого заведите в команду
            кнопкой «Добавить в команду»: анкета учётной записи не создаёт.
          </Text>
          <Form action={saveExpertReview}>
            <input type="hidden" name="id" value={row.id} />
            <Select label="Состояние" name="status" defaultValue={row.status}>
              {EXPERT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {EXPERT_STATUS_LABEL[value]}
                </option>
              ))}
            </Select>
            <Field label="Пометка" name="note" multiline defaultValue={row.note ?? ''} hint="Видна только в кабинете. До 4000 знаков." />
            <FormActions>
              <Button>Сохранить разбор</Button>
              <ButtonLink href="/cabinet/manage/users?new=1#new" tone="quiet">
                Добавить в команду
              </ButtonLink>
            </FormActions>
          </Form>
        </Card>

        <Card id="delete">
          <Heading level={2} size={3} style={{ marginBottom: 6 }}>
            Удалить анкету
          </Heading>
          <Text muted size={14} style={{ marginBottom: 14 }}>
            По просьбе кандидата или когда анкета больше не нужна. Анкета и файлы удаляются безвозвратно;
            через шесть месяцев с даты анкеты это происходит само.
          </Text>
          <Form action={removeExpertApplication}>
            <input type="hidden" name="id" value={row.id} />
            <Checkbox name="confirm" label="Удалить анкету и файлы безвозвратно" />
            <FormActions>
              <Button tone="quiet">Удалить</Button>
            </FormActions>
          </Form>
        </Card>
      </Narrow>
    </Shell>
  );
}

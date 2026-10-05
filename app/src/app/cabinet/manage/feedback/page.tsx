import { redirect } from 'next/navigation';

import ActionError from '../../../../components/cabinet/ActionError';
import Shell from '../../../../components/cabinet/Shell';
import { SANS } from '../../../../components/cabinet/tokens';
import {
  Button,
  ButtonLink,
  Card,
  Chip,
  Empty,
  Field,
  Form,
  FormActions,
  FormRow,
  Outcome,
  ScreenHead,
  Select,
  TABLE_CELL,
  TABLE_HEAD,
  TableCard,
  Text,
  Tile,
  Tiles,
  plural,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { FEEDBACK_PAGE_SIZE, feedbackDigest, feedbackList } from '../../../../lib/cabinet/feedback';
import { formatMoment } from '../../../../lib/cabinet/journals';
import { currentActor } from '../../../../lib/cabinet/session';
import {
  AREA_LABEL,
  FEEDBACK_SEVERITIES,
  FEEDBACK_STATUSES,
  NOTE_MAX,
  SEVERITY_LABEL,
  STATUS_LABEL,
  isSeverity,
  isStatus,
  type FeedbackSeverity,
  type FeedbackStatus,
} from '../../../../lib/feedback';
import { saveFeedbackReview } from '../../actions';

export const dynamic = 'force-dynamic';

const BASE = '/cabinet/manage/feedback';

/** Адрес этой же страницы с другим номером: отбор при листании сохраняется. */
function pageHref(kept: URLSearchParams, page: number): string {
  const next = new URLSearchParams(kept);
  next.set('page', String(page));
  return `${BASE}?${next.toString()}`;
}

/**
 * Замечания с виджета (решение Р-403).
 *
 * Раз в неделю руководитель проходит перечень сверху вниз: уточняет
 * критичность, переводит в работу, после правки отмечает «исправлено» и
 * пишет, что сделано. Людей в перечне нет по устройству: виджет не знает,
 * кто пишет, а страница записана шаблоном без идентификаторов.
 */
export default async function FeedbackScreen({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  if (!can(actor, 'FEEDBACK_REVIEW')) redirect('/cabinet/projects');

  const sp = await searchParams;
  const filter: { status: FeedbackStatus | ''; severity: FeedbackSeverity | ''; page: number } = {
    status: isStatus(sp.status) ? sp.status : '',
    severity: isSeverity(sp.severity) ? sp.severity : '',
    page: Number(sp.page ?? '1'),
  };
  const [digest, list] = await Promise.all([
    feedbackDigest(actor),
    feedbackList(actor, {
      status: filter.status || undefined,
      severity: filter.severity || undefined,
      page: Number.isFinite(filter.page) ? filter.page : 1,
    }),
  ]);

  const kept = new URLSearchParams();
  if (filter.status) kept.set('status', filter.status);
  if (filter.severity) kept.set('severity', filter.severity);
  // Разбор возвращает на ту же страницу перечня с тем же отбором.
  const back = list.page > 1 ? pageHref(kept, list.page) : `${BASE}${kept.toString() ? `?${kept.toString()}` : ''}`;

  return (
    <Shell actor={actor} current={BASE}>
      <ScreenHead
        backHref="/cabinet/manage/tools"
        backLabel="к управлению"
        title="Замечания"
        note="Замечания с кнопки справа внизу — с сайта и из кабинета. Виджет не собирает персональные данные: ни имени, ни контакта, ни адреса страницы с идентификаторами. Разбираются раз в неделю."
        action={
          digest.total > 0 ? (
            <ButtonLink href={`${BASE}/export`} download>
              Выгрузить .xlsx
            </ButtonLink>
          ) : null
        }
      />

      <ActionError id={sp.error} />
      {sp.saved === undefined ? null : <Outcome>Разбор сохранён.</Outcome>}

      <Tiles>
        <Tile label="Новых" value={String(digest.fresh)} note="ещё не разобраны" />
        <Tile label="В работе" value={String(digest.inWork)} note="правка начата" />
        <Tile
          label="Критичных открытых"
          value={String(digest.criticalOpen)}
          note="новые и в работе"
        />
        <Tile label="Всего" value={String(digest.total)} note="за всё время" />
      </Tiles>

      {/* Метод get: отбор остаётся в адресе, как в «Всех заявках». */}
      <Card style={{ margin: '24px 0 20px' }}>
        <Form method="get">
          <FormRow>
            <Select label="Состояние" name="status" defaultValue={filter.status}>
              <option value="">Любое</option>
              {FEEDBACK_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABEL[value]}
                </option>
              ))}
            </Select>
            <Select label="Критичность" name="severity" defaultValue={filter.severity}>
              <option value="">Любая</option>
              {FEEDBACK_SEVERITIES.map((value) => (
                <option key={value} value={value}>
                  {SEVERITY_LABEL[value]}
                </option>
              ))}
            </Select>
          </FormRow>
          <FormActions>
            <Button>Показать</Button>
            <ButtonLink href={BASE}>Сбросить</ButtonLink>
          </FormActions>
        </Form>
      </Card>

      <Text style={{ marginBottom: 12 }}>
        {plural(list.total, 'Найдено', 'Найдены', 'Найдено')} {list.total}{' '}
        {plural(list.total, 'замечание', 'замечания', 'замечаний')}
        {list.total > 0
          ? `, показаны с ${(list.page - 1) * FEEDBACK_PAGE_SIZE + 1} по ${(list.page - 1) * FEEDBACK_PAGE_SIZE + list.rows.length}`
          : ''}
      </Text>

      {list.rows.length === 0 ? (
        <Empty
          title={digest.total === 0 ? 'Замечаний пока нет' : 'Ничего не найдено'}
          filters={[
            filter.status ? `состояние — ${STATUS_LABEL[filter.status]}` : '',
            filter.severity ? `критичность — ${SEVERITY_LABEL[filter.severity]}` : '',
          ]}
          total={filter.status || filter.severity ? digest.total : undefined}
          resetHref={filter.status || filter.severity ? BASE : undefined}
        >
          {digest.total === 0
            ? 'Как только кто-нибудь нажмёт кнопку справа внизу и отправит замечание, оно появится здесь.'
            : 'Замечания никуда не делись — они не подошли под этот отбор.'}
        </Empty>
      ) : (
        <TableCard label="Замечания">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100, fontFamily: SANS }}>
            <thead>
              <tr>
                <th style={TABLE_HEAD} scope="col">Когда (МСК)</th>
                <th style={TABLE_HEAD} scope="col">Где</th>
                <th style={TABLE_HEAD} scope="col">Замечание</th>
                <th style={TABLE_HEAD} scope="col">Критичность</th>
                <th style={TABLE_HEAD} scope="col">Состояние</th>
                <th style={TABLE_HEAD} scope="col">Разбор</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((row) => (
                <tr key={row.id}>
                  <td style={TABLE_CELL}>
                    {formatMoment(row.createdAt)}
                    {row.resolvedAt === null ? null : (
                      <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>
                        закрыто {formatMoment(row.resolvedAt)}
                      </div>
                    )}
                  </td>
                  <td style={{ ...TABLE_CELL, maxWidth: 220, wordBreak: 'break-word' }}>
                    {AREA_LABEL[row.area]} · {row.pathTemplate}
                    <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>
                      {row.device}
                      {row.viewportWidth === null ? '' : `, ${row.viewportWidth} px`}
                    </div>
                    {row.screenshotKey === null ? null : (
                      <a className="cab-mark" href={`${BASE}/${row.id}/screenshot`}>
                        Снимок экрана
                      </a>
                    )}
                  </td>
                  <td style={{ ...TABLE_CELL, maxWidth: 360, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {row.text}
                    {row.note === null ? null : (
                      <div style={{ marginTop: 8, fontSize: 13, color: 'var(--pd-ink-muted)' }}>
                        Что сделано: {row.note}
                      </div>
                    )}
                  </td>
                  <td style={TABLE_CELL}>
                    <Chip tone={row.severity === 'CRITICAL' ? 'accent' : 'neutral'}>
                      {SEVERITY_LABEL[row.severity]}
                    </Chip>
                    <div style={{ marginTop: 6, fontSize: 13, color: 'var(--pd-ink-muted)' }}>
                      {row.severityAuto === row.severity
                        ? 'по правилу'
                        : `по правилу — ${SEVERITY_LABEL[row.severityAuto]}`}
                    </div>
                  </td>
                  <td style={TABLE_CELL}>
                    <Chip>{STATUS_LABEL[row.status]}</Chip>
                  </td>
                  <td style={{ ...TABLE_CELL, minWidth: 340 }}>
                    <Form action={saveFeedbackReview}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="back" value={back} />
                      {/* Два выбора рядом: строка перечня и без того высокая. */}
                      <FormRow style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                        <Select label="Критичность" name="severity" scope={row.id} defaultValue={row.severity}>
                          {FEEDBACK_SEVERITIES.map((value) => (
                            <option key={value} value={value}>
                              {SEVERITY_LABEL[value]}
                            </option>
                          ))}
                        </Select>
                        <Select label="Состояние" name="status" scope={row.id} defaultValue={row.status}>
                          {FEEDBACK_STATUSES.map((value) => (
                            <option key={value} value={value}>
                              {STATUS_LABEL[value]}
                            </option>
                          ))}
                        </Select>
                      </FormRow>
                      <Field
                        label="Что сделано"
                        name="note"
                        scope={row.id}
                        multiline
                        defaultValue={row.note ?? ''}
                        hint={`До ${NOTE_MAX} знаков.`}
                      />
                      <FormActions>
                        <Button tone="quiet">Сохранить разбор</Button>
                      </FormActions>
                    </Form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      {list.pages > 1 ? (
        <nav
          aria-label="Страницы перечня"
          style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 20 }}
        >
          {list.page > 1 ? (
            <a className="cab-mark" href={pageHref(kept, list.page - 1)}>
              Предыдущие
            </a>
          ) : null}
          <Text muted style={{ margin: 0 }}>
            Страница {list.page} из {list.pages}
          </Text>
          {list.page < list.pages ? (
            <a className="cab-mark" href={pageHref(kept, list.page + 1)}>
              Следующие
            </a>
          ) : null}
        </nav>
      ) : null}
    </Shell>
  );
}

import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import { SANS } from '../../../../components/cabinet/tokens';
import {
  ButtonLink,
  Chip,
  Empty,
  Outcome,
  Pager,
  ScreenHead,
  TABLE_CELL,
  TABLE_HEAD,
  TableCard,
  Tabs,
  Text,
  plural,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { EXPERT_STATUSES, expertApplications } from '../../../../lib/cabinet/expert-applications';
import { formatMoment } from '../../../../lib/cabinet/journals';
import { homeFor } from '../../../../lib/cabinet/nav';
import { requireActor } from '../../../../lib/cabinet/session';
import { EXPERT_STATUS_LABEL, type ExpertStatus } from '../../../../lib/expert-application';

export const dynamic = 'force-dynamic';

const BASE = '/cabinet/manage/experts';

/**
 * Анкеты экспертов со страницы сайта «Экспертам» (замечание владельца
 * 13.10.2026, решение Р-580).
 *
 * Руководитель проходит новые анкеты, открывает резюме и примеры работ,
 * отмечает «В разборе», «Приглашён» или «Отказ». Приглашённого заводит в
 * команду сам — кнопкой «Добавить в команду»: анкета учётной записи не
 * создаёт. Таблица анкет выгружается в Excel и лежит в зеркале на Диске.
 */
export default async function ExpertsScreen({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // После входа — обратно к анкетам (Р-309, решение Р-675).
  const actor = await requireActor('/cabinet/manage/experts');
  if (!can(actor, 'EXPERT_APPLICATION_REVIEW')) redirect(homeFor(actor));

  const sp = await searchParams;
  const status = EXPERT_STATUSES.includes(sp.status as ExpertStatus) ? (sp.status as ExpertStatus) : undefined;
  const list = await expertApplications(actor, { status, page: Number(sp.page ?? '1') });
  const all = Object.values(list.counts).reduce((acc, value) => acc + value, 0);
  const href = (next: ExpertStatus | undefined, page = 1) => {
    const query = new URLSearchParams();
    if (next !== undefined) query.set('status', next);
    if (page > 1) query.set('page', String(page));
    return query.size === 0 ? BASE : `${BASE}?${query.toString()}`;
  };

  return (
    <Shell actor={actor} current={BASE}>
      <ScreenHead
        backHref="/cabinet/manage/tools"
        backLabel="Управление"
        title="Анкеты кандидатов"
        note="Анкеты кандидатов в кураторы со страницы сайта /experts: опыт, сфера, резюме и примеры работ. Хранятся шесть месяцев с даты анкеты, затем удаляются вместе с файлами."
        action={
          all > 0 ? (
            <ButtonLink href={`${BASE}/export`} download>
              Выгрузить .xlsx
            </ButtonLink>
          ) : null
        }
      />

      {sp.deleted === undefined ? null : <Outcome>Анкета и её файлы удалены.</Outcome>}

      <Tabs
        label="Отбор анкет по состоянию"
        items={[
          { href: href(undefined), label: `Все · ${all}`, active: status === undefined },
          ...EXPERT_STATUSES.map((value) => ({
            href: href(value),
            label: `${EXPERT_STATUS_LABEL[value]} · ${list.counts[value]}`,
            active: status === value,
          })),
        ]}
      />

      {list.rows.length === 0 ? (
        <Empty
          title={all === 0 ? 'Анкет пока нет' : 'Ничего не найдено'}
          filters={status === undefined ? [] : [`состояние — ${EXPERT_STATUS_LABEL[status]}`]}
          total={status === undefined ? undefined : all}
          resetHref={status === undefined ? undefined : BASE}
        >
          {all === 0
            ? 'Анкета появится здесь, когда кандидат заполнит её на странице сайта /experts.'
            : 'Анкеты есть — они не подошли под этот отбор.'}
        </Empty>
      ) : (
        <>
          <Text muted size={13} style={{ marginBottom: 12 }}>
            {`${list.total} ${plural(list.total, 'анкета', 'анкеты', 'анкет')}, свежие сверху.`}
          </Text>
          <TableCard label="Анкеты кандидатов">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SANS }}>
              <thead>
                <tr>
                  <th style={TABLE_HEAD} scope="col">Когда (МСК)</th>
                  <th style={TABLE_HEAD} scope="col">Кандидат</th>
                  <th style={TABLE_HEAD} scope="col">Степень и специальность</th>
                  <th style={TABLE_HEAD} scope="col">Файлов</th>
                  <th style={TABLE_HEAD} scope="col">Состояние</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ ...TABLE_CELL, whiteSpace: 'nowrap' }}>{formatMoment(row.createdAt)}</td>
                    <td style={TABLE_CELL}>
                      <Text size={15}>
                        <a className="cab-mark" href={`${BASE}/${row.id}`}>
                          {row.fullName}
                        </a>
                      </Text>
                    </td>
                    <td style={TABLE_CELL}>
                      {row.degree}
                      {row.speciality === null ? null : (
                        <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>{row.speciality}</div>
                      )}
                    </td>
                    <td style={TABLE_CELL}>{row.files}</td>
                    <td style={TABLE_CELL}>
                      <Chip nowrap tone={row.status === 'NEW' ? 'accent' : 'neutral'}>
                        {EXPERT_STATUS_LABEL[row.status]}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        </>
      )}

      <Pager label="Страницы анкет" page={list.page} pages={list.pages} hrefFor={(page) => href(status, page)} />
    </Shell>
  );
}

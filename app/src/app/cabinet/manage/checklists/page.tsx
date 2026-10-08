import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import {
  ButtonLink,
  Card,
  Checkbox,
  Chip,
  Heading,
  ScreenHead,
  Text,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { CHECKLIST_GROUPS, checklistsFor, type Checklist } from '../../../../lib/cabinet/checklists';
import { TOOLS_HREF, homeFor } from '../../../../lib/cabinet/nav';
import { requireActor } from '../../../../lib/cabinet/session';

export const dynamic = 'force-dynamic';

const CHECKLISTS_HREF = '/cabinet/manage/checklists';

/** Колонка плашек: две колонки своей высоты, как на «Сводке» (Р-489). */
const STACK = { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, alignSelf: 'start' } as const;

function ChecklistCard({ list, head }: { list: Checklist; head: boolean }) {
  return (
    <Card id={list.key}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 4 }}>
        <Heading level={3} size={3}>
          {list.title}
        </Heading>
        {/* Руководителю видно, кому адресован чек-лист: менеджеру видны
            только его собственные. */}
        {head ? <Chip>{list.roles.includes('MANAGER') ? 'менеджеру и руководителю' : 'руководителю'}</Chip> : null}
      </div>
      <Text muted size={13} style={{ marginBottom: 10 }}>
        Когда: {list.when}
      </Text>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 2 }}>
        {list.steps.map((step, index) => (
          <li key={step}>
            <Checkbox name={`${list.key}-${index + 1}`} label={`${index + 1}. ${step}`} />
          </li>
        ))}
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
 * «Чек-листы» (замечание владельца 08.10.2026, решение Р-494): порядок
 * основных дел практики по шагам. Руководителю — все чек-листы, менеджеру
 * — его. Отметки на экране — памятка на одно дело и не сохраняются.
 */
export default async function ChecklistsScreen() {
  const actor = await requireActor(CHECKLISTS_HREF);
  if (!can(actor, 'CHECKLIST_VIEW')) redirect(homeFor(actor));
  const head = actor.role === 'HEAD';
  const lists = checklistsFor(actor);
  const groups = CHECKLIST_GROUPS.map((group) => ({
    ...group,
    lists: lists.filter((list) => list.group === group.key),
  })).filter((group) => group.lists.length > 0);

  return (
    <Shell actor={actor} current={head ? TOOLS_HREF : '/cabinet/manage'}>
      <ScreenHead
        backHref={head ? TOOLS_HREF : '/cabinet/manage'}
        backLabel={head ? 'Управление' : 'Сегодня'}
        title="Чек-листы"
        note="Порядок основных дел по шагам: что сделать и на каком экране. Отметки — памятка на одно дело, они не сохраняются. Это первая редакция: правки к шагам присылайте кнопкой замечаний справа внизу."
      />

      {groups.map((group) => {
        // Две колонки своей высоты: чек-листы разной длины в общей сетке
        // тянулись бы до соседа и стояли наполовину пустыми (Р-489).
        // Первая половина — слева, вторая — справа: на узком экране
        // колонки встают одна под другой, и порядок дел сохраняется.
        const half = Math.ceil(group.lists.length / 2);
        const left = group.lists.slice(0, half);
        const right = group.lists.slice(half);
        return (
          <div className="cab-block" key={group.key} style={{ marginBottom: 24 }}>
            <Heading level={2} size={3} style={{ marginBottom: 4 }}>
              {group.title}
            </Heading>
            <Text muted size={14} style={{ marginBottom: 14 }}>
              {group.note}
            </Text>
            <div
              style={{
                display: 'grid',
                // Не больше двух плашек в ряду (решение Р-189).
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(440px,100%),1fr))',
                gap: 16,
              }}
            >
              <div style={STACK}>
                {left.map((list) => (
                  <ChecklistCard key={list.key} list={list} head={head} />
                ))}
              </div>
              {right.length === 0 ? null : (
                <div style={STACK}>
                  {right.map((list) => (
                    <ChecklistCard key={list.key} list={list} head={head} />
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </Shell>
  );
}

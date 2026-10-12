import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import Shell from '../../../../components/cabinet/Shell';
import {
  ButtonLink,
  Card,
  Checkbox,
  Chip,
  Heading,
  ScreenHead,
  Tabs,
  Text,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import {
  CHECKLIST_GROUPS,
  audienceLabel,
  checklistView,
  checklistViews,
  checklistsForView,
  type Checklist,
} from '../../../../lib/cabinet/checklists';
import {
  SERVICE_PHASES,
  serviceChecklistsFor,
  type ServiceChecklist,
} from '../../../../lib/cabinet/service-checklists';
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
        {/* Руководителю видно, кому адресован чек-лист: куратору и
            менеджеру видны только их собственные. */}
        {head ? <Chip>{audienceLabel(list.roles)}</Chip> : null}
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
 * Чек-лист вида работы (Р-550): шаги в трёх блоках — старт, по ходу,
 * сдача. Имя флажка — ключ шага: он же ключ отметки по работе (Р-551).
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

/**
 * «Чек-листы» (замечание владельца 08.10.2026, решение Р-494): порядок
 * основных дел практики по шагам. Руководителю — все чек-листы, куратору и
 * менеджеру — их (Р-548). Отметки на экране — памятка на одно дело и не
 * сохраняются.
 */
export default async function ChecklistsScreen({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const actor = await requireActor(CHECKLISTS_HREF);
  if (!can(actor, 'CHECKLIST_VIEW')) redirect(homeFor(actor));
  const head = actor.role === 'HEAD';
  const curator = actor.role === 'EXPERT';
  // Куратор приходит с «Назначенных работ»: «Сегодня» и «Управления» у него
  // нет (Р-548).
  const back = head
    ? { href: TOOLS_HREF, label: 'Управление' }
    : curator
      ? { href: '/cabinet/projects', label: 'Назначенные работы' }
      : { href: '/cabinet/manage', label: 'Сегодня' };
  const views = checklistViews(actor);
  const view = checklistView(actor, (await searchParams).view);
  const lists = checklistsForView(actor, view);
  const groups = CHECKLIST_GROUPS.map((group) => ({
    ...group,
    lists: lists.filter((list) => list.group === group.key),
  })).filter((group) => group.lists.length > 0);

  return (
    <Shell actor={actor} current={back.href}>
      <ScreenHead
        backHref={back.href}
        backLabel={back.label}
        title="Чек-листы"
        note="Порядок основных дел по шагам: что сделать и на каком экране. Отметки здесь — памятка на одно дело, они не сохраняются. Это первая редакция: правки к шагам присылайте кнопкой замечаний справа внизу."
      />

      <Tabs
        label="Чек-листы"
        items={views.map((item) => ({
          href: `${CHECKLISTS_HREF}?view=${item.key}`,
          label: item.label,
          active: item.key === view,
        }))}
      />

      {view === 'service' ? (
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
            <Columns cards={group.lists.map((list) => <ChecklistCard key={list.key} list={list} head={head} />)} />
          </div>
        ))
      )}
    </Shell>
  );
}

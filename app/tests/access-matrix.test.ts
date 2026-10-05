/**
 * Матрица прав четырёх ролей. Тест написан как таблица, буквально
 * повторяющая матрицу PD-LK-FUNC-002, и является формальным выражением
 * критерия приёмки 10.4: расхождение кода с матрицей валит сборку.
 *
 * Запуск: node --test app/tests
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ACTIONS,
  can,
  contributionRefusal,
  curatorLine,
  expertLine,
  expertRoleLabel,
  presentAuthor,
  staffExpertLine,
  withoutStaffNames,
  ensure,
  scopeVersions,
  versionVisible,
  AccessDenied,
  hasContacts,
  presentProject,
  scopeComments,
  scopeLeads,
  scopeMaterials,
  scopePayouts,
  scopeProjects,
  type Action,
  type Actor,
  type ProjectRecord,
  type ProjectRef,
  type Role,
} from '../src/lib/cabinet/access.ts';
import { activeItem, hasToolsScreen, homeFor, navFor, soleWorkTarget } from '../src/lib/cabinet/nav.ts';

const NDA = new Date('2026-01-15T00:00:00Z');

const project: ProjectRef = {
  id: 'p1',
  clientId: 'c1',
  managerId: 'm1',
  expertId: 'e1',
};

const foreign: ProjectRef = {
  id: 'p2',
  clientId: 'c9',
  managerId: 'm1',
  expertId: 'e9',
};

const client: Actor = {
  id: 'u-client',
  role: 'CLIENT',
  status: 'ACTIVE',
  clientProfileId: 'c1',
  expertNdaSignedAt: null,
};
const expert: Actor = {
  id: 'e1',
  role: 'EXPERT',
  status: 'ACTIVE',
  clientProfileId: null,
  expertNdaSignedAt: NDA,
};
const manager: Actor = {
  id: 'm1',
  role: 'MANAGER',
  status: 'ACTIVE',
  clientProfileId: null,
  expertNdaSignedAt: null,
};
const head: Actor = {
  id: 'h1',
  role: 'HEAD',
  status: 'ACTIVE',
  clientProfileId: null,
  expertNdaSignedAt: null,
};

const actors: Record<Role, Actor> = {
  CLIENT: client,
  EXPERT: expert,
  MANAGER: manager,
  HEAD: head,
};

/**
 * Ожидания на «своём» проекте: для клиента — его проект, для эксперта —
 * назначенный ему. Порядок столбцов: клиент, эксперт, менеджер, руководитель.
 */
const OWN: Record<Action, [boolean, boolean, boolean, boolean]> = {
  PROJECT_VIEW: [true, true, true, true],
  PROJECT_EDIT: [false, false, true, true],
  PROJECT_ASSIGN_EXPERT: [false, false, true, true],
  // Раздача работ между кураторами — только руководителю (Р-149).
  PROJECT_SET_MANAGER: [false, false, false, true],
  STAGE_EDIT: [false, false, true, true],
  STAGE_SET_STATE: [false, false, true, true],
  STAGE_APPROVE: [true, false, true, true],
  // Вернуть этап с замечаниями — право самого клиента (Р-281).
  STAGE_RETURN: [true, false, false, false],
  // Сдать этап — куратору, вернуть куратору — практике (Э-05, Р-325).
  STAGE_HAND_OVER: [false, true, false, false],
  STAGE_HAND_BACK: [false, false, true, true],
  MATERIAL_VIEW: [true, true, true, true],
  MATERIAL_UPLOAD: [true, true, true, true],
  COMMENT_CREATE: [true, true, true, true],
  COMMENT_MODERATE: [false, false, true, true],
  MESSAGE_READ: [true, false, true, true],
  MESSAGE_WRITE: [true, false, true, true],
  // Внутренняя переписка — менеджеру работы и руководителю (РК-07, Р-336).
  INTERNAL_MESSAGE: [false, false, true, true],
  CONTACTS_VIEW: [false, false, true, true],
  // Способы связи куратора — практике работы (Э-10, Р-330).
  CURATOR_CONTACTS_VIEW: [false, false, true, true],
  // Открыть клиенту вход — куратору своей работы и руководителю (Р-285).
  CLIENT_ACCESS_OPEN: [false, false, true, true],
  CONTRACT_VIEW: [true, false, true, true],
  PAYMENT_EDIT: [false, false, false, true],
  PAYOUT_VIEW_OWN: [false, true, false, true],
  PAYOUT_MANAGE: [false, false, false, true],
  MARGIN_VIEW: [false, false, false, true],
  REQUEST_CREATE: [true, false, false, false],
  REQUEST_MODERATE: [false, false, true, true],
  REGISTRY_VIEW: [false, false, true, true],
  ANALYTICS_VIEW: [false, false, false, true],
  AUDIT_VIEW: [false, false, false, true],
  IMPORT_RUN: [false, false, false, true],
  DIRECTORY_EDIT: [false, false, false, true],
  USER_MANAGE: [false, false, false, true],
  ERASURE_EXECUTE: [false, false, false, true],
  ASSIGNMENT_CREATE: [false, false, false, true],
  // Разбор замечаний с виджета — только руководитель (Р-403).
  FEEDBACK_REVIEW: [false, false, false, true],
};

const ROLE_ORDER: Role[] = ['CLIENT', 'EXPERT', 'MANAGER', 'HEAD'];

describe('матрица прав на своём проекте', () => {
  for (const action of ACTIONS) {
    it(action, () => {
      const expected = OWN[action];
      ROLE_ORDER.forEach((role, index) => {
        assert.equal(
          can(actors[role], action, project),
          expected[index],
          `${role} × ${action}`,
        );
      });
    });
  }
});

describe('чужой проект', () => {
  it('клиент и эксперт не получают доступа к чужому проекту', () => {
    const projectScoped: Action[] = [
      'PROJECT_VIEW',
      'MATERIAL_VIEW',
      'MATERIAL_UPLOAD',
      'COMMENT_CREATE',
      'STAGE_APPROVE',
      'STAGE_RETURN',
      'MESSAGE_READ',
      'MESSAGE_WRITE',
      'CONTRACT_VIEW',
    ];
    for (const action of projectScoped) {
      assert.equal(can(client, action, foreign), false, `клиент × ${action}`);
      assert.equal(can(expert, action, foreign), false, `эксперт × ${action}`);
    }
  });

  it('менеджер видит чужого клиента в своей работе, руководитель — любую работу', () => {
    // `foreign` — работа другого клиента, но куратор у неё тот же `m1`.
    assert.equal(can(manager, 'PROJECT_VIEW', foreign), true);
    assert.equal(can(head, 'PROJECT_VIEW', foreign), true);
  });

  it('без указания проекта действие над проектом не разрешается', () => {
    assert.equal(can(client, 'PROJECT_VIEW', null), false);
    assert.equal(can(expert, 'MATERIAL_VIEW', null), false);
  });
});

describe('работа другого куратора', () => {
  // Выборки держали разграничение между кураторами, а права — нет:
  // менеджер мог действовать в работе, которую не видит ни в одном
  // перечне (решение Р-220).
  const otherCurator: ProjectRef = {
    id: 'p3',
    clientId: 'c3',
    managerId: 'm2',
    expertId: 'e3',
  };
  const projectBound: Action[] = [
    'PROJECT_VIEW',
    'PROJECT_EDIT',
    'PROJECT_ASSIGN_EXPERT',
    'STAGE_EDIT',
    'STAGE_SET_STATE',
    'STAGE_APPROVE',
    'STAGE_HAND_BACK',
    'MATERIAL_VIEW',
    'MATERIAL_UPLOAD',
    'COMMENT_CREATE',
    'COMMENT_MODERATE',
    'MESSAGE_READ',
    'MESSAGE_WRITE',
    'INTERNAL_MESSAGE',
    'CONTACTS_VIEW',
    'CURATOR_CONTACTS_VIEW',
    'CLIENT_ACCESS_OPEN',
    'CONTRACT_VIEW',
  ];

  for (const action of projectBound) {
    it(`менеджер × ${action}: в чужой работе нельзя, у руководителя можно`, () => {
      assert.equal(can(manager, action, otherCurator), false);
      assert.equal(can(head, action, otherCurator), true);
    });
  }

  it('без работы менеджеру разрешено то же, что прежде: перечни сужает выборка', () => {
    // «Открыть клиенту вход» и способы связи куратора — не перечни, а
    // действия над одной работой: без работы они запрещены намеренно
    // (Р-285, Р-330), см. отдельные проверки.
    const single: Action[] = ['CLIENT_ACCESS_OPEN', 'CURATOR_CONTACTS_VIEW', 'INTERNAL_MESSAGE'];
    for (const action of projectBound.filter((item) => !single.includes(item))) {
      assert.equal(can(manager, action, null), true, action);
    }
  });

  it('способы связи куратора без работы не открываются никому (Э-10, Р-330)', () => {
    assert.equal(can(manager, 'CURATOR_CONTACTS_VIEW', null), false);
    assert.equal(can(head, 'CURATOR_CONTACTS_VIEW', null), false);
  });

  it('дела практики без работы остаются менеджеру доступны', () => {
    assert.equal(can(manager, 'REQUEST_MODERATE', null), true);
    assert.equal(can(manager, 'REGISTRY_VIEW', null), true);
  });
});

describe('договор поручения обработки персональных данных', () => {
  it('эксперт без подписанного договора не видит материалов назначенного проекта', () => {
    const withoutNda: Actor = { ...expert, expertNdaSignedAt: null };
    assert.equal(can(withoutNda, 'MATERIAL_VIEW', project), false);
    assert.equal(can(withoutNda, 'PROJECT_VIEW', project), false);
    assert.equal(scopeProjects(withoutNda), null);
  });
});

describe('состояние учётной записи', () => {
  for (const status of ['SUSPENDED', 'ERASED'] as const) {
    it(`учётная запись в состоянии ${status} не делает ничего`, () => {
      for (const role of ROLE_ORDER) {
        const blocked: Actor = { ...actors[role], status };
        for (const action of ACTIONS) {
          assert.equal(can(blocked, action, project), false, `${role} × ${action}`);
        }
        assert.equal(scopeProjects(blocked), null);
        assert.equal(scopeComments(blocked), null);
      }
    });
  }
});

describe('ограничение выборки', () => {
  it('клиент ограничен своими проектами', () => {
    assert.deepEqual(scopeProjects(client), { clientId: 'c1' });
  });

  it('эксперт ограничен назначенными проектами', () => {
    assert.deepEqual(scopeProjects(expert), { expertId: 'e1' });
  });

  it('менеджер ограничен своими работами, руководитель не ограничен', () => {
    // Менеджер ведёт свои работы, а не всю практику (решение Р-149).
    assert.deepEqual(scopeProjects(manager), { managerId: 'm1' });
    assert.deepEqual(scopeProjects(head), {});
  });

  it('удалённые материалы скрыты от всех, кроме руководителя', () => {
    assert.deepEqual(scopeMaterials(manager), {
      deletedAt: null,
      project: { managerId: 'm1' },
    });
    assert.deepEqual(scopeMaterials(head), {});
    assert.deepEqual(scopeMaterials(client), {
      deletedAt: null,
      project: { clientId: 'c1' },
    });
  });

  it('непубликованный комментарий эксперта не попадает в выборку клиента', () => {
    assert.deepEqual(scopeComments(client), {
      OR: [{ moderationStatus: 'PUBLISHED' }, { authorId: 'u-client' }],
    });
    assert.deepEqual(scopeComments(manager), {});
  });

  it('заявки чужих работ менеджеру не видны, неразобранные видны (Р-251)', () => {
    assert.deepEqual(scopeLeads(manager), {
      OR: [{ projectId: null }, { project: { managerId: 'm1' } }],
    });
    assert.deepEqual(scopeLeads(head), {});
    assert.equal(scopeLeads(client), null);
    assert.equal(scopeLeads(expert), null);
    assert.equal(scopeLeads({ ...manager, status: 'SUSPENDED' }), null);
  });

  it('эксперт видит только собственные начисления', () => {
    assert.deepEqual(scopePayouts(expert), { expertId: 'e1' });
    assert.deepEqual(scopePayouts(head), {});
    assert.equal(scopePayouts(manager), null);
    assert.equal(scopePayouts(client), null);
  });
});

describe('ограничение полей', () => {
  const record: ProjectRecord = {
    ...project,
    code: 'PD-2026-001',
    title: 'Сопровождение диссертации',
    status: 'ACTIVE',
    client: {
      id: 'c1',
      fullName: 'Иванов Иван Иванович',
      university: 'МГТУ',
      speciality: '2.8.6',
      phone: '+7 999 000-00-00',
      email: 'client@example.org',
    },
    contractTotal: 60000000n,
    payoutsTotal: 20000000n,
  };

  it('в представлении для клиента и эксперта контактов нет', () => {
    for (const actor of [client, expert]) {
      const view = presentProject(actor, record);
      assert.equal(hasContacts(view), false);
      // Контакты отсутствуют физически, а не скрыты: сериализация их не найдёт.
      const serialised = JSON.stringify(view);
      assert.ok(!serialised.includes('+7 999'), 'телефон просочился в представление');
      assert.ok(!serialised.includes('client@example.org'), 'адрес просочился в представление');
      assert.ok(!('margin' in view), 'маржа просочилась в представление');
      assert.ok(!('contractTotal' in view), 'сумма договора просочилась в представление');
    }
  });

  it('менеджер видит контакты и сумму договора, но не маржу', () => {
    const view = presentProject(manager, record);
    assert.equal(hasContacts(view), true);
    assert.ok('contractTotal' in view);
    assert.ok(!('margin' in view), 'менеджеру маржа не показывается');
  });

  it('руководитель видит маржу как разность договора и начислений', () => {
    const view = presentProject(head, record);
    assert.ok('margin' in view);
    assert.equal((view as { margin: bigint | null }).margin, 40000000n);
  });

  it('у исторического проекта без начислений маржа равна сумме договора', () => {
    const historical: ProjectRecord = { ...record, expertId: null, payoutsTotal: null };
    const view = presentProject(head, historical);
    assert.equal((view as { margin: bigint | null }).margin, 60000000n);
  });
});

describe('ensure', () => {
  it('отказ выражается исключением AccessDenied', () => {
    assert.throws(() => ensure(expert, 'MARGIN_VIEW', project), AccessDenied);
    assert.doesNotThrow(() => ensure(head, 'MARGIN_VIEW', project));
  });
});

describe('полнота матрицы', () => {
  it('каждое действие описано в таблице ожиданий', () => {
    assert.deepEqual(Object.keys(OWN).sort(), [...ACTIONS].sort());
  });
});

describe('меню подсвечивает раздел, в котором человек находится', () => {
  /**
   * Сверка строгим равенством оставляла без подсветки шесть служебных
   * экранов — их адресов в меню нет, — а реестры и заявки подсвечивали
   * «Сводку». Теперь берётся самый длинный подходящий пункт, а служебный
   * контур целиком подсвечивает «Управление» (решение Р-183).
   */
  const head: Actor = {
    id: 'head-nav',
    role: 'HEAD',
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  };
  const items = navFor(head);

  const cases: readonly [string, string][] = [
    ['/cabinet/manage', '/cabinet/manage'],
    ['/cabinet/manage/leads', '/cabinet/manage/tools'],
    ['/cabinet/manage/registry', '/cabinet/manage/tools'],
    ['/cabinet/manage/users', '/cabinet/manage/tools'],
    ['/cabinet/manage/audit', '/cabinet/manage/tools'],
    ['/cabinet/manage/erasure', '/cabinet/manage/tools'],
    ['/cabinet/manage/import', '/cabinet/manage/tools'],
    ['/cabinet/manage/outbox', '/cabinet/manage/tools'],
    ['/cabinet/manage/directory', '/cabinet/manage/tools'],
    ['/cabinet/manage/tools', '/cabinet/manage/tools'],
    // Деньги и аналитика — свои пункты, и служебный контур их не
    // перехватывает, хотя адреса начинаются одинаково.
    ['/cabinet/manage/finance', '/cabinet/manage/finance'],
    ['/cabinet/manage/finance/years', '/cabinet/manage/finance'],
    ['/cabinet/manage/analytics', '/cabinet/manage/analytics'],
    ['/cabinet/manage/analytics/money', '/cabinet/manage/analytics'],
    // «Рекомендации» — свой пункт (РК-17, Р-350).
    ['/cabinet/manage/recommendations', '/cabinet/manage/recommendations'],
    ['/cabinet/manage/recommendations/calendar', '/cabinet/manage/recommendations'],
    ['/cabinet/projects', '/cabinet/projects'],
    ['/cabinet/settings', '/cabinet/settings'],
  ];

  for (const [current, expected] of cases) {
    it(`${current} → ${expected}`, () => {
      assert.equal(activeItem(items, current), expected);
    });
  }

  it('чужой адрес не подсвечивает ничего', () => {
    assert.equal(activeItem(items, '/cabinet/enter/abc'), null);
  });
});

describe('меню менеджера и начальный экран роли (М-05, Р-305)', () => {
  const manager: Actor = {
    id: 'manager-nav',
    role: 'MANAGER',
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  };
  const head: Actor = { ...manager, id: 'head-home', role: 'HEAD' };
  const items = navFor(manager);

  it('пункты менеджера: Сегодня, Мои работы, Заявки, Реестры, Настройки', () => {
    assert.deepEqual(
      items.map((item) => [item.href, item.label]),
      [
        ['/cabinet/manage', 'Сегодня'],
        ['/cabinet/projects', 'Мои работы'],
        ['/cabinet/manage/leads', 'Заявки'],
        ['/cabinet/manage/registry', 'Реестры'],
        ['/cabinet/settings', 'Настройки'],
      ],
    );
    assert.equal(hasToolsScreen(manager), false, 'менеджеру остался промежуточный экран');
    assert.equal(hasToolsScreen(head), true, 'руководитель потерял «Управление»');
  });

  const cases: readonly [string, string][] = [
    ['/cabinet/manage', '/cabinet/manage'],
    ['/cabinet/manage/leads', '/cabinet/manage/leads'],
    ['/cabinet/manage/leads/lead-1', '/cabinet/manage/leads'],
    ['/cabinet/manage/registry', '/cabinet/manage/registry'],
    // «Новый заказ» передаёт каркасу адрес перечня работ.
    ['/cabinet/projects', '/cabinet/projects'],
    ['/cabinet/settings', '/cabinet/settings'],
  ];
  for (const [current, expected] of cases) {
    it(`${current} → ${expected}`, () => {
      assert.equal(activeItem(items, current), expected);
    });
  }

  it('начальный экран: штатным ролям — «Сегодня» или сводка, клиенту и эксперту — работы', () => {
    assert.equal(homeFor(manager), '/cabinet/manage');
    assert.equal(homeFor(head), '/cabinet/manage');
    assert.equal(homeFor(client), '/cabinet/projects');
    assert.equal(homeFor(expert), '/cabinet/projects');
  });

  it('начальный экран доступен самой роли — перенаправление не зацикливается', () => {
    for (const actor of [manager, head]) assert.equal(can(actor, 'REQUEST_MODERATE'), true);
    for (const actor of [client, expert]) assert.equal(can(actor, 'PROJECT_VIEW', project), true);
  });
});

describe('замечания клиента при возврате этапа (Р-281)', async () => {
  const { presentReturnText, RETURN_TEXT_WITH_CURATOR } = await import('../src/lib/cabinet/access.ts');
  const plain = { reason: 'В главе 2 нет сравнения с методом Монте-Карло', contactHint: false };
  const withContact = { reason: 'Позвоните мне: +7 900 000-00-00', contactHint: true };

  it('клиент и практика видят текст всегда', () => {
    for (const actor of [client, manager, head]) {
      assert.equal(presentReturnText(actor, withContact), withContact.reason);
    }
  });

  it('эксперт видит текст без контактов, а с контактом — строку о кураторе', () => {
    assert.equal(presentReturnText(expert, plain), plain.reason);
    assert.equal(presentReturnText(expert, withContact), RETURN_TEXT_WITH_CURATOR);
  });
});

describe('открыть клиенту вход (Р-285)', () => {
  it('без работы действие не разрешается никому, даже менеджеру', () => {
    assert.equal(can(manager, 'CLIENT_ACCESS_OPEN', null), false);
    assert.equal(can(head, 'CLIENT_ACCESS_OPEN', null), false);
  });
});

describe('закрытая работа — только чтение (Т-17, М-10, Р-293)', () => {
  const roles: Role[] = ['CLIENT', 'EXPERT', 'MANAGER', 'HEAD'];
  const as = (role: Role): Actor => ({
    id: 'x',
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: NDA,
  });

  it('действующая и приостановленная работа — вклад открыт всем ролям', () => {
    for (const role of roles) {
      for (const status of ['ACTIVE', 'PAUSED']) {
        assert.equal(contributionRefusal(as(role), status, 'IN_PROGRESS'), null, `${role} ${status}`);
      }
    }
  });

  it('завершённая и отменённая работа — закрыта всем ролям', () => {
    for (const role of roles) {
      for (const status of ['COMPLETED', 'CANCELLED']) {
        const refusal = contributionRefusal(as(role), status, 'IN_PROGRESS');
        assert.ok(refusal !== null, `${role} ${status}`);
        const practice = role === 'MANAGER' || role === 'HEAD';
        assert.match(refusal!, practice ? /возобновите/u : /напишите менеджеру/u);
      }
    }
  });

  it('завершённый этап — клиенту и эксперту закрыт, практике открыт', () => {
    assert.match(contributionRefusal(as('CLIENT'), 'ACTIVE', 'DONE') ?? '', /Этап завершён/u);
    assert.match(contributionRefusal(as('EXPERT'), 'PAUSED', 'DONE') ?? '', /Этап завершён/u);
    assert.equal(contributionRefusal(as('MANAGER'), 'ACTIVE', 'DONE'), null);
    assert.equal(contributionRefusal(as('HEAD'), 'ACTIVE', 'DONE'), null);
  });
});

describe('версия эксперта — после публикации (Т-18, Р-294)', () => {
  const as = (role: Role, id = 'x'): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: NDA,
  });
  const pending = { uploadedById: 'e1', moderation: { status: 'PENDING' } };
  const rejected = { uploadedById: 'e1', moderation: { status: 'REJECTED' } };
  const published = { uploadedById: 'e1', moderation: { status: 'PUBLISHED' } };
  const plain = { uploadedById: 'c1', moderation: null };

  it('практике видно всё, выборка не сужается', () => {
    assert.deepEqual(scopeVersions(as('MANAGER')), {});
    assert.deepEqual(scopeVersions(as('HEAD')), {});
    assert.equal(versionVisible(as('MANAGER'), pending), true);
  });

  it('клиенту — опубликованные и не требующие публикации', () => {
    const client = as('CLIENT', 'c1');
    assert.equal(versionVisible(client, plain), true);
    assert.equal(versionVisible(client, published), true);
    assert.equal(versionVisible(client, pending), false);
    assert.equal(versionVisible(client, rejected), false);
    assert.ok(!JSON.stringify(scopeVersions(client)).includes('uploadedById'));
  });

  it('эксперту — то же и свои', () => {
    assert.equal(versionVisible(as('EXPERT', 'e1'), pending), true);
    assert.equal(versionVisible(as('EXPERT', 'e2'), pending), false);
    assert.match(JSON.stringify(scopeVersions(as('EXPERT', 'e1'))), /"uploadedById":"e1"/u);
  });

  it('приостановленной учётной записи — ничего', () => {
    assert.equal(scopeVersions({ ...as('CLIENT'), status: 'SUSPENDED' }), null);
  });
});

describe('представление участника работы (Т-11, Р-297)', () => {
  const as = (role: Role, id = 'x'): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: NDA,
  });
  const expert = { fullName: 'Григорьев Антон Эдуардович', role: 'EXPERT' };

  it('клиент видит куратора словом «Куратор», практика — по имени (ОЭ-3а)', () => {
    assert.equal(presentAuthor(expert, as('CLIENT')), 'Куратор');
    assert.equal(presentAuthor(expert, as('CLIENT'), 'e1'), 'Куратор');
    assert.equal(presentAuthor(expert, as('MANAGER')), expert.fullName);
    assert.equal(presentAuthor(expert, as('EXPERT', 'e1'), 'e1'), 'Вы');
    // Менеджера и руководителя клиент видит «Менеджер», без имени (ОЭ-3б, С-3).
    assert.equal(presentAuthor({ fullName: 'Нечаева К. И.', role: 'MANAGER' }, as('CLIENT')), 'Менеджер');
    assert.equal(presentAuthor({ fullName: 'Орлов П. С.', role: 'HEAD' }, as('CLIENT')), 'Менеджер');
    assert.equal(presentAuthor({ fullName: 'Нечаева К. И.', role: 'MANAGER' }, as('EXPERT')), 'Нечаева К. И.');
    assert.equal(expertRoleLabel(null), 'Куратор по специальности');
    assert.equal(expertRoleLabel('METHODOLOGIST'), 'Методолог');
  });

  it('строки «О работе»: пустые части не выводятся', () => {
    assert.equal(
      curatorLine({ fullName: 'Нечаева К. И.', expertProfile: { degree: 'к.т.н.', specialization: 'горные машины' } }),
      'Нечаева К. И., к.т.н., горные машины',
    );
    assert.equal(curatorLine({ fullName: 'Нечаева К. И.', expertProfile: null }), 'Нечаева К. И.');
    assert.equal(expertLine({ degree: 'д.т.н.', specialtyCode: '2.8.6' }), 'д.т.н., 2.8.6');
    assert.equal(expertLine({ degree: ' ', specialtyCode: null }), '');
  });

  it('в данных экрана клиента нет ФИО и почты сотрудников; у практики — есть', () => {
    const data = {
      manager: { fullName: 'Нечаева К. И.', role: 'MANAGER' },
      expert: { id: 'e1', fullName: expert.fullName, role: 'EXPERT', email: 'expert@example.org' },
      materials: [{ versions: [{ uploadedBy: { fullName: expert.fullName, role: 'EXPERT' }, uploadedAt: new Date(0) }] }],
    };
    const client = withoutStaffNames(as('CLIENT'), data);
    const text = JSON.stringify(client);
    assert.ok(!text.includes('Григорьев'), 'ФИО эксперта осталось в данных клиента');
    assert.ok(!text.includes('expert@example.org'), 'почта эксперта осталась в данных клиента');
    assert.ok(!text.includes('Нечаева'), 'ФИО менеджера осталось в данных клиента (ОЭ-3б)');
    assert.ok(client.materials[0]!.versions[0]!.uploadedAt instanceof Date, 'дата испорчена');
    assert.equal(withoutStaffNames(as('MANAGER'), data), data);
  });
});

describe('исполнитель на виду у практики (М-16, Р-298)', () => {
  it('ФИО и отметка о договоре; книга заказов; не назначен', () => {
    assert.equal(
      staffExpertLine({ fullName: 'Григорьев А. Э.', expertProfile: { ndaSignedAt: null } }),
      'куратор — Григорьев А. Э. · без договора поручения',
    );
    assert.equal(staffExpertLine({ fullName: 'Григорьев А. Э.', expertProfile: { ndaSignedAt: NDA } }), 'куратор — Григорьев А. Э.');
    assert.equal(staffExpertLine(null, 'Петров (книга)'), 'куратор — Петров (книга)');
    assert.equal(staffExpertLine(null, '  '), 'куратор не назначен');
  });
});

describe('одна работа — сразу карточка (Т-09, Р-311)', () => {
  const base = {
    role: 'CLIENT' as const,
    welcomeOpen: false,
    asked: false,
    all: 1,
    rows: [{ code: 'PD-2026-001', status: 'ACTIVE' }],
  };

  it('одна действующая или приостановленная работа — карточка', () => {
    assert.equal(soleWorkTarget(base), '/cabinet/projects/PD-2026-001');
    assert.equal(soleWorkTarget({ ...base, rows: [{ code: 'PD-2026-001', status: 'PAUSED' }] }), '/cabinet/projects/PD-2026-001');
  });

  it('иначе — перечень', () => {
    assert.equal(soleWorkTarget({ ...base, all: 2 }), null);
    assert.equal(soleWorkTarget({ ...base, rows: [{ code: 'PD-2026-001', status: 'COMPLETED' }] }), null);
    assert.equal(soleWorkTarget({ ...base, welcomeOpen: true }), null, 'открытый блок первого входа');
    assert.equal(soleWorkTarget({ ...base, asked: true }), null, 'отбор в адресе');
    assert.equal(soleWorkTarget({ ...base, role: 'MANAGER' }), null);
  });

  it('на карточке подсвечены «Мои работы»', () => {
    // Карточка передаёт каркасу адрес перечня работ.
    assert.equal(activeItem(navFor(client), '/cabinet/projects'), '/cabinet/projects');
  });
});

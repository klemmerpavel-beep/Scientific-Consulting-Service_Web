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
  ensure,
  AccessDenied,
  hasContacts,
  presentProject,
  scopeComments,
  scopeMaterials,
  scopePayouts,
  scopeProjects,
  type Action,
  type Actor,
  type ProjectRecord,
  type ProjectRef,
  type Role,
} from '../src/lib/cabinet/access.ts';

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
  STAGE_EDIT: [false, false, true, true],
  STAGE_SET_STATE: [false, false, true, true],
  STAGE_APPROVE: [true, false, true, true],
  MATERIAL_VIEW: [true, true, true, true],
  MATERIAL_UPLOAD: [true, true, true, true],
  COMMENT_CREATE: [true, true, true, true],
  COMMENT_MODERATE: [false, false, true, true],
  MESSAGE_READ: [true, false, true, true],
  MESSAGE_WRITE: [true, false, true, true],
  CONTACTS_VIEW: [false, false, true, true],
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
      'MESSAGE_READ',
      'MESSAGE_WRITE',
      'CONTRACT_VIEW',
    ];
    for (const action of projectScoped) {
      assert.equal(can(client, action, foreign), false, `клиент × ${action}`);
      assert.equal(can(expert, action, foreign), false, `эксперт × ${action}`);
    }
  });

  it('менеджер и руководитель видят любой проект', () => {
    assert.equal(can(manager, 'PROJECT_VIEW', foreign), true);
    assert.equal(can(head, 'PROJECT_VIEW', foreign), true);
  });

  it('без указания проекта действие над проектом не разрешается', () => {
    assert.equal(can(client, 'PROJECT_VIEW', null), false);
    assert.equal(can(expert, 'MATERIAL_VIEW', null), false);
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

  it('менеджер и руководитель не ограничены', () => {
    assert.deepEqual(scopeProjects(manager), {});
    assert.deepEqual(scopeProjects(head), {});
  });

  it('удалённые материалы скрыты от всех, кроме руководителя', () => {
    assert.deepEqual(scopeMaterials(manager), { deletedAt: null });
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

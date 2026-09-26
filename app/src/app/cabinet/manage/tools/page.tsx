import { flashText } from '../../../../lib/cabinet/flash';
import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import { SANS } from '../../../../components/cabinet/tokens';
import {
  Button,
  Card,
  Chip,
  Field,
  Form,
  FormActions,
  Heading,
  Outcome,
  ScreenHead,
  Text,
} from '../../../../components/cabinet/ui';
import { can, type Action } from '../../../../lib/cabinet/access';
import { currentActor } from '../../../../lib/cabinet/session';
import { requestHelp } from '../../actions';

export const dynamic = 'force-dynamic';

/**
 * Служебный контур практики.
 *
 * Разделы отсюда в первый ряд навигации не выносятся решением Р-140: они
 * нужны изредка и вытеснили бы работу. Но и оставлять их доступными только
 * по набранному вручную адресу неправильно — так о них знает лишь тот, кто
 * писал код. Один пункт меню и страница со ссылками: место в навигации
 * занято одной строкой, а попасть можно куда угодно.
 *
 * Роль решает не этот перечень, а матрица прав: каждому видно ровно то, на
 * что он имеет право, и чужая ссылка не показывается вовсе.
 */
const GROUPS = [
  {
    key: 'work',
    title: 'Обращения и клиенты',
    note: 'То, с чем куратор работает изо дня в день.',
  },
  {
    key: 'setup',
    title: 'Настройка практики',
    note: 'Как устроены типы работ, планы и доступ сотрудников.',
  },
  {
    key: 'law',
    title: 'Надзор и право',
    note: 'Чем практика отчитывается: журналы, доставка, требования субъектов.',
  },
] as const;

type GroupKey = (typeof GROUPS)[number]['key'];

/**
 * Порядок обычного дня.
 *
 * Заказчик сказал прямо: логика экрана непонятна и неясно, как с ним
 * работать. Перечень разделов на это не отвечает — отвечает распорядок:
 * с чего начинают, что проверяют раз в неделю и что раз в месяц
 * (решение Р-201).
 */
const ROUTINE: readonly { term: string; text: string }[] = [
  {
    term: 'Утром',
    text: 'Главная практики: что требует внимания — сорванные сроки, ждущие клиента работы, непрочитанные сообщения. Оттуда — в работу или в заявки.',
  },
  {
    term: 'В течение дня',
    text: 'Новые обращения разбираются в «Заявках», правка сроков и состава этапов — внутри самой работы.',
  },
  {
    term: 'Раз в неделю',
    text: 'Очередь уведомлений и зеркало на диске: дошли ли письма, ушла ли копия. Там же — реестры, если нужен полный вид клиента.',
  },
  {
    term: 'Раз в месяц',
    text: 'Справочники: типы сопровождения и шаблоны этапов приводятся к тому, как работают на самом деле. Отчёт за период берётся с главной кнопкой справа вверху.',
  },
  {
    term: 'По случаю',
    text: 'Учётные записи, перенос книги заказов, журналы и требования субъектов — открываются по поводу, а не по расписанию.',
  },
];

/** Частота задаёт порядок в группе: ежедневное выше редкого. */
const OFTEN_ORDER: Record<string, number> = {
  'Каждый день': 0,
  'Раз в неделю': 1,
  'Раз в месяц': 2,
  'По случаю': 3,
};

/**
 * Что за раздел, зачем он и когда в него заходят.
 *
 * Подпись называет не содержимое экрана, а задачу, которую им решают:
 * «Журналы: кто и что изменил» не отвечает на вопрос, зачем туда идти, а
 * «разобрать спор о том, кто и когда правил работу» — отвечает
 * (решение Р-192).
 */
const TOOLS: readonly {
  href: string;
  title: string;
  note: string;
  /** Повод: по какому случаю сюда идут. */
  when: string;
  /** Как часто открывают — этим и задан порядок дня. */
  often: 'Каждый день' | 'Раз в неделю' | 'Раз в месяц' | 'По случаю';
  action: Action;
  group: GroupKey;
}[] = [
  {
    href: '/cabinet/projects',
    title: 'Работы практики',
    note: 'Вести перечень заказов: отбор и поиск, а внутри работы — правка карточки, сроков и состава этапов.',
    when: 'Клиент просит изменить срок, тему или состав этапов; нужно понять, где стоит работа.',
    often: 'Каждый день',
    action: 'PROJECT_VIEW',
    group: 'work',
  },
  {
    href: '/cabinet/manage/leads',
    title: 'Все заявки',
    note: 'Разобрать обращение, найти старое, выгрузить отобранный перечень. Отбор по странице сайта, состоянию и поиску.',
    when: 'Пришло новое обращение либо нужно поднять старое — кто просил, когда и чем закончилось.',
    often: 'Каждый день',
    action: 'REQUEST_MODERATE',
    group: 'work',
  },
  {
    href: '/cabinet/manage/registry',
    title: 'Реестры',
    note: 'Посмотреть, что практика знает о клиенте или исполнителе, и проверить сообщения с признаком передачи контактов.',
    when: 'Клиент звонит, а карточку надо открыть целиком; либо проверяется сообщение с признаком передачи контактов.',
    often: 'Раз в неделю',
    action: 'REGISTRY_VIEW',
    group: 'work',
  },
  {
    href: '/cabinet/manage/directory',
    title: 'Справочники',
    note: 'Завести новый тип сопровождения или поправить шаблон этапов, который разворачивается при одобрении заявки.',
    when: 'Практика начинает вести новый вид работ, либо план этапов у типа перестал совпадать с тем, как работают.',
    often: 'Раз в месяц',
    action: 'DIRECTORY_EDIT',
    group: 'setup',
  },
  {
    href: '/cabinet/manage/users',
    title: 'Учётные записи',
    note: 'Открыть или закрыть доступ сотруднику, сменить роль, отметить договор поручения обработки персональных данных.',
    when: 'Вышел новый сотрудник, ушёл прежний, эксперт подписал договор поручения.',
    often: 'По случаю',
    action: 'USER_MANAGE',
    group: 'setup',
  },
  {
    href: '/cabinet/manage/import',
    title: 'Перенос книги заказов',
    note: 'Перенести историю из таблицы учёта: разбор файла, отчёт с замечаниями по строкам, фиксация загрузки.',
    when: 'Часть истории ещё ведётся в таблице учёта и переносится в кабинет.',
    often: 'По случаю',
    action: 'IMPORT_RUN',
    group: 'setup',
  },
  {
    href: '/cabinet/manage/audit',
    title: 'Журналы',
    note: 'Разобрать спор: кто и когда правил работу, кому и когда выдавались файлы.',
    when: 'Спор о том, кто и когда правил работу или выдавал файл; проверка перед ответом клиенту.',
    often: 'По случаю',
    action: 'AUDIT_VIEW',
    group: 'law',
  },
  {
    href: '/cabinet/manage/outbox',
    title: 'Очередь уведомлений',
    note: 'Проверить, дошло ли письмо: что ушло, что ждёт отправки, что не доставлено и почему.',
    when: 'Клиент говорит, что письма не получал, либо на главной показано недоставленное.',
    often: 'Раз в неделю',
    action: 'AUDIT_VIEW',
    group: 'law',
  },
  {
    href: '/cabinet/manage/disk',
    title: 'Зеркало на облачном диске',
    note: 'Проверить, идёт ли выгрузка таблиц и материалов на диск: когда была последняя, что ушло, были ли ошибки.',
    when: 'Проверка, что копия материалов и таблиц ушла на диск и её есть откуда взять.',
    often: 'Раз в неделю',
    action: 'AUDIT_VIEW',
    group: 'law',
  },
  {
    href: '/cabinet/manage/erasure',
    title: 'Удаление данных субъекта',
    note: 'Исполнить требование по ст. 21 152-ФЗ и выдать заявителю отчёт о том, что именно затёрто.',
    when: 'Поступило требование субъекта по ст. 21 152-ФЗ — его исполняют в тридцать дней.',
    often: 'По случаю',
    action: 'ERASURE_EXECUTE',
    group: 'law',
  },
];

export default async function ToolsScreen({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  const params = await searchParams;
  // Причина отказа — по метке из одноразовой cookie, не из адреса (Р-243).
  const failure = await flashText(params.error);

  const allowed = TOOLS.filter((tool) => can(actor, tool.action));
  if (allowed.length === 0) redirect('/cabinet/projects');

  const groups = GROUPS.map((group) => ({
    ...group,
    tools: allowed
      .filter((tool) => tool.group === group.key)
      .slice()
      .sort((a, b) => OFTEN_ORDER[a.often] - OFTEN_ORDER[b.often]),
  })).filter((group) => group.tools.length > 0);

  // Менеджеру открыты не все разделы, и пустое место на экране читается как
  // поломка. Строка называет причину прямо: остальное ведёт руководитель
  // практики (решение Р-192).
  const partial = allowed.length < TOOLS.length;

  return (
    <Shell actor={actor} current="/cabinet/manage/tools">
      <ScreenHead
        title="Служебные разделы"
        note="Всё, что не входит в ежедневную работу с заказами: настройка практики, надзорные журналы и перенос истории. Ниже — порядок работы, а у каждого раздела названы повод и частота."
      />

      {/* Порядок обычного дня: сверху сказано, с чего начинают и чем
          заканчивают, а карточки ниже разложены по тому же порядку —
          иначе перечень разделов читается как список ящиков без подписей
          (решение Р-201). */}
      <Card style={{ marginBottom: 24 }}>
        <Heading level={2} size={3} style={{ marginBottom: 4 }}>
          Как этим пользоваться
        </Heading>
        <Text muted size={14} style={{ marginBottom: 14 }}>
          Разделы идут по частоте: сверху то, что открывают каждый день, ниже — редкое. Метка у
          названия говорит, как часто сюда заходят, строка под ним — по какому случаю.
        </Text>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
          {ROUTINE.map((step) => (
            <li key={step.term} style={{ fontFamily: SANS, fontSize: 14, lineHeight: 1.6 }}>
              <strong style={{ fontWeight: 600 }}>{step.term}.</strong> {step.text}
            </li>
          ))}
        </ol>
      </Card>

      {params.sent === undefined ? null : (
        <Outcome>Вопрос отправлен руководителю практики.</Outcome>
      )}
      {failure === undefined ? null : (
        <Outcome tone="error">{failure}</Outcome>
      )}

      {groups.map((group) => (
        // Группа набрана `div`, а не `section`: сценарий движения сайта
        // забирает `main > section` и дописывает плашкам задержку
        // появления прямо в разметку, а снимок принимает облик, а не
        // движение (решения Р-186, Р-192).
        <div className="cab-block" key={group.key} style={{ marginBottom: 24 }}>
          <Heading level={2} size={3} style={{ marginBottom: 4 }}>
            {group.title}
          </Heading>
          <Text muted size={14} style={{ marginBottom: 14 }}>
            {group.note}
          </Text>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              display: 'grid',
              // Не больше двух плашек в ряду: третья ужимает строки до
              // разрыва посреди слова (решение Р-189).
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(420px,100%),1fr))',
              gap: 16,
              maxWidth: 'calc(2 * 560px + 16px)',
            }}
          >
            {group.tools.map((tool) => (
              <Card as="li" key={tool.href} link>
                <div
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    marginBottom: 4,
                  }}
                >
                  {/* Ссылка растянута на плашку, как на плашках внимания:
                      подсвечивается плашка целиком, и нажиматься должна
                      она же, а не строка названия (решения Р-209, Р-253). */}
                  <Heading level={3} size={3}>
                    <a className="cab-stretch" href={tool.href}>{tool.title}</a>
                  </Heading>
                  <Chip>{tool.often}</Chip>
                </div>
                <Text muted size={14} style={{ marginBottom: 8 }}>
                  {tool.note}
                </Text>
                {/* Повод: заказчик писал, что логика экрана непонятна и
                    неясно, как с ним работать. Назначение раздела само по
                    себе на это не отвечает — отвечает случай, по которому
                    сюда идут (решение Р-201). */}
                <Text muted size={13}>
                  Заходят, когда: {tool.when}
                </Text>
              </Card>
            ))}
          </ul>
        </div>
      ))}

      {partial ? (
        <Text muted size={14} style={{ marginBottom: 24 }}>
          Остальные служебные разделы — справочники, журналы, перенос книги заказов, учётные
          записи — ведёт руководитель практики.
        </Text>
      ) : null}

      {/* Спросить руководителя было негде: переписка в кабинете — только с
          клиентом. Вопрос идёт той же очередью уведомлений, что и всё
          прочее, и приходит выбранным руководителем каналом
          (решение Р-199). */}
      {actor.role === 'HEAD' ? null : (
        <Card>
          <Heading level={2} size={3} style={{ marginBottom: 4 }}>
            Спросить руководителя практики
          </Heading>
          <Text muted size={14} style={{ marginBottom: 14 }}>
            Спорный случай, нестандартная просьба клиента, сомнение по срокам или цене — вопрос
            уйдёт руководителю и вернётся ответом тем каналом, который он выбрал.
          </Text>
          <Form action={requestHelp}>
            <Field
              label="В чём нужна помощь"
              name="text"
              required
              multiline
              placeholder="Клиент просит перенести защиту на месяц и сменить тему. Стоит ли пересматривать договор?"
            />
            <FormActions>
              <Button>Отправить вопрос</Button>
            </FormActions>
          </Form>
        </Card>
      )}
    </Shell>
  );
}

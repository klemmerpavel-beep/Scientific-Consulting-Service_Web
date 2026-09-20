import { notFound, redirect } from 'next/navigation';

import Shell from '../../../../../components/cabinet/Shell';
import {
  Button,
  Card,
  Checkbox,
  Chip,
  Disclosure,
  Field,
  Form,
  FormActions,
  Heading,
  Narrow,
  ScreenHead,
  Select,
  Text,
  formatDate,
} from '../../../../../components/cabinet/ui';
import { ensure } from '../../../../../lib/cabinet/access';
import { leadSourceLabel } from '../../../../../lib/cabinet/lead-labels';
import { leadById, serviceTypes } from '../../../../../lib/cabinet/queries';
import { currentActor } from '../../../../../lib/cabinet/session';
import { moderateLead } from '../../../actions';

export const dynamic = 'force-dynamic';

/**
 * Разбор одной заявки.
 *
 * Формы одобрения и отказа стояли в очереди на сводке — по две на каждую
 * заявку, со списком типов сопровождения и полем причины. Это около трёхсот
 * пикселей, повторённых столько раз, сколько заявок на странице, и именно
 * из-за них сводка не помещалась в окно (решение Р-172).
 *
 * Здесь обращение видно целиком: что человек написал, чем оставил контакт,
 * дал ли согласие на обработку.
 */
export default async function LeadScreen({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  ensure(actor, 'REQUEST_MODERATE');

  const { id } = await params;
  const [lead, types] = await Promise.all([leadById(actor, id), serviceTypes(actor)]);
  if (lead === null) notFound();

  return (
    <Shell actor={actor} current="/cabinet/manage">
      <Narrow width={780}>
        <ScreenHead
          backHref="/cabinet/manage"
          backLabel="к сводке"
          title={lead.name ?? 'Заявка без имени'}
          chips={<Chip tone="accent">{leadSourceLabel(lead.source)}</Chip>}
          note={`${lead.contactKind === 'email' ? 'Почта' : 'Телефон'}: ${lead.contact}`}
          aside={formatDate(lead.createdAt)}
        />

        <Card style={{ marginBottom: 24 }}>
          {lead.topic === null ? null : (
            <Text style={{ marginBottom: 12 }}>
              <strong style={{ fontWeight: 600 }}>Тема: </strong>
              {lead.topic}
            </Text>
          )}
          {lead.message === null ? (
            <Text muted>Обращение без текста: человек оставил только контакт.</Text>
          ) : (
            <Text style={{ whiteSpace: 'pre-wrap' }}>{lead.message}</Text>
          )}
          <Text muted size={13} style={{ marginTop: 16 }}>
            {lead.consentGiven
              ? 'Согласие на обработку персональных данных получено.'
              : 'Согласие на обработку персональных данных не отмечено.'}
          </Text>
        </Card>

        <Card style={{ marginBottom: 20 }}>
          <Heading level={2} size={3} style={{ marginBottom: 12 }}>
            Одобрить и создать работу
          </Heading>
          <Form action={moderateLead}>
            <input type="hidden" name="leadId" value={lead.id} />
            <input type="hidden" name="decision" value="approve" />
            <Field
              label="Название работы"
              name="title"
              required
              defaultValue={lead.topic ?? ''}
              placeholder="Сопровождение кандидатской диссертации"
            />
            <Select label="Тип сопровождения" name="serviceTypeId" required>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </Select>
            <Checkbox name="applyTemplate" label="Применить шаблон этапов этого типа" />
            <FormActions>
              <Button>Одобрить и создать работу</Button>
            </FormActions>
          </Form>
        </Card>

        {/* Отказ — редкий исход, и поле причины на четыре строки занимало
            треть экрана под формой, которой пользуются каждый раз. Под
            свёрткой оно на виду не стоит, а раскрывается на месте
            (решение Р-182). */}
        <Disclosure title="Отклонить заявку">
          <Form action={moderateLead}>
            <input type="hidden" name="leadId" value={lead.id} />
            <input type="hidden" name="decision" value="decline" />
            <Field
              label="Причина отказа"
              name="reason"
              required
              multiline
              hint="Причину видит заявитель, поэтому она пишется человеческим языком."
            />
            <FormActions>
              <Button tone="quiet">Отклонить заявку</Button>
            </FormActions>
          </Form>
        </Disclosure>
      </Narrow>
    </Shell>
  );
}

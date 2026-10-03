import type { Actor } from '../../lib/cabinet/access';
import { hasContacts } from '../../lib/cabinet/contacts';
import { Button, Field, Form, Text, authorName, formatDate } from './ui';

/**
 * Замечания к версии материала с модерацией — общая часть экрана этапа и
 * «Материалов работы» (решение Р-284). Замечание к материалу вне этапов
 * прежде разобрать было негде: кнопки стояли только на экране этапа.
 */
export default function CommentList({
  comments,
  actor,
  mayModerate,
  stageId,
  back,
  decide,
  expertRole,
}: {
  comments: readonly {
    id: string;
    authorId: string;
    body: string;
    createdAt: Date;
    moderationStatus: string;
    moderationNote: string | null;
    author: { fullName: string; role: string };
  }[];
  actor: Actor;
  mayModerate: boolean;
  /** Этап, на экран которого вернуться после решения. */
  stageId?: string;
  /** Адрес возврата вне экрана этапа — экран материалов с якорем. */
  back?: string;
  /** Серверное действие решения: передаётся экраном, оформление о нём не знает. */
  decide: (form: FormData) => Promise<void>;
  /** Роль эксперта в работе — подпись его замечаний клиенту (Т-11, Р-297). */
  expertRole?: string | null;
}) {
  if (comments.length === 0) return null;
  return (

      <ul
        style={{
          margin: '14px 0 0',
          padding: '0 0 0 16px',
          listStyle: 'none',
          borderLeft: '2px solid var(--pd-art-line)',
          display: 'grid',
          gap: 12,
        }}
      >
        {comments.map((comment) => (
          <li key={comment.id}>
            <Text size={14}>{comment.body}</Text>
            <Text muted size={13} style={{ marginTop: 2 }}>
              {authorName(comment.author, actor, comment.authorId, expertRole)} ·{' '}
              {formatDate(comment.createdAt)}
              {comment.moderationStatus === 'PENDING'
                ? mayModerate && hasContacts(comment.body)
                  ? ' · ожидает публикации · есть контакты'
                  : ' · ожидает публикации'
                : comment.moderationStatus === 'REJECTED'
                  ? ' · не опубликовано куратором'
                  : ''}
            </Text>
            {/* Отклонённое прежде выглядело опубликованным:
                эксперт не узнавал, что клиент его не
                видел, и почему (решение Р-226). */}
            {comment.moderationStatus === 'REJECTED' &&
            comment.moderationNote !== null ? (
              <Text muted size={13} style={{ marginTop: 2 }}>
                Причина: {comment.moderationNote}
              </Text>
            ) : null}
            {mayModerate && comment.moderationStatus === 'PENDING' ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
                <Form action={decide} inline>
                  <input type="hidden" name="commentId" value={comment.id} />
                  <input type="hidden" name="stageId" value={stageId ?? ''} />
                      {back === undefined ? null : <input type="hidden" name="back" value={back} />}
                  <input type="hidden" name="decision" value="publish" />
                  <Button tone="quiet">
                    {comment.author.role === 'CLIENT' ? 'Опубликовать' : 'Опубликовать клиенту'}
                  </Button>
                </Form>
                <Form action={decide} inline>
                  <input type="hidden" name="commentId" value={comment.id} />
                  <input type="hidden" name="stageId" value={stageId ?? ''} />
                      {back === undefined ? null : <input type="hidden" name="back" value={back} />}
                  <input type="hidden" name="decision" value="reject" />
                  <Field
                    label={`Причина отклонения: ${comment.body.slice(0, 40)}`}
                    labelHidden
                    name="note"
                    scope={comment.id}
                    placeholder={
                      comment.author.role === 'CLIENT'
                        ? 'Причина — её увидит клиент'
                        : 'Причина — эксперт получит её письмом'
                    }
                    // У замечания эксперта причина обязательна (М-08, ОМ-15).
                    required={comment.author.role === 'EXPERT'}
                    minWidth={220}
                  />
                  <Button tone="quiet">Отклонить</Button>
                </Form>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
  );
}

import { ButtonLink, Card, Heading, Text } from './ui';

/**
 * Перечень материалов со скачиванием (указание владельца 12.10.2026,
 * решение Р-559): у строки — название, пояснение, переход на экран и
 * файлы. Один вид для «Управления» сотрудников и «Материалов» клиента.
 */
export interface MaterialRow {
  readonly title: string;
  readonly note: string;
  /** Экран, где материал открывается в кабинете; нет — только файл. */
  readonly href?: string;
  readonly files: readonly { readonly href: string; readonly label: string }[];
}

export default function MaterialsList({
  id,
  title,
  note,
  rows,
}: {
  id?: string;
  title: string;
  note: string;
  rows: readonly MaterialRow[];
}) {
  return (
    <Card as="div" id={id} style={{ marginBottom: 24 }}>
      <Heading level={2} size={3} style={{ marginBottom: 4 }}>
        {title}
      </Heading>
      <Text muted size={14} style={{ marginBottom: 14 }}>
        {note}
      </Text>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 14 }}>
        {rows.map((row) => (
          <li
            key={row.title}
            style={{ display: 'grid', gap: 8, paddingTop: 12, borderTop: '1px solid var(--pd-divider)' }}
          >
            <div>
              <Heading level={3} size={3} style={{ marginBottom: 2 }}>
                {row.href === undefined ? row.title : <a href={row.href}>{row.title}</a>}
              </Heading>
              <Text muted size={13} style={{ margin: 0 }}>
                {row.note}
              </Text>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {row.href === undefined ? null : <ButtonLink href={row.href}>Открыть</ButtonLink>}
              {row.files.map((file) => (
                <ButtonLink key={file.href} href={file.href} download>
                  {file.label}
                </ButtonLink>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

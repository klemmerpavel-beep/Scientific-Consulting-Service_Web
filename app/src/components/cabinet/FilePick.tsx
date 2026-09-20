'use client';

import { useId, useState } from 'react';

import { BUTTON_QUIET, SANS } from './tokens.ts';

/**
 * Выбор файла в строе кабинета.
 *
 * Нативное поле `input[type=file]` рисует браузер, и подпись на нём — из
 * локали операционной системы: в русском кабинете стояли «Choose File» и
 * «No file chosen», а вид кнопки менялся от системы к системе. Поле
 * скрыто и связано с меткой, которая выглядит как обычная тихая кнопка;
 * рядом — имя и размер выбранного файла (решение Р-178).
 *
 * Это вторая и последняя часть кабинета, работающая в браузере, и ровно
 * по той же причине, что первая: имя выбранного файла знает только
 * браузер, и без него человек не видит, что именно он приложил.
 */
export function FilePick({
  name,
  id,
  accept,
  required = false,
  describedBy,
}: {
  name: string;
  id: string;
  accept?: string;
  required?: boolean;
  describedBy?: string;
}) {
  const [picked, setPicked] = useState<{ name: string; size: number } | null>(null);
  const labelId = useId();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <input
        id={id}
        type="file"
        name={name}
        accept={accept}
        required={required}
        aria-describedby={describedBy}
        style={{
          // Поле остаётся в дереве и получает фокус с клавиатуры: спрятать
          // его через `display:none` значило бы вынуть из обхода.
          position: 'absolute',
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
        }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          setPicked(file === undefined ? null : { name: file.name, size: file.size });
        }}
      />
      <label htmlFor={id} id={labelId} style={{ ...BUTTON_QUIET, cursor: 'pointer' }}>
        {picked === null ? 'Выбрать файл' : 'Выбрать другой'}
      </label>
      <span
        aria-live="polite"
        style={{ fontFamily: SANS, fontSize: 14, color: 'var(--pd-ink-secondary)' }}
      >
        {picked === null ? 'файл не выбран' : `${picked.name} · ${size(picked.size)}`}
      </span>
    </div>
  );
}

/** Размер файла словами: килобайты до мегабайта, дальше мегабайты. */
function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1).replace('.', ',')} КБ`;
  return `${(kb / 1024).toFixed(1).replace('.', ',')} МБ`;
}

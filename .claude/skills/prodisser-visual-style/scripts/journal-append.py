#!/usr/bin/env python3
"""Безопасное дописывание журнала решений сайта ProDisser.

docs/DECISIONS.md больше 2 МБ, и запись в него конструкцией вида
open(f, 'w').write(open(f).read() ...) обнуляет файл до чтения. Скрипт
читает файл целиком, пишет во временный файл рядом и подменяет атомарно,
а перед подменой сверяет, что прежнее содержимое осталось началом нового.

  journal-append.py --repo . --next
      печатает следующий свободный номер решения
  journal-append.py --repo . --entry r-618.md --summary "Суть одной строкой"
      дописывает запись в DECISIONS.md (в конец, а номер, оставленный
      свободным, — перед следующей по номеру записью) и строку «| Р-618 | … |»
      в DECISIONS-SUMMARY.md сразу после строки предыдущего номера

Файл записи начинается с заголовка «## Р-NNN · Заголовок (дд.мм.гггг)».
Код выхода 0 — записано; 1 — отказ (номер занят, нет заголовка, потеря строк).
"""
import argparse
import os
import re
import sys
import tempfile

HEAD = re.compile(r'^## Р-(\d+) ', re.M)
ROW = re.compile(r'^\| Р-(\d+) \|', re.M)


def read(path):
    with open(path, encoding='utf-8') as fh:
        return fh.read()


def write_atomic(path, text, old):
    # Новое содержимое обязано сохранить каждую прежнюю строку: журнал только растёт.
    old_lines = old.split('\n')
    new_lines = set(text.split('\n'))
    lost = [l for l in old_lines if l not in new_lines]
    if lost:
        sys.exit(f'Отказ: в {path} пропали бы строки, первая: {lost[0][:80]!r}')
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix='.journal-')
    with os.fdopen(fd, 'w', encoding='utf-8') as fh:
        fh.write(text)
    os.replace(tmp, path)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--repo', default='.', help='корень репозитория сайта')
    ap.add_argument('--next', action='store_true', help='напечатать следующий свободный номер')
    ap.add_argument('--entry', help='файл с текстом записи')
    ap.add_argument('--summary', help='строка сводки без номера')
    args = ap.parse_args()

    journal = os.path.join(args.repo, 'docs', 'DECISIONS.md')
    summary = os.path.join(args.repo, 'docs', 'DECISIONS-SUMMARY.md')
    text = read(journal)
    numbers = [int(n) for n in HEAD.findall(text)]
    if len(numbers) < 100:
        sys.exit(f'Отказ: в {journal} всего {len(numbers)} записей — журнал прочитан не целиком или повреждён')
    nxt = max(numbers) + 1

    if args.next:
        print(f'Р-{nxt}')
        return
    if not args.entry or not args.summary:
        ap.error('нужны --entry и --summary (или --next)')

    entry = read(args.entry).strip('\n') + '\n'
    m = HEAD.match(entry)
    if not m:
        sys.exit('Отказ: запись должна начинаться с «## Р-NNN · Заголовок (дд.мм.гггг)»')
    num = int(m.group(1))
    if num in numbers:
        sys.exit(f'Отказ: Р-{num} уже есть в журнале; свободный номер — Р-{nxt}')
    if num != nxt:
        print(f'Внимание: номер Р-{num}, а следующий по порядку — Р-{nxt}; запись встанет по номеру', file=sys.stderr)

    # Оба файла проверяются до записи: иначе отказ на сводке оставил бы
    # журнал дописанным, а сводку — без строки.
    rows = read(summary)
    row = f'| Р-{num} | {args.summary.strip()} |'
    if f'| Р-{num} |' in rows:
        sys.exit(f'Отказ: строка Р-{num} уже есть в сводке')
    prev = [(int(n), mm.end()) for mm in ROW.finditer(rows) for n in [mm.group(1)] if int(n) < num]
    if not prev:
        sys.exit('Отказ: в сводке не найдено строки с меньшим номером')
    # Приёмка стоит в сводке дважды: в перечне решений и в таблице «Приёмки»
    # ниже. Строка встаёт за первой — иначе следующие решения уходили в
    # таблицу приёмок (так за Р-717 ушли Р-718 — Р-761).
    _, pos = max(prev, key=lambda p: (p[0], -p[1]))
    line_end = rows.index('\n', pos)

    # Номер, оставленный свободным под другую ветку (параллельный сеанс занял
    # следующие), встаёт перед первой записью с большим номером: порядок
    # журнала сохраняется. Обычный следующий номер дописывается в конец.
    later = [mm for mm in HEAD.finditer(text) if int(mm.group(1)) > num]
    if later:
        at = min(later, key=lambda mm: int(mm.group(1))).start()
        new_text = text[:at] + entry + '\n' + text[at:]
    else:
        new_text = text.rstrip('\n') + '\n\n' + entry
    write_atomic(journal, new_text, text)
    write_atomic(summary, rows[:line_end + 1] + row + '\n' + rows[line_end + 1:], rows)
    print(f'Записано: Р-{num} в журнал и сводку')


if __name__ == '__main__':
    main()

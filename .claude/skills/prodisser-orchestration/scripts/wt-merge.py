#!/usr/bin/env python3
"""Слить ветку разработчика в текущую с журналом решений «наши, затем их».

Запуск из корня рабочей копии, на ветке, куда сливается, с чистым деревом:

    python3 .claude/skills/prodisser-orchestration/scripts/wt-merge.py <ветка>

Что делает:
1. `git merge --no-commit --no-ff <ветка>`.
2. Если конфликт есть в других файлах, кроме docs/DECISIONS.md и
   docs/DECISIONS-SUMMARY.md, — печатает их и выходит с кодом 2, слияние
   остаётся незавершённым: такие конфликты разбирает оркестратор.
3. Журнал и сводку берёт со стороны текущей ветки («наши»), затем дописывает
   записи ветки, которых здесь нет, скриптом journal-append.py (по номеру,
   атомарно), и строки таблицы «Приёмки», которых здесь нет.
4. Сверяет: ни одна прежняя строка журнала и сводки не пропала, заголовки
   решений не повторяются, текст каждой дописанной записи совпадает с её
   текстом в ветке.
5. Индексирует результат. Коммит делает оркестратор своим сообщением.

Журнал больше 2 МБ: файл не переписывается через open('w') (Р-618 и др.),
дописывание — только journal-append.py.
"""

import os
import re
import subprocess
import tempfile
import sys
from pathlib import Path

JOURNAL = 'docs/DECISIONS.md'
SUMMARY = 'docs/DECISIONS-SUMMARY.md'
APPEND = '.claude/skills/prodisser-visual-style/scripts/journal-append.py'
HEAD_RE = re.compile(r'^## Р-(\d+) ', re.M)


def git(*args, check=True):
    r = subprocess.run(['git', *args], capture_output=True, text=True)
    if check and r.returncode != 0:
        sys.exit(f'git {" ".join(args)}: {r.stderr.strip()}')
    return r.stdout


def entries(text):
    """Номер решения → полный текст записи (от заголовка до следующего)."""
    marks = [(int(m.group(1)), m.start()) for m in HEAD_RE.finditer(text)]
    out = {}
    for i, (num, start) in enumerate(marks):
        end = marks[i + 1][1] if i + 1 < len(marks) else len(text)
        out.setdefault(num, text[start:end].rstrip('\n') + '\n')
    return out


def summary_row(text, num):
    """Строка сводки решения: первая строка таблицы с этим номером."""
    for line in text.splitlines():
        if line.startswith(f'| Р-{num} |'):
            cell = line.split('|', 2)[2].rsplit('|', 1)[0].strip()
            return re.sub(rf'^Р-{num}\s*·\s*', '', cell)
    return None


def acceptance_rows(text):
    return [l for l in text.splitlines() if l.startswith('| Р-') and '`accepted/' in l]


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    branch = sys.argv[1]
    root = Path(git('rev-parse', '--show-toplevel').strip())
    if git('status', '--porcelain', '--untracked-files=no').strip():
        sys.exit('Дерево не чистое: закоммитьте или уберите правки до слияния.')
    ours_j = (root / JOURNAL).read_text(encoding='utf-8')
    ours_s = (root / SUMMARY).read_text(encoding='utf-8')
    theirs_j = git('show', f'{branch}:{JOURNAL}')
    theirs_s = git('show', f'{branch}:{SUMMARY}')

    r = subprocess.run(['git', 'merge', '--no-commit', '--no-ff', branch], capture_output=True, text=True)
    conflicted = [p for p in git('diff', '--name-only', '--diff-filter=U').split() if p]
    other = [p for p in conflicted if p not in (JOURNAL, SUMMARY)]
    if other:
        print('Конфликты вне журнала — разберите вручную, слияние не завершено:')
        for p in other:
            print('  ' + p)
        sys.exit(2)
    if r.returncode != 0 and not conflicted:
        sys.exit(f'git merge: {r.stdout.strip()} {r.stderr.strip()}')

    # Журнал и сводка — «наши», затем записи ветки.
    git('checkout', 'HEAD', '--', JOURNAL, SUMMARY)
    ours_e, theirs_e = entries(ours_j), entries(theirs_j)
    added = sorted(set(theirs_e) - set(ours_e))
    for num in added:
        row = summary_row(theirs_s, num)
        if row is None:
            sys.exit(f'В сводке ветки нет строки Р-{num}: допишите вручную.')
        fd, entry_file = tempfile.mkstemp(prefix=f'wt-merge-{num}-', suffix='.md')
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(theirs_e[num])
        out = subprocess.run([sys.executable, str(root / APPEND), '--repo', str(root),
                              '--entry', entry_file, '--summary', row], capture_output=True, text=True)
        os.unlink(entry_file)
        if out.returncode != 0:
            sys.exit(f'journal-append Р-{num}: {out.stdout} {out.stderr}')
        print(f'дописано: Р-{num}')

    # Строки таблицы «Приёмки», которых здесь нет, — после последней нашей.
    s = (root / SUMMARY).read_text(encoding='utf-8')
    lines = s.split('\n')
    have = set(acceptance_rows(s))
    new_rows = [l for l in acceptance_rows(theirs_s) if l not in have]
    if new_rows:
        last = max(i for i, l in enumerate(lines) if l in have)
        lines[last + 1:last + 1] = new_rows
        tmp = root / (SUMMARY + '.tmp')
        tmp.write_text('\n'.join(lines), encoding='utf-8')
        tmp.replace(root / SUMMARY)
        for l in new_rows:
            print('приёмка: ' + l.split('|')[1].strip())

    # Сверка.
    j = (root / JOURNAL).read_text(encoding='utf-8')
    s = (root / SUMMARY).read_text(encoding='utf-8')
    j_lines, s_lines = set(j.splitlines()), set(s.splitlines())
    lost = [l for l in ours_j.splitlines() if l and l not in j_lines]
    lost += [l for l in ours_s.splitlines() if l and l not in s_lines]
    if lost:
        sys.exit(f'Пропали прежние строки ({len(lost)}), первая: {lost[0][:120]}')
    nums = [int(n) for n in HEAD_RE.findall(j)]
    seen, dup = set(), set()
    for n in nums:
        (dup if n in seen else seen).add(n)
    dup = sorted(dup)
    if dup:
        sys.exit(f'Повторы заголовков: {dup}')
    now = entries(j)
    for num in added:
        if now[num].strip() != theirs_e[num].strip():
            sys.exit(f'Текст Р-{num} разошёлся с веткой.')
    git('add', JOURNAL, SUMMARY)
    print(f'Готово: {branch} слита без коммита; дописано записей — {len(added)}, строк приёмки — {len(new_rows)}.')
    print('Дальше: проверки и `git commit` с подписью сеанса.')


if __name__ == '__main__':
    main()

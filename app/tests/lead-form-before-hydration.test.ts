/**
 * Форма заявки до оживления страницы (решение Р-508).
 *
 * Страницы сайта приходят готовой разметкой, обработчик отправки
 * подключается, когда загрузится сценарий. Форма без `method` в это время
 * уходила родным GET-запросом на тот же адрес: ФИО, контакт и тема — в
 * строку адреса, журнал nginx и историю браузера, а заявка терялась молча.
 *
 * Проверка по исходникам, как у окна заявки (Р-484): перенос ставит каждой
 * форме `method="post"` и держит кнопку отправки выключенной, пока
 * страница не ожила. Перенос проверяется и на собственном маленьком макете —
 * правило не должно зависеть от того, что написано в макетах сегодня.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');

const PAGES = ['StartPage', 'PostgradPage', 'StudentsPage', 'BusinessPage'];

/** Перенести макет инструментом во временную папку и вернуть компонент. */
function transfer(design: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'dc-to-tsx-'));
  try {
    const input = path.join(dir, 'Probe.dc.html');
    const output = path.join(dir, 'Probe.tsx');
    writeFileSync(input, design);
    execFileSync(process.execPath, [path.join(ROOT, 'tools', 'dc-to-tsx.mjs'), input, output, 'Probe', 'landing'], {
      stdio: 'pipe',
    });
    return readFileSync(output, 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const PROBE = `<x-dc>
<section id="request">
<form onSubmit="{{ submitBottom }}" style="display:flex">
<input type="text" name="name" required="{{ true }}">
<button type="submit" disabled="{{ pending }}">Отправить</button>
</form>
</section>
</x-dc>
<script data-dc-script>
class Component extends DCLogic {
  state = { sentBottom: false };
  componentDidMount(){ this.mounted = true; }
  renderVals(){ return { submitBottom: e => { e.preventDefault(); } }; }
}
</script>`;

describe('форма заявки до оживления страницы', () => {
  it('перенос ставит форме method="post": данные не попадают в адрес', () => {
    const code = transfer(PROBE);
    const forms = [...code.matchAll(/<form\b[^>]*>/gu)].map((m) => m[0]);
    assert.equal(forms.length, 1);
    assert.match(forms[0]!, /\bmethod="post"/u);
  });

  it('кнопка отправки выключена, пока страница не ожила; свой componentDidMount макета сохранён', () => {
    const code = transfer(PROBE);
    // До оживления — «идёт отправка»: кнопка выключена, Enter форму не шлёт.
    assert.match(code, /if \(this\.state\?\.__live !== true\) v\.pending = true;/u);
    // Оживление отмечается после монтирования, жизненный цикл макета вызывается.
    assert.match(code, /componentDidMount\(\) \{\s*super\.componentDidMount\?\.\(\);\s*this\.setState\(\{ __live: true \}\);/u);
    assert.match(code, /componentDidMount\(\)\{ this\.mounted = true; \}/u);
  });

  for (const page of PAGES) {
    it(`${page}: каждая форма — method="post", кнопка ждёт оживления`, () => {
      const code = read('app', 'src', 'components', 'pages', `${page}.tsx`);
      const forms = [...code.matchAll(/<form\b[^>]*>/gu)].map((m) => m[0]);
      assert.ok(forms.length >= 2, `${page}: форм меньше двух`);
      for (const form of forms) assert.match(form, /\bmethod="post"/u, `${page}: форма без method="post"`);
      assert.match(code, /if \(this\.state\?\.__live !== true\) v\.pending = true;/u);
      // Каждая кнопка отправки выключается тем же признаком.
      const submits = [...code.matchAll(/<button\b[^>]*type="submit"[^>]*>/gu)].map((m) => m[0]);
      assert.ok(submits.length >= 2);
      for (const button of submits) assert.match(button, /disabled=\{pending\}/u, `${page}: кнопка без disabled={pending}`);
    });
  }
});

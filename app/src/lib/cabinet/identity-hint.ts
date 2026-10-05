/**
 * ФИО куратора в имени файла и в свойствах документа (улучшение УК-03,
 * решение Р-396).
 *
 * Клиент не знает куратора по имени (Р-150, ОЭ-3): версия куратора уходит
 * к нему после публикации менеджером. Имя файла «Глава_Иванов.docx» или
 * автор в свойствах docx и xlsx (`docProps/core.xml`: «Автор», «Кем
 * изменён») раскрыли бы его. Проверка сравнивает фамилию — по-русски и
 * латиницей — с именем файла и с этими свойствами и только предупреждает
 * менеджера: публикацию решает он. Модуль без базы; распаковка — `zlib`
 * из Node.
 */

import { inflateRawSync } from 'node:zlib';

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** Содержимое одной записи ZIP по имени; не найдена или не читается — `null`. */
export function zipEntry(body: Buffer, wanted: string): Buffer | null {
  if (body.length < 22) return null;
  let eocd = -1;
  for (let i = body.length - 22; i >= 0 && i >= body.length - 22 - 0xffff; i -= 1) {
    if (body.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = body.readUInt16LE(eocd + 10);
  let p = body.readUInt32LE(eocd + 16);
  for (let e = 0; e < count; e += 1) {
    if (p + 46 > body.length || body.readUInt32LE(p) !== CENTRAL) return null;
    const method = body.readUInt16LE(p + 10);
    const size = body.readUInt32LE(p + 20);
    const nameLength = body.readUInt16LE(p + 28);
    const local = body.readUInt32LE(p + 42);
    const name = body.subarray(p + 46, p + 46 + nameLength).toString('utf8');
    if (name === wanted) {
      if (local + 30 > body.length || body.readUInt32LE(local) !== LOCAL) return null;
      const start = local + 30 + body.readUInt16LE(local + 26) + body.readUInt16LE(local + 28);
      const data = body.subarray(start, start + size);
      try {
        if (method === 0) return Buffer.from(data);
        if (method === 8) return inflateRawSync(data, { maxOutputLength: 1 << 20 });
      } catch {
        return null;
      }
      return null;
    }
    p += 46 + nameLength + body.readUInt16LE(p + 30) + body.readUInt16LE(p + 32);
  }
  return null;
}

/** «Автор» и «Кем изменён» из свойств документа Office; нет — пусто. */
export function documentAuthors(body: Buffer): string[] {
  const core = zipEntry(body, 'docProps/core.xml');
  if (core === null) return [];
  const xml = core.toString('utf8');
  const decode = (text: string) =>
    text
      .replace(/&lt;/gu, '<')
      .replace(/&gt;/gu, '>')
      .replace(/&quot;/gu, '"')
      .replace(/&apos;/gu, "'")
      .replace(/&amp;/gu, '&');
  const out: string[] = [];
  for (const tag of ['dc:creator', 'cp:lastModifiedBy']) {
    const match = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'u').exec(xml);
    if (match !== null && match[1]!.trim() !== '') out.push(decode(match[1]!.trim()));
  }
  return out;
}

const LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Фамилия латиницей — так её пишут в свойствах документа и именах файлов. */
export function latinSurname(surname: string): string {
  return [...surname.toLowerCase()].map((char) => LATIN[char] ?? char).join('');
}

/**
 * Есть ли фамилия куратора в имени файла или в свойствах документа.
 * Фамилия — первое слово ФИО; короче четырёх букв не проверяется: такие
 * совпадения чаще случайны.
 */
export function identityHint(fileName: string, body: Buffer, curatorName: string): boolean {
  const surname = curatorName.trim().split(/\s+/u)[0]?.toLowerCase() ?? '';
  if (surname.length < 4) return false;
  const needles = [surname, latinSurname(surname)];
  const haystacks = [fileName, ...documentAuthors(body)].map((text) => text.toLowerCase());
  return haystacks.some((text) => needles.some((needle) => text.includes(needle)));
}

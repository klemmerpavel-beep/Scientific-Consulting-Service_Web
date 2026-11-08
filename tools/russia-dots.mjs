/**
 * Точечный силуэт России для раздела «География» на «Студентам» (Р-849):
 * `design/assets/art/st-russia.svg` и его копия в `app/public/assets/art/`.
 *
 * Территория — по ст. 65 Конституции РФ (ред. 2022 г.): Natural Earth 10m,
 * страны с точки зрения РФ (`ne_10m_admin_0_countries_rus`: Россия с Крымом
 * и Севастополем, Курилы, Калининград), к ней — Донецкая, Луганская,
 * Запорожская и Херсонская области из `ne_10m_admin_1_states_provinces`.
 * Данные Natural Earth — общественное достояние. Контур границы не
 * рисуется: силуэт собран из точек сетки, точка ставится, если силуэт
 * покрывает не меньше 30 % её окрестности.
 *
 * Проекция — равновеликая коническая Альберса: осевой меридиан 95°,
 * стандартные параллели 25° и 65°, параллель начала 55°. Координаты Москвы
 * и Санкт-Петербурга, которые печатает сценарий, — отметки в макете.
 *
 * Запуск (sharp — из app/node_modules):
 *   curl -sO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries_rus.geojson
 *   curl -sO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
 *   node tools/russia-dots.mjs <каталог с файлами> design/assets/art/st-russia.svg
 *   cp design/assets/art/st-russia.svg app/public/assets/art/st-russia.svg
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(import.meta.dirname, '..', 'app', 'package.json'));
const sharp = require('sharp');

const [dir, out] = process.argv.slice(2);
if (!dir || !out) throw new Error('нужно: <каталог с geojson> <файл svg>');
const W = 640;
const STEP = 8;

const load = (name) => JSON.parse(readFileSync(path.join(dir, name), 'utf8')).features;
const rus = load('ne_10m_admin_0_countries_rus.geojson').find((f) => f.properties.ADM0_A3 === 'RUS');
const regions = load('ne_10m_admin_1_states_provinces.geojson').filter(
  (f) => f.properties.adm0_a3 === 'UKR' && ["Donets'k", "Luhans'k", 'Zaporizhzhya', 'Kherson'].includes(f.properties.name),
);
if (!rus || regions.length !== 4) throw new Error('нет России или четырёх областей в данных');
const polygons = [rus, ...regions].flatMap((f) => (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates]));

const rad = Math.PI / 180;
const [l0, p1, p2, p0] = [95 * rad, 25 * rad, 65 * rad, 55 * rad];
const n = (Math.sin(p1) + Math.sin(p2)) / 2;
const C = Math.cos(p1) ** 2 + 2 * n * Math.sin(p1);
const r0 = Math.sqrt(C - 2 * n * Math.sin(p0)) / n;
/** Альберс; восточнее 180° (Чукотка) долгота продолжается за 180. */
function project([lon, lat]) {
  const l = lon < -90 ? lon + 360 : lon;
  const r = Math.sqrt(C - 2 * n * Math.sin(lat * rad)) / n;
  const t = n * (l * rad - l0);
  return [r * Math.sin(t), -(r0 - r * Math.cos(t))];
}

const projected = polygons.map((poly) => poly.map((ring) => ring.map(project)));
let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
for (const poly of projected) for (const [x, y] of poly[0]) [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)];
const pad = 6;
const k = (W - 2 * pad) / (x1 - x0);
const H = Math.ceil((y1 - y0) * k + 2 * pad);
const toView = ([x, y]) => [(x - x0) * k + pad, (y - y0) * k + pad];

// Растр силуэта вчетверо крупнее области просмотра: доля покрытия окрестности точки.
const S = 4;
const d = projected
  .map((poly) => poly.map((ring) => `M${ring.map((p) => toView(p).map((v) => (v * S).toFixed(1)).join(' ')).join('L')}Z`).join(''))
  .join('');
const mask = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * S}" height="${H * S}"><rect width="100%" height="100%" fill="#000"/><path d="${d}" fill="#fff" fill-rule="evenodd"/></svg>`;
const { data, info } = await sharp(Buffer.from(mask)).greyscale().raw().toBuffer({ resolveWithObject: true });
function cover(cx, cy, radius) {
  let sum = 0;
  let count = 0;
  for (let y = Math.round((cy - radius) * S); y <= Math.round((cy + radius) * S); y++)
    for (let x = Math.round((cx - radius) * S); x <= Math.round((cx + radius) * S); x++) {
      if (x < 0 || y < 0 || x >= info.width || y >= info.height) continue;
      sum += data[y * info.width + x] / 255;
      count++;
    }
  return count ? sum / count : 0;
}

// Шестиугольная сетка: нечётные ряды сдвинуты на полшага.
const dots = [];
const rowHeight = (STEP * Math.sqrt(3)) / 2;
for (let j = 0, y = pad; y <= H - pad / 2; j++, y = pad + j * rowHeight)
  for (let x = pad + (j % 2 ? STEP / 2 : 0); x <= W - pad / 2; x += STEP) if (cover(x, y, STEP / 2.6) > 0.3) dots.push([x, y]);

// Острова уже шага сетки (Курилы, часть Арктики) иначе выпали бы: каждый
// участок суши от 1 ед.² (≈ 250 км²) без точки рядом получает ближайшую к
// своему центру точку сетки.
for (const poly of projected) {
  const ring = poly[0].map(toView);
  let [area, cx, cy] = [0, 0, 0];
  for (let i = 0; i < ring.length - 1; i++) {
    const [[ax, ay], [bx, by]] = [ring[i], ring[i + 1]];
    const cross = ax * by - bx * ay;
    area += cross / 2;
    cx += ((ax + bx) * cross) / 6;
    cy += ((ay + by) * cross) / 6;
  }
  if (Math.abs(area) < 1) continue;
  [cx, cy] = [cx / area, cy / area];
  if (dots.some(([x, y]) => Math.hypot(x - cx, y - cy) < STEP * 0.75)) continue;
  const j = Math.round((cy - pad) / rowHeight);
  const x = pad + (j % 2 ? STEP / 2 : 0) + Math.round((cx - pad - (j % 2 ? STEP / 2 : 0)) / STEP) * STEP;
  dots.push([x, pad + j * rowHeight]);
}

const dotsPath = dots.map(([x, y]) => `M${+x.toFixed(1)} ${+y.toFixed(1)}h0`).join('');
writeFileSync(
  out,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><path d="${dotsPath}" fill="none" stroke="#14417A" stroke-opacity=".3" stroke-width="${(STEP * 0.56).toFixed(1)}" stroke-linecap="round"/></svg>\n`,
);
const at = (lonlat) => toView(project(lonlat)).map((v) => +v.toFixed(1));
console.log(JSON.stringify({ width: W, height: H, dots: dots.length, moscow: at([37.62, 55.75]), petersburg: at([30.32, 59.94]) }));

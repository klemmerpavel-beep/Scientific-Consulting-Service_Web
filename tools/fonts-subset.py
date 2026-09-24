#!/usr/bin/env python3
"""
Файлы гарнитур сайта в репозитории (решение Р-230).

Прежде гарнитуры забирались с Google Fonts при каждой сборке. Сборка трижды
падала на этой загрузке — дважды в конвейере и один раз на боевом сервере,
где выкат остался на прежней версии. Теперь файлы лежат в `app/src/fonts/`
и сборка в сеть за ними не ходит.

Файлы готовит этот скрипт — из тех же исходников, что отдаёт Google Fonts
(репозиторий google/fonts), и так же, как отдаёт он: ось оптического
кегля закреплена на значении по умолчанию, насыщенность ограничена
начертаниями, которые сайт использует. Подмножество — основная и
расширенная латиница (в ней знак рубля) и кириллица, с полными таблицами
кернинга и лигатур. Повторный прогон с теми же исходниками даёт те же байты.

Запуск (нужны fontTools и brotli):

    pip install fonttools brotli
    python3 tools/fonts-subset.py
"""

import hashlib
import io
import pathlib
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'app' / 'src' / 'fonts'
SOURCE = 'https://raw.githubusercontent.com/google/fonts/main/ofl/'

# Исходник, его свёртка (чтобы подмена исходника не прошла молча),
# границы насыщенности и выходной файл.
FONTS = [
    (
        'inter/Inter%5Bopsz,wght%5D.ttf',
        '29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031',
        (400, 700),
        'inter.woff2',
    ),
    (
        'literata/Literata%5Bopsz,wght%5D.ttf',
        'b41138c9373112f32abb589cc22e8674b06ed4048b0c513be922bdd26f274440',
        (400, 600),
        'literata.woff2',
    ),
    (
        'jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf',
        '48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda',
        (400, 600),
        'jetbrains-mono.woff2',
    ),
]

# Диапазоны подмножеств Google Fonts: latin, latin-ext, cyrillic.
UNICODES = (
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,'
    'U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,'
    'U+FEFF,U+FFFD,'
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,'
    'U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,'
    'U+2C60-2C7F,U+A720-A7FF,'
    'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116'
)


def fetch(name: str, digest: str) -> bytes:
    with urllib.request.urlopen(SOURCE + name) as response:
        data = response.read()
    actual = hashlib.sha256(data).hexdigest()
    if actual != digest:
        raise SystemExit(f'{name}: свёртка {actual}, ожидалась {digest}')
    return data


def build(data: bytes, weights: tuple[int, int], out: pathlib.Path) -> None:
    font = TTFont(io.BytesIO(data))
    options = subset.Options()
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.name_languages = ['*']
    options.notdef_outline = True
    options.glyph_names = False
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=subset.parse_unicodes(UNICODES))
    subsetter.subset(font)

    # Подмножество — до закрепления осей: в обратном порядке fontTools
    # спотыкается о глифы без вариаций.
    axes = {axis.axisTag: axis for axis in font['fvar'].axes}
    limits = {'wght': weights}
    if 'opsz' in axes:
        limits['opsz'] = axes['opsz'].defaultValue
    font = instancer.instantiateVariableFont(font, limits)
    font.flavor = 'woff2'
    # Свёртка woff2 не зависит от часов: время изменения в заголовке head
    # берётся из исходника, а не из момента прогона.
    font.recalcTimestamp = False
    font.save(out)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, digest, weights, target in FONTS:
        out = OUT / target
        build(fetch(name, digest), weights, out)
        print(f'{target}: {out.stat().st_size} байт')


if __name__ == '__main__':
    main()

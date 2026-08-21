import sys, os
from PIL import Image
src = sys.argv[1]; H = int(sys.argv[2]) if len(sys.argv)>2 else 1600
im = Image.open(src); w,h = im.size
base = os.path.splitext(src)[0]
n = 0
for y in range(0, h, H):
    n += 1
    im.crop((0, y, w, min(y+H, h))).save(f"{base}_s{n:02d}.png")
print(base, w, h, "->", n, "slices")

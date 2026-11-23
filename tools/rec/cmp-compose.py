# r9：对照图拼图（tools/rec/sanda-cmp.mjs 调）：每行左边参考视频（800×600 缩成 600×450）、右边游戏（1600×900 缩成 800×450），左上角写时刻
import json, sys, os
from PIL import Image, ImageDraw, ImageFont
rows = json.load(open(sys.argv[1], encoding='utf8'))
out = sys.argv[2]
LW, RW, H = 600, 800, 450
try:
    font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 22)
except Exception:
    font = ImageFont.load_default()
img = Image.new('RGB', (LW + RW + 6, (H + 4) * len(rows)), (10, 10, 10))
d = ImageDraw.Draw(img)
def label(x, y, s):
    w = d.textlength(s, font=font)
    d.rectangle((x, y, x + w + 12, y + 32), fill=(20, 16, 10))
    d.text((x + 6, y + 3), s, fill=(255, 226, 120), font=font)
for i, r in enumerate(rows):
    y = i * (H + 4)
    if os.path.exists(r['video']):
        img.paste(Image.open(r['video']).convert('RGB').resize((LW, H)), (0, y))
    if os.path.exists(r['game']):
        img.paste(Image.open(r['game']).convert('RGB').resize((RW, H)), (LW + 6, y))
    label(4, y + 4, r['vl'])
    label(LW + 10, y + 4, r['gl'])
img.save(out)

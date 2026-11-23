# 生成 Windows 便携版解压时的启动图 desktop/build/splash.bmp（便携版双击后先显示它，解压完游戏窗口出来就消失）
# 用法：python tools/make-splash.py   素材取 src/assets/loading/ 里加载界面的远山、云、御剑人物
from PIL import Image, ImageDraw, ImageFont, ImageFilter
W, H = 720, 405
far = Image.open('src/assets/loading/far.webp').convert('RGB').resize((W, H), Image.LANCZOS)
im = far.copy()
cloud = Image.open('src/assets/loading/cloud.webp').convert('RGBA')
cloud = cloud.resize((W, int(cloud.height * W / cloud.width)), Image.LANCZOS)
im.paste(cloud, (0, H - cloud.height + 30), cloud)
hero = Image.open('src/assets/loading/hero.webp').convert('RGBA')
hw = 430; hero = hero.resize((hw, int(hero.height * hw / hero.width)), Image.LANCZOS)
im.paste(hero, (W - hw - 10, 70), hero)
d = ImageDraw.Draw(im)
kai = 'C:/Windows/Fonts/simkai.ttf'
title = ImageFont.truetype(kai, 64); sub = ImageFont.truetype(kai, 22); tip = ImageFont.truetype(kai, 20)
def text(xy, s, f, fill, shadow=(255, 255, 255)):
    x, y = xy
    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)): d.text((x + dx, y + dy), s, font=f, fill=shadow)
    d.text((x, y), s, font=f, fill=fill)
text((40, 40), '太虚问道录', title, (34, 30, 26))
text((44, 118), 'v0.8.1 · 人界篇', sub, (90, 70, 50))
# 底部提示条
bar = Image.new('RGBA', (W, 54), (22, 26, 23, 210)); im.paste(bar, (0, H - 54), bar)
text((24, H - 40), '正在解压游戏文件，马上就好，请稍候……', tip, (236, 222, 190), shadow=(22, 26, 23))
# 一行「进度」装饰（解压时这张图是静止的，用墨点示意在进行）
for i in range(6): d.ellipse((W - 120 + i * 16, H - 32, W - 112 + i * 16, H - 24), fill=(200, 170, 100))
im.save('desktop/build/splash.bmp')
print('desktop/build/splash.bmp', im.size)

# Android アプリのアイコンとスプラッシュ画面の画像を、src/assets のアイコンから作る。
# 使い方：python3 tools/app/make-icons.py（Pillow が必要）。作った画像は android/app/src/main/res/ に入る（git に入れる）。
# ・ランチャーのアイコン（Android 8 以上のアダプティブアイコン）：icon-512-maskable.png を中央 72dp（見える範囲）に置き、背景は朱色
# ・それより古い Android・丸いアイコン：icon-512.png（丸い枠つき）
# ・スプラッシュ画面（Android 11 以前）：生成り色の背景の中央に icon-512.png
import os
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
RES = os.path.join(ROOT, 'android/app/src/main/res')
SHU = (184, 35, 28)        # #B8231C（アイコンの背景と同じ朱色）
KINARI = (251, 246, 238)   # #FBF6EE（アプリの背景色）
maskable = Image.open(os.path.join(ROOT, 'src/assets/icon-512-maskable.png')).convert('RGBA')
icon = Image.open(os.path.join(ROOT, 'src/assets/icon-512.png')).convert('RGBA')
DENSITY = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

for name, k in DENSITY.items():
    d = os.path.join(RES, f'mipmap-{name}')
    os.makedirs(d, exist_ok=True)
    # アダプティブアイコンの前景（108dp。見える範囲は中央の 72dp）
    full = round(108 * k)
    fg = Image.new('RGBA', (full, full), SHU + (255,))
    inner = round(72 * k)
    fg.alpha_composite(maskable.resize((inner, inner), Image.LANCZOS), ((full - inner) // 2, (full - inner) // 2))
    fg.save(os.path.join(d, 'ic_launcher_foreground.png'))
    # 古い Android 用（48dp）
    s = round(48 * k)
    for f in ('ic_launcher.png', 'ic_launcher_round.png'):
        icon.resize((s, s), Image.LANCZOS).save(os.path.join(d, f))

def splash(w, h, path):
    im = Image.new('RGBA', (w, h), KINARI + (255,))
    s = round(min(w, h) * 0.42)
    im.alpha_composite(icon.resize((s, s), Image.LANCZOS), ((w - s) // 2, (h - s) // 2))
    im.convert('RGB').save(path)

PORT = {'mdpi': (320, 480), 'hdpi': (480, 800), 'xhdpi': (720, 1280), 'xxhdpi': (960, 1600), 'xxxhdpi': (1280, 1920)}
for name, (w, h) in PORT.items():
    for orient, (ww, hh) in (('port', (w, h)), ('land', (h, w))):
        d = os.path.join(RES, f'drawable-{orient}-{name}')
        os.makedirs(d, exist_ok=True)
        splash(ww, hh, os.path.join(d, 'splash.png'))
splash(480, 320, os.path.join(RES, 'drawable/splash.png'))
# Android 12 以上のスプラッシュ画面に出すアイコン（アダプティブアイコンと同じ形：中央 2/3 が見える）
d = os.path.join(RES, 'drawable-nodpi'); os.makedirs(d, exist_ok=True)
sp = Image.new('RGBA', (432, 432), (0, 0, 0, 0))
c = icon.resize((288, 288), Image.LANCZOS); sp.alpha_composite(c, (72, 72))
sp.save(os.path.join(d, 'splash_icon.png'))
print('アイコンとスプラッシュ画面の画像を作りました')

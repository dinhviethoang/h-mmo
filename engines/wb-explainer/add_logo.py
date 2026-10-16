"""Chèn logo Gối Sách vào video: python add_logo.py in.mp4 out.mp4 [vị trí overlay, mặc định góc trên phải]"""
import os, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
AVATAR = Path(os.environ.get('WB_AVATAR') or 'C:/Users/HOANGDV/Projects/GoiSach/logo-final/avatar-dem.png')
LOGO = Path(os.environ.get('WB_IMAGE_DIR') or HERE / 'assets') / 'logo-watermark.png'

def make_logo():
    s = 84
    av = Image.open(AVATAR).convert('RGBA').resize((s, s), Image.LANCZOS)
    mask = Image.new('L', (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, s - 1, s - 1), 18, fill=255)
    av.putalpha(mask)
    font = ImageFont.truetype(str(HERE / 'assets' / 'Itim.ttf'), 44)
    tw = int(ImageDraw.Draw(av).textlength('Gối Sách', font=font))
    img = Image.new('RGBA', (s + 14 + tw, s), (0, 0, 0, 0))
    img.paste(av, (0, 0), av)
    ImageDraw.Draw(img).text((s + 14, s // 2), 'Gối Sách', font=font, fill=(31, 43, 77, 255), anchor='lm')
    a = img.getchannel('A').point(lambda v: int(v * 0.85))
    img.putalpha(a)
    img.save(LOGO)

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    src, dst = sys.argv[1], sys.argv[2]
    pos = sys.argv[3] if len(sys.argv) > 3 else 'W-w-40:36'
    if not LOGO.exists():
        make_logo()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-i', str(LOGO), '-filter_complex',
                    f'overlay={pos}', '-c:a', 'copy', '-c:v', 'libx264', '-crf', '20', '-preset', 'medium', dst], check=True)
    print('OUTPUT', dst)

"""Bản phân cảnh Short dọc (1080x1920) -> storyboard có toạ độ cho compose.py.

Dùng: python short_layout.py storyboards/v06-short.json <thư mục audio> storyboards/v06-short-layout.json
Mỗi cảnh: {"title": "CHỮ TO", "images": ["v06-s01-a", ...] (1-2 hình), "texts": ["ý 1", "ý 2"], "at": [..]}
Audio cảnh n: <thư mục audio>/short-NNN.mp3. Chừa 140px trên cho logo, ~380px dưới cho giao diện Shorts/Reels.
"""
import json
import sys
from pathlib import Path

from layout import count_lines

sys.stdout.reconfigure(encoding='utf-8')

W, H = 1080, 1920
TITLE = {'size': 92, 'color': '#E05A47'}
TEXT = {'size': 72, 'color': '#26263A'}


def scene(n, sc, audio_dir):
    els = []
    tl = count_lines(sc['title'], TITLE['size'], 960)
    y = 190
    els.append({'type': 'text', 'text': sc['title'], 'x': W // 2, 'y': y, 'align': 'center', 'maxw': 960, 'at': 0.0, **TITLE})
    y += tl * round(TITLE['size'] * 1.25) + 30
    imgs = sc['images'][:2]
    gap = round(TEXT['size'] * 1.25)
    text_h = sum(count_lines(t, TEXT['size'], 980) * gap + 26 for t in sc['texts'])
    img_h = min(900, H - 380 - 40 - text_h - y)  # hình co lại để chữ không lọt vào vùng giao diện Shorts
    if len(imgs) == 1:
        els.append({'type': 'image', 'src': f'{imgs[0]}.png', 'x': 90, 'y': y, 'w': 900, 'h': img_h, 'at': 0.04})
    else:  # hình chính to bên trái, hình phụ nhỏ bên phải lệch xuống
        els.append({'type': 'image', 'src': f'{imgs[0]}.png', 'x': 30, 'y': y, 'w': 600, 'h': img_h, 'at': 0.04})
        els.append({'type': 'image', 'src': f'{imgs[1]}.png', 'x': 620, 'y': y + img_h - 560, 'w': 440, 'h': 560, 'at': 0.3})
    y += img_h + 40
    ats = sc.get('at') or [0.45, 0.7][:len(sc['texts'])]
    for t, at in zip(sc['texts'], ats):
        els.append({'type': 'text', 'text': t, 'x': W // 2, 'y': y, 'align': 'center', 'maxw': 980, 'at': at, **TEXT})
        y += count_lines(t, TEXT['size'], 980) * gap + 26
    if y > H - 360:
        print(f'  cảnh {n}: chữ xuống tới y={y}, dễ bị giao diện Shorts che', file=sys.stderr)
    els.sort(key=lambda e: e['at'])
    return {'id': f's{n:02d}', 'audio': str(Path(audio_dir) / f'short-{n:03d}.mp3'), 'elements': els}


def main():
    src = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    scenes = [scene(i, sc, sys.argv[2]) for i, sc in enumerate(src['scenes'], 1)]
    Path(sys.argv[3]).write_text(json.dumps({'canvas': [W, H], 'bg': '#EDEDEB', 'scenes': scenes}, ensure_ascii=False, indent=1), encoding='utf-8')
    print(len(scenes), 'scenes')


if __name__ == '__main__':
    main()

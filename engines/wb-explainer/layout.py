"""Bản phân cảnh (nội dung) -> storyboard có toạ độ cho compose.py.

Dùng: python layout.py storyboards/v01.json <thư mục audio> storyboards/v01-layout.json
Audio cảnh n: <thư mục audio>/long-NNN.mp3 (do chế độ Gối Sách của H-MMO tạo).
"""
import json
import sys
from pathlib import Path

from PIL import ImageFont

sys.stdout.reconfigure(encoding='utf-8')

FONT = str(Path(__file__).parent / 'assets' / 'Itim.ttf')

TITLE = {'x': 90, 'y': 50, 'size': 76, 'color': '#4B3C8F'}
STYLE = {
    'bullet': {'size': 56, 'color': '#26263A', 'prefix': '- '},
    'note': {'size': 54, 'color': '#2E7D6B', 'prefix': ''},
    'highlight': {'size': 66, 'color': '#E05A47', 'prefix': ''},
    'bubble': {'size': 54, 'color': '#C0392B', 'prefix': ''},
}
# vùng ảnh theo bố cục: (x, y, w, h) cho hình thứ 1 và thứ 2
SLOTS = {
    'hero-left': [(100, 200, 620, 800), (740, 520, 320, 440)],
    'hero-right': [(1200, 200, 620, 800), (860, 520, 320, 440)],
    'duo': [(90, 230, 520, 740), (1310, 230, 520, 740)],
    'center-bubble': [(740, 400, 440, 620), (1300, 560, 360, 440)],
    'list-only': [(1360, 280, 460, 640), (1360, 280, 460, 640)],
}
# cột chữ: (x, y bắt đầu, căn, độ rộng tối đa)
COLUMN = {
    'hero-left': (1100, 250, 'left', 760),
    'hero-right': (110, 250, 'left', 720),
    'duo': (960, 260, 'center', 640),
    'center-bubble': (110, 300, 'left', 600),
    'list-only': (160, 260, 'left', 1100),
}


def count_lines(text, size, maxw):
    """Số dòng sau khi compose.draw_text tự xuống dòng (cùng thuật toán)."""
    font = ImageFont.truetype(FONT, size)
    n = 0
    for raw in text.split('\n'):
        row = ''
        for word in raw.split(' '):
            cand = (row + ' ' + word).strip()
            if row and font.getlength(cand) > maxw:
                n += 1
                row = word
            else:
                row = cand
        n += 1
    return n


def scene_layout(sc, audio_dir, prev):
    layout = sc.get('layout') if sc.get('layout') in SLOTS else 'hero-left'
    if layout == prev and layout in ('hero-left', 'hero-right'):
        layout = 'hero-right' if layout == 'hero-left' else 'hero-left'
    els = [dict(type='text', text=sc['title'], at=0.0, maxw=1740, **TITLE)]
    for i, img in enumerate(sc.get('images', [])[:2]):
        x, y, w, h = SLOTS[layout][i]
        els.append({'type': 'image', 'src': f"{img['name']}.png", 'x': x, 'y': y, 'w': w, 'h': h, 'at': img.get('at', 0.05)})
    cx, cy, align, maxw = COLUMN[layout]
    texts = sorted(sc.get('texts', []), key=lambda t: t.get('at', 0))
    for t in texts:
        st = STYLE.get(t.get('style'), STYLE['bullet'])
        if t.get('style') == 'bubble':
            bw, bh = min(maxw, 560), 220
            bx = cx - bw // 2 if align == 'center' else (1180 if layout == 'center-bubble' else cx + 20)
            by = 180 if layout == 'center-bubble' else cy
            els.append({'type': 'bubble', 'text': t['text'], 'x': bx, 'y': by, 'w': bw, 'h': bh, 'size': st['size'], 'color': st['color'], 'maxw': bw - 90, 'at': t.get('at', 0.5)})
            if layout != 'center-bubble':
                cy += bh + 110
            continue
        text = st['prefix'] + t['text']
        gap = round(st['size'] * 1.25)
        n = count_lines(text, st['size'], maxw)
        y = 1030 - n * gap if t.get('style') == 'highlight' else cy
        els.append({'type': 'text', 'text': text, 'x': cx, 'y': y, 'size': st['size'], 'color': st['color'],
                    'align': align, 'maxw': maxw, 'at': t.get('at', 0.5)})
        if t.get('style') != 'highlight':
            cy += n * gap + round(st['size'] * 0.45)
    els.sort(key=lambda e: e['at'])
    return {'id': f"s{sc['n']:02d}", 'audio': str(Path(audio_dir) / f"long-{sc['n']:03d}.mp3"), 'elements': els}, layout


def main():
    src = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    scenes, prev = [], None
    for sc in src['scenes']:
        s, prev = scene_layout(sc, sys.argv[2], prev)
        scenes.append(s)
    Path(sys.argv[3]).write_text(json.dumps({'canvas': [1920, 1080], 'bg': '#EDEDEB', 'scenes': scenes}, ensure_ascii=False, indent=1), encoding='utf-8')
    print(len(scenes), 'scenes')


if __name__ == '__main__':
    main()

"""Gối Sách — dựng cảnh whiteboard explainer (kiểu VideoScribe) từ storyboard JSON.

Mỗi cảnh: ghép clip-art + chữ viết tay + bong bóng lên nền giấy xám thành 1 ảnh,
sinh annotation theo thứ tự xuất hiện ("at" = tỉ lệ thời gian audio), rồi gọi
renderer của srt-whiteboard-animation để vẽ từng phần, cuối cùng ghép audio.

Dùng: python compose.py storyboard.json out_dir
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding='utf-8')
HERE = Path(__file__).parent
ASSETS = Path(os.environ.get('WB_IMAGE_DIR') or HERE / 'assets')  # clip-art
RENDERER = str(HERE / 'render_explainer.py')
HAND = os.environ.get('WB_HAND') or str((HERE / '../../resources/goisach/hand-goisach.png').resolve())
PY = os.environ.get('WB_SRT_PY') or 'C:/Users/HOANGDV/tools/srt-whiteboard-animation/.venv/Scripts/python.exe'
FONT = str(HERE / 'assets' / 'Itim.ttf')


def hex2rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def duration(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip())


def paste_clipart(canvas, el, bg):
    """Dán clip-art; nền xám của ảnh AI được thay bằng màu giấy để không lộ ô vuông."""
    img = Image.open(ASSETS / el['src']).convert('RGB')
    arr = np.asarray(img).astype(int)
    corner = np.median(np.concatenate([arr[:12, :12], arr[:12, -12:], arr[-12:, :12], arr[-12:, -12:]]).reshape(-1, 3), axis=0)
    mask = np.abs(arr - corner).sum(axis=2) > 36
    ys, xs = np.where(mask)
    if len(xs):  # cắt sát nội dung
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        arr, mask = arr[y0:y1, x0:x1], mask[y0:y1, x0:x1]
    arr[~mask] = bg
    img = Image.fromarray(arr.astype(np.uint8))
    scale = min(el['w'] / img.width, el.get('h', 10 ** 6) / img.height)
    img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
    m = Image.fromarray((np.asarray(Image.fromarray(mask.astype(np.uint8) * 255).resize(img.size)) > 127).astype(np.uint8) * 255)
    x, y = el['x'], el['y']
    canvas.paste(img, (x, y), m)
    return (x, y, img.width, img.height)


def draw_text(draw, el):
    font = ImageFont.truetype(FONT, el.get('size', 56))
    color = hex2rgb(el.get('color', '#26263A'))
    lines = []
    for raw in el['text'].split('\n'):  # tự xuống dòng theo độ rộng tối đa
        row = ''
        for word in raw.split(' '):
            cand = (row + ' ' + word).strip()
            if row and el.get('maxw') and draw.textlength(cand, font=font) > el['maxw']:
                lines.append(row)
                row = word
            else:
                row = cand
        lines.append(row)
    x, y = el['x'], el['y']
    gap = round(el.get('size', 56) * 1.25)
    boxes = []
    for i, line in enumerate(lines):
        if el.get('align') == 'center':
            w = draw.textlength(line, font=font)
            lx = round(x - w / 2)
        else:
            lx = x
        draw.text((lx, y + i * gap), line, font=font, fill=color)
        boxes.append(draw.textbbox((lx, y + i * gap), line, font=font))
    x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes)
    x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
    return (x0, y0, x1 - x0, y1 - y0)


def draw_bubble(draw, el):
    """Bong bóng suy nghĩ: các vòng tròn quanh elip + 2 chấm nhỏ, chữ ở giữa."""
    x, y, w, h = el['x'], el['y'], el['w'], el['h']
    ink = hex2rgb(el.get('stroke', '#3A3A4A'))
    cx, cy = x + w / 2, y + h / 2
    n = 14
    for i in range(n):
        a = 2 * np.pi * i / n
        px, py = cx + (w / 2 - 34) * np.cos(a), cy + (h / 2 - 30) * np.sin(a)
        draw.ellipse((px - 40, py - 34, px + 40, py + 34), fill=(250, 250, 248), outline=ink, width=5)
    draw.ellipse((x + 30, y + 26, x + w - 30, y + h - 26), fill=(250, 250, 248))
    tx, ty = x + w * 0.18, y + h + 10
    for r, dx in ((16, 0), (10, -34)):
        draw.ellipse((tx + dx - r, ty - r + (0 if dx == 0 else 34), tx + dx + r, ty + r + (0 if dx == 0 else 34)), fill=(250, 250, 248), outline=ink, width=4)
    t = dict(el, x=round(cx), y=round(cy - el.get('size', 52) * 0.65 * len(el['text'].split('\n'))), align='center')
    draw_text(draw, t)
    return (x - 10, y - 10, w + 20, h + 80)


def build_scene(scene, cfg, out):
    W, H = cfg['canvas']
    bg = hex2rgb(cfg.get('bg', '#EDEDEB'))
    canvas = Image.new('RGB', (W, H), bg)
    draw = ImageDraw.Draw(canvas)
    audio = Path(scene['audio'])
    total = duration(audio)
    items = []
    for el in scene['elements']:
        if el['type'] == 'image' and not (ASSETS / el['src']).exists():
            print('  thiếu hình', el['src'], '- bỏ qua', flush=True)
            continue
        if el['type'] == 'image':
            box = paste_clipart(canvas, el, bg)
        elif el['type'] == 'bubble':
            box = draw_bubble(draw, el)
        else:
            box = draw_text(draw, el)
        items.append((el, box))
    # thời gian: mỗi phần bắt đầu tại "at" (tỉ lệ audio), vẽ tới phần kế tiếp (tối thiểu 0.6s, tối đa theo loại)
    starts = [el.get('at', i / len(items)) * total for i, (el, _) in enumerate(items)]
    elements = []
    for i, (el, (x, y, w, h)) in enumerate(items):
        nxt = starts[i + 1] if i + 1 < len(items) else total * 0.92
        cap = 0.09 * len(el.get('text', '')) + 0.8 if el['type'] != 'image' else 3.2
        dur = max(0.6, min(nxt - starts[i] - 0.1, cap))
        x0, y0 = max(0, x - 8), max(0, y - 8)
        elements.append({'id': f"{scene['id']}-{i + 1}", 'sequence': i + 1,
                         'region': {'x': int(x0), 'y': int(y0), 'width': int(min(W - x0, w + 16)), 'height': int(min(H - y0, h + 16))},
                         'reveal': {'direction': 'left_to_right', 'startMs': int(starts[i] * 1000), 'durationMs': int(dur * 1000)}})
    png = out / f"{scene['id']}.png"
    canvas.save(png)
    ann = out / f"{scene['id']}.annotation.json"
    ann.write_text(json.dumps({'canvas': {'width': W, 'height': H}, 'sceneDurationMs': int(total * 1000), 'elements': elements}, ensure_ascii=False), encoding='utf-8')
    silent = out / f"{scene['id']}-draw.mp4"
    subprocess.run([PY, RENDERER, str(png), str(ann), str(silent), HAND, '--ink-path', 'grid', '--color-fill', 'contour-wipe',
                    '--cap-long-edge', str(max(W, H)), '--total-ms', str(int(total * 1000) + 300)], check=True)
    final = out / f"{scene['id']}.mp4"
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(silent), '-i', str(audio), '-filter_complex',
                    f"[0:v]tpad=stop_mode=clone:stop_duration=2,trim=duration={total + 0.3:.3f},fps=30,format=yuv420p[v]",
                    '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', str(final)], check=True)
    return final


def main():
    sb = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
    clips = []
    total = len(sb['scenes'])
    for k, s in enumerate(sb['scenes'], 1):  # chạy tiếp được nếu bị ngắt: cảnh đã có mp4 thì bỏ qua
        done = out / f"{s['id']}.mp4"
        clips.append(done if done.exists() else build_scene(s, sb, out))
        print('xong cảnh', s['id'], flush=True)
        print(f'[[PROGRESS]] {k}/{total} cảnh {s["id"]}', flush=True)
    lst = out / 'concat.txt'
    lst.write_text('\n'.join(f"file '{c.resolve().as_posix()}'" for c in clips), encoding='utf-8')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(lst), '-c', 'copy', str(out / 'explainer.mp4')], check=True)
    print('OUTPUT', out / 'explainer.mp4')
    subprocess.run([sys.executable, str(Path(__file__).parent / 'add_logo.py'), str(out / 'explainer.mp4'), str(out / 'explainer-logo.mp4'),
                    '(W-w)/2:56' if sb['canvas'][1] > sb['canvas'][0] else 'W-w-40:36'], check=True)  # video dọc: logo giữa trên


if __name__ == '__main__':
    main()

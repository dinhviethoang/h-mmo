"""Tự viết phân cảnh Short (dọc) từ mục "KỊCH BẢN YOUTUBE SHORTS" của kịch bản, dùng lại hình của bản dài.

Dùng: python make_short_storyboard.py <kich-ban.md> <storyboard bản dài .json> <file ra vNN-short.json>
Tiêu đề = "Chữ to" trong kịch bản; Antigravity chọn 1-2 hình có sẵn + viết 2 dòng chữ ngắn cho mỗi cảnh.
Nếu Antigravity lỗi -> chọn hình theo từ khoá trùng, chữ lấy từ câu đầu lời đọc.
Kết quả theo định dạng short_layout.py: {"video", "scenes": [{"title", "images": [..], "texts": [..], "at": [..]}]}
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
DELEGATE = os.environ.get('WB_DELEGATE') or 'C:/Users/HOANGDV/.claude/hooks/delegate.js'

RULES = """Bạn dựng bản phân cảnh cho video Short dọc ~60 giây kiểu whiteboard (dùng lại hình của video dài).
Dưới đây là DANH SÁCH HÌNH CÓ SẴN (tên: mô tả) và các CẢNH SHORT (tiêu đề + lời đọc).
Với MỖI cảnh Short trả về: {"n": <số cảnh>, "images": ["<tên hình>", ...], "texts": ["...", "..."], "at": [<số>, <số>]}
Quy tắc:
- images: 1-2 tên lấy CHÍNH XÁC từ danh sách hình, hợp nghĩa nhất với lời đọc; hình đầu là hình chính (ưu tiên có nhân vật chính). Không dùng một hình cho 2 cảnh.
- texts: đúng 2 dòng, tiếng Việt có dấu, mỗi dòng 3-8 từ, tóm ý lời đọc (có thể trích câu thoại ngắn trong ngoặc “ ”). Không lặp lại tiêu đề.
- Cảnh cuối: dòng 1 = "Ý tưởng từ: <tên sách>" nếu lời đọc có nhắc sách, dòng 2 = "Theo dõi Gối Sách nhé!".
- at: thời điểm xuất hiện của 2 dòng (tỉ lệ 0-0.9 trong lời đọc, tăng dần), đúng lúc ý đó được nói tới.
KHÔNG chạy lệnh, KHÔNG đọc/ghi file. CHỈ trả lời bằng MỘT mảng JSON hợp lệ (không markdown, không giải thích)."""


def short_scenes(md):
    m = re.search(r'^##\s+KỊCH BẢN YOUTUBE SHORTS.*$', md, re.M | re.I)
    if not m:
        raise SystemExit('Kịch bản không có mục "## KỊCH BẢN YOUTUBE SHORTS".')
    out = []
    for line in md[m.end():].splitlines():
        if line.startswith('## '):
            break
        if line.startswith('|') and '[HÌNH' in line:
            cells = [c.strip() for c in line.strip().strip('|').split('|')]
            title = re.search(r'Chữ to:\s*["“]([^"”]+)["”]', line)
            out.append({'title': (title.group(1) if title else cells[-1].split('.')[0][:30]).strip(), 'narration': cells[-1]})
    if not out:
        raise SystemExit('Mục Shorts không có dòng cảnh nào (dạng | ... | [HÌNH: ...] | lời đọc |).')
    return out


def words(s):
    return set(w for w in re.findall(r'\w+', s.lower()) if len(w) > 1)


def fallback(scenes, images, used):
    """Chọn hình theo số từ trùng giữa lời đọc và mô tả hình/tiêu đề cảnh dài."""
    out = []
    for n, sc in enumerate(scenes, 1):
        key = words(sc['title'] + ' ' + sc['narration'])
        ranked = sorted((i for i in images if i['name'] not in used), key=lambda i: (-len(key & words(i['ctx'])), not i['main']))
        pick = [i['name'] for i in ranked[:2]]
        used.update(pick)
        # cụm ngắn tách theo dấu câu, ưu tiên cụm 3-8 từ; bỏ cụm đầu (thường là lời mở)
        parts = [p.strip(' “”"—-') for p in re.split(r'[.!?:;,—]\s+|[“”]', sc['narration']) if p.strip(' “”"—-')]
        good = [p for p in parts[1:] if 3 <= len(p.split()) <= 8] or [' '.join(p.split()[:8]) for p in parts[:2]]
        texts = good[:2]
        out.append({'n': n, 'images': pick, 'texts': texts, 'at': [0.25, 0.6][:len(texts)]})
    return out


def ask(scenes, images):
    listing = '\n'.join(f"{i['name']}: {i['desc']}" for i in images)
    shorts = '\n'.join(f"CẢNH {n}: TIÊU ĐỀ \"{s['title']}\" — LỜI ĐỌC: {s['narration']}" for n, s in enumerate(scenes, 1))
    prompt = f'{RULES}\n\nDANH SÁCH HÌNH:\n{listing}\n\nCẢNH SHORT:\n{shorts}'
    for _ in range(2):
        try:
            r = subprocess.run(['node', DELEGATE, 'agy', prompt], capture_output=True, text=True, encoding='utf-8', errors='ignore', timeout=600)
        except subprocess.TimeoutExpired:
            continue
        m = re.search(r'\[\s*\{.*\}\s*\]', r.stdout, re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
        print('  Antigravity chưa trả JSON hợp lệ, thử lại', flush=True)
    return None


def main():
    md = Path(sys.argv[1]).read_text(encoding='utf-8')
    long_sb = json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'))
    out = Path(sys.argv[3])
    scenes = short_scenes(md)
    images = [{'name': i['name'], 'desc': i.get('desc', ''), 'main': bool(i.get('main_character')),
               'ctx': ' '.join([s.get('title', ''), i.get('desc', '')] + [t.get('text', '') for t in s.get('texts', [])])}
              for s in long_sb['scenes'] for i in s.get('images', [])]
    names = {i['name'] for i in images}
    print(f'[[PROGRESS]] 0/1 viết phân cảnh Short ({len(scenes)} cảnh, {len(images)} hình có sẵn)', flush=True)
    got = ask(scenes, images) or []
    by_n = {g.get('n'): g for g in got if isinstance(g, dict)}
    used, result = set(), []
    for n, sc in enumerate(scenes, 1):
        g = by_n.get(n) or {}
        imgs = [x for x in g.get('images', []) if x in names and x not in used][:2]
        texts = [str(t).strip() for t in g.get('texts', []) if str(t).strip()][:2]
        if not imgs or not texts:  # cảnh này Antigravity trả thiếu/sai -> tự chọn
            fb = fallback([sc], images, used | set(imgs))[0]
            imgs, texts = imgs or fb['images'], texts or fb['texts']
            print(f'  cảnh {n}: dùng cách chọn dự phòng', flush=True)
        used.update(imgs)
        at = [float(a) for a in g.get('at', []) if isinstance(a, (int, float))][:len(texts)]
        if len(at) != len(texts) or at != sorted(at):
            at = [0.25, 0.6][:len(texts)]
        result.append({'title': sc['title'], 'images': imgs, 'texts': texts, 'at': at})
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({'video': f"{long_sb.get('video', 'v00')}-short", 'scenes': result}, ensure_ascii=False, indent=1), encoding='utf-8')
    print('[[PROGRESS]] 1/1 xong phân cảnh Short', flush=True)
    print('xong', len(result), 'cảnh Short ->', out)


if __name__ == '__main__':
    main()

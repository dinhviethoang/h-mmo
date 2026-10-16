"""Gọi Antigravity (chế độ đọc, trả lời bằng chữ) để viết bản phân cảnh theo từng nhóm cảnh.

Dùng: python make_storyboard.py <kich-ban.md> <mã video, vd v01> <file ra .json>
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
DELEGATE = os.environ.get('WB_DELEGATE') or 'C:/Users/HOANGDV/.claude/hooks/delegate.js'
BATCH = 9

RULES = """Bạn thiết kế bản phân cảnh cho video YouTube kiểu whiteboard explainer (VideoScribe): nền giấy, clip-art, chữ viết tay.
Với MỖI cảnh dưới đây, dựa trên LỜI ĐỌC, trả về một phần tử JSON:
{"n": <số cảnh>, "title": "<tiêu đề 3-7 từ>", "layout": "<hero-left|hero-right|duo|center-bubble|list-only>",
 "images": [{"name": "<VID>-sNN-a", "desc": "<1 chủ thể clip-art: người/đồ vật, hành động, cảm xúc>", "main_character": true|false, "at": 0.05}],
 "texts": [{"text": "<cụm từ khoá 2-6 từ>", "style": "<bullet|highlight|bubble|note>", "at": 0.3}]}
Quy tắc: tiếng Việt có dấu, NGẮN, trọn nghĩa, lấy ý từ lời đọc (không chép nguyên câu). Mỗi cảnh 1-2 images, 2-4 texts.
Tối đa 1 'bubble' (ý nghĩ/câu hỏi trong đầu nhân vật) và tối đa 1 'highlight' (thông điệp chốt, at lớn nhất).
'at' (0-0.9) = vị trí tương đối trong lời đọc nơi ý được nói tới, tăng dần; hình đầu tiên at <= 0.08.
main_character=true nếu là nhân vật chính (nam nhân viên văn phòng trẻ, sơ mi xanh nhạt, quần đen) — khi đó desc chỉ tả hành động/cảm xúc/đạo cụ.
Nhân vật khác (sếp, đồng nghiệp...) tả rõ ngoại hình khác biệt. Đồ vật (điện thoại, lịch, cốc cà phê...) cũng được.
Tên hình: <VID>-sNN-a / -b, NN là số cảnh 2 chữ số. Layout đa dạng, 'duo' khi 2 người tương tác, 'list-only' hiếm.
KHÔNG chạy lệnh, KHÔNG đọc/ghi file. CHỈ trả lời bằng MỘT mảng JSON hợp lệ (không markdown, không giải thích)."""


def scenes_of(md):
    body = md.split('## BỔ SUNG')[0]
    out = []
    for line in body.splitlines():
        if line.startswith('|') and '[HÌNH' in line:
            cells = [c.strip() for c in line.strip().strip('|').split('|')]
            out.append(cells[-1])
    return out


def ask(vid, batch):
    listing = '\n'.join(f'CẢNH {n}: {text}' for n, text in batch)
    prompt = RULES.replace('<VID>', vid) + '\n\n' + listing
    for _ in range(2):
        r = subprocess.run(['node', DELEGATE, 'agy', prompt], capture_output=True, text=True, encoding='utf-8', timeout=600)
        m = re.search(r'\[\s*\{.*\}\s*\]', r.stdout, re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
        print('  thử lại nhóm', batch[0][0], file=sys.stderr)
    raise SystemExit(f'Không nhận được JSON cho nhóm bắt đầu cảnh {batch[0][0]}:\n{r.stdout[-800:]}')


def main():
    md, vid, out = Path(sys.argv[1]).read_text(encoding='utf-8'), sys.argv[2], Path(sys.argv[3])
    items = list(enumerate(scenes_of(md), 1))
    scenes = []
    groups = (len(items) + BATCH - 1) // BATCH
    print(f'[[PROGRESS]] 0/{groups} viết phân cảnh', flush=True)
    for i in range(0, len(items), BATCH):
        part = ask(vid, items[i:i + BATCH])
        scenes += part
        print(f'nhóm {i // BATCH + 1}: {len(part)} cảnh', flush=True)
        print(f'[[PROGRESS]] {i // BATCH + 1}/{groups} nhóm cảnh', flush=True)
    scenes.sort(key=lambda s: s['n'])
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({'video': vid, 'scenes': scenes}, ensure_ascii=False, indent=1), encoding='utf-8')
    print('xong', len(scenes), 'cảnh /', len(items), '— hình:', sum(len(s.get('images', [])) for s in scenes))


if __name__ == '__main__':
    main()

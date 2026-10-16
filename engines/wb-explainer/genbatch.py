"""Vẽ toàn bộ clip-art trong bản phân cảnh bằng Antigravity (tuần tự, chạy tiếp được nếu bị ngắt).

Dùng: python genbatch.py storyboards/v01.json
"""
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
HERE = Path(__file__).parent
ASSETS = Path(os.environ.get('WB_IMAGE_DIR') or HERE / 'assets')
BRAIN = Path(os.environ.get('WB_BRAIN') or 'C:/Users/HOANGDV/.gemini/antigravity-cli/brain')
DELEGATE = os.environ.get('WB_DELEGATE') or 'C:/Users/HOANGDV/.claude/hooks/delegate.js'
REF = HERE / 'assets' / 'main-ref.png'
STYLE = ('Phong cách: clip-art vector màu phẳng kiểu video whiteboard explainer (VideoScribe), nét viền đậm sạch, màu tươi phẳng, '
         'nhân vật người Việt dáng hoạt hình, MỘT chủ thể duy nhất đứng riêng trên nền xám nhạt trơn #EDEDEB hoàn toàn phẳng, '
         'không bóng đổ nền, không khung, KHÔNG có chữ/ký tự/watermark, khung vuông 1:1, chủ thể chiếm ~80% khung.')
MAIN = ('Nhân vật là NHÂN VẬT CHÍNH (luôn vẽ y hệt như nhau trong mọi ảnh): nam thanh niên Việt khoảng 25 tuổi, tóc đen ngắn hơi vuốt lên, '
        'mặt tròn hiền, lông mày đậm, áo sơ mi xanh nhạt (#BFDDF5) xắn tay đến khuỷu, cài cúc, quần âu đen, giày đen, dáng người mảnh, '
        'nét vẽ hoạt hình đơn giản viền đen đậm.')


def newest_image(since):
    best = None
    for p in BRAIN.rglob('*'):
        if p.suffix.lower() not in ('.png', '.jpg', '.jpeg', '.webp') or '.tempmediaStorage' in p.parts or '.system_generated' in p.parts:
            continue
        t = p.stat().st_mtime
        if t > since and (best is None or t > best[0]):
            best = (t, p)
    return best[1] if best else None


MUSE_KEY = Path(os.environ.get('WB_MUSE_KEY_FILE') or 'C:/Users/HOANGDV/tools/wb-explainer/muse.key')
MUSE_URL = 'https://api.meta.ai/v1/images/generations'  # Meta Model API, chuẩn OpenAI Images
MUSE_MODEL = 'muse-image-1.0'
muse_off = False


def muse(desc, target):
    """Vẽ bằng Meta Muse Image (nếu có muse.key). Trả về True nếu đã lưu ảnh."""
    global muse_off
    if muse_off or not MUSE_KEY.exists():
        return False
    import base64
    import urllib.request
    key = MUSE_KEY.read_text(encoding='utf-8').strip()
    body = json.dumps({'model': MUSE_MODEL, 'prompt': f'{desc} {STYLE}', 'n': 1, 'size': '1024x1024'}).encode('utf-8')
    req = urllib.request.Request(MUSE_URL, data=body, headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            data = json.loads(r.read())['data'][0]
        raw = base64.b64decode(data['b64_json']) if data.get('b64_json') else urllib.request.urlopen(data['url'], timeout=120).read()
        tmp = target.with_suffix('.muse')
        tmp.write_bytes(raw)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(tmp), str(target)], check=True)
        tmp.unlink()
        return True
    except Exception as e:  # lỗi key/URL/hạn mức -> tắt Muse cho lần chạy này, dùng Antigravity
        detail = getattr(e, 'read', lambda: b'')()[:300].decode('utf-8', 'ignore')
        print(f'  Muse lỗi: {e} {detail} -> chuyển sang Antigravity', flush=True)
        if getattr(e, 'code', 0) in (401, 403, 404):
            muse_off = True
        return False


def generate(img):
    target = ASSETS / f"{img['name']}.png"
    if target.exists():
        return 'có sẵn'
    desc = img['desc'] + ('. ' + MAIN if img.get('main_character') else '')
    if muse(desc, target):
        return 'ok (Muse)'
    prompt = (f"Gọi công cụ tạo ảnh (image generator) để vẽ 1 ảnh tên {img['name']}. Không chạy lệnh shell, không ghi file. "
              'ĐỢI công cụ tạo ảnh trả kết quả rồi mới trả lời; câu trả lời phải chứa đường dẫn đầy đủ của file ảnh đã tạo. '
              'Nếu công cụ báo lỗi, chép nguyên văn lỗi. '
              f'Nội dung ảnh: {desc} {STYLE}')
    (HERE / 'agy-empty').mkdir(exist_ok=True)
    for attempt in range(2):
        start = time.time()
        r = subprocess.run(['node', DELEGATE, 'agy', '--write', '--cwd', str(Path(__file__).parent / 'agy-empty'), prompt],
                           capture_output=True, text=True, encoding='utf-8', errors='ignore', timeout=500)
        paths = [Path(m) for m in re.findall(r'file:///([^\s)\]]+?\.(?:jpg|jpeg|png|webp))', r.stdout)]
        if re.search(r'429|RESOURCE_EXHAUSTED|[Qq]uota', r.stdout):
            m = re.search(r'(\d+)\s*hours?\s*(\d+)?\s*min', r.stdout)
            wait = (int(m.group(1)) * 3600 + int(m.group(2) or 0) * 60) if m else 3600
            return f'QUOTA:{wait + 300}'
        f = next((p for p in paths if p.exists() and '.tempmediaStorage' not in p.parts), None) or newest_image(start)
        if f:
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(f), str(target)], check=True)
            return 'ok'
    return 'THIẾU'


def main():
    sb = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    ASSETS.mkdir(parents=True, exist_ok=True)
    imgs = [i for s in sb['scenes'] for i in s.get('images', [])]
    missing = []
    for k, img in enumerate(imgs, 1):
        r = generate(img)
        while r.startswith('QUOTA:'):  # hết hạn mức: ngủ tới lúc mở lại rồi vẽ tiếp
            wait = int(r.split(':')[1])
            print(f'hết hạn mức ảnh, chờ {wait // 60} phút (tới {time.strftime("%H:%M", time.localtime(time.time() + wait))})', flush=True)
            time.sleep(wait)
            r = generate(img)
        print(f'[{k}/{len(imgs)}] {img["name"]}: {r}', flush=True)
        print(f'[[PROGRESS]] {k}/{len(imgs)} {img["name"]}: {r}', flush=True)
        if r == 'THIẾU':
            missing.append(img['name'])
    print('xong; thiếu:', missing or 'không')


if __name__ == '__main__':
    main()

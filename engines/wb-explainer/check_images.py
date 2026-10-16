"""In trạng thái ảnh của bản phân cảnh: python check_images.py <storyboard.json>
-> 1 dòng JSON {"total", "present": [tên], "missing": [{"name", "desc", "scene"}]}; ảnh tìm ở WB_IMAGE_DIR."""
import json
import os
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
ASSETS = Path(os.environ.get('WB_IMAGE_DIR') or Path(__file__).parent / 'assets')
sb = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
present, missing = [], []
for s in sb['scenes']:
    for img in s.get('images', []):
        if (ASSETS / f"{img['name']}.png").exists():
            present.append(img['name'])
        else:
            missing.append({'name': img['name'], 'desc': img.get('desc', ''), 'scene': s.get('n')})
print(json.dumps({'total': len(present) + len(missing), 'present': present, 'missing': missing}, ensure_ascii=False))

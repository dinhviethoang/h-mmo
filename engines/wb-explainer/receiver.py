"""Nhận ảnh từ tab Muse (Chrome) và lưu vào assets/<tên>.png. Chỉ nghe ở 127.0.0.1.

Dùng: python receiver.py   (POST http://127.0.0.1:8765/save?name=v01-s20-a  body = bytes ảnh)
"""
import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.stdout.reconfigure(encoding='utf-8')
ASSETS = Path(os.environ.get('WB_IMAGE_DIR') or Path(__file__).parent / 'assets')
ASSETS.mkdir(parents=True, exist_ok=True)
PORT = int(os.environ.get('WB_RECEIVER_PORT') or 8765)


class H(BaseHTTPRequestHandler):
    def cors(self):
        self.send_header('Access-Control-Allow-Origin', 'https://muse.ai')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Private-Network', 'true')

    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.end_headers()

    def do_POST(self):
        name = parse_qs(urlparse(self.path).query).get('name', [''])[0]
        if not name.replace('-', '').isalnum():
            self.send_response(400); self.cors(); self.end_headers(); return
        data = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        tmp = ASSETS / f'{name}.muse'
        tmp.write_bytes(data)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(tmp), str(ASSETS / f'{name}.png')], check=True)
        tmp.unlink()
        self.send_response(200); self.cors(); self.end_headers(); self.wfile.write(b'ok')
        print('saved', name, len(data), flush=True)


print('đang nhận ảnh ở cổng', PORT, '->', ASSETS, flush=True)
HTTPServer(('127.0.0.1', PORT), H).serve_forever()

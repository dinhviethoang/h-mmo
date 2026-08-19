"""
Kokoro TTS Server cho H-MMO Studio
Chạy như một HTTP server cục bộ để H-MMO gọi qua API.
"""
import sys
import json
import os
import soundfile as sf
from http.server import HTTPServer, BaseHTTPRequestHandler

# Global model instance
tts_model = None

def load_model():
    """Load Kokoro model (lazy loading on first request)"""
    global tts_model
    if tts_model is not None:
        return tts_model
    
    try:
        from kokoro_onnx import Kokoro
        tts_model = Kokoro(lang="v")  # Vietnamese
        print("[Kokoro] Model loaded successfully!", flush=True)
        return tts_model
    except Exception as e:
        print(f"[Kokoro] Failed to load model: {e}", flush=True)
        # Fallback: try kokoro-vietnamese
        try:
            from kokoro_vietnamese import KokoroVietnamese
            tts_model = KokoroVietnamese(device="cpu")
            print("[Kokoro-Vietnamese] Model loaded successfully!", flush=True)
            return tts_model
        except Exception as e2:
            print(f"[Kokoro-Vietnamese] Also failed: {e2}", flush=True)
            raise e2

class TTSHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/api/tts':
            content_length = int(self.headers['Content-Length'])
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
            
            text = data.get('text', '')
            voice = data.get('voice', 'vf_diem_trinh')
            output_path = data.get('output_path', 'output.wav')
            
            try:
                model = load_model()
                
                # Try kokoro-onnx API first
                if hasattr(model, 'create'):
                    samples, sample_rate = model.create(text, voice=voice)
                    sf.write(output_path, samples, sample_rate)
                elif hasattr(model, 'synthesize'):
                    audio, _ = model.synthesize(text)
                    sf.write(output_path, audio, 24000)
                else:
                    raise Exception("Unknown model API")
                
                response = json.dumps({'status': 'ok', 'path': output_path})
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(response.encode())
            except Exception as e:
                response = json.dumps({'status': 'error', 'message': str(e)})
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(response.encode())
        
        elif self.path == '/api/voices':
            voices = [
                {"id": "vf_diem_trinh", "name": "Diễm Trinh (Nữ, Truyền cảm)"},
                {"id": "vf_mai_linh", "name": "Mai Linh (Nữ, Nhẹ nhàng)"},
                {"id": "vm_hung_thinh", "name": "Hưng Thịnh (Nam, Trầm ấm)"},
            ]
            response = json.dumps(voices)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(response.encode())
    
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'ok')
    
    def log_message(self, format, *args):
        print(f"[TTS Server] {args[0]}", flush=True)

def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5111
    server = HTTPServer(('127.0.0.1', port), TTSHandler)
    print(f"[Kokoro TTS Server] Running on http://127.0.0.1:{port}", flush=True)
    print(f"[Kokoro TTS Server] READY", flush=True)
    server.serve_forever()

if __name__ == '__main__':
    main()

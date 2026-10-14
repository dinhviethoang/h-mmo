"""H-MMO - đọc chữ cứng (hardsub) trên video thành file .srt bằng RapidOCR (chạy CPU).

Dùng:
  python ocr_srt.py --input video.mp4 --out sub.srt --ffmpeg ffmpeg.exe
         [--region x,y,w,h  (phần trăm, mặc định 0,65,100,35 = 35% dưới)] [--fps 4] [--min-score 0.6]
Khung hình được lấy bằng ffmpeg (đọc được đường dẫn tiếng Trung/emoji trên Windows).
Stdout: STATUS / PROGRESS / DONE / ERROR <...>
"""
import argparse
import difflib
import re
import subprocess
import sys

import numpy as np


def say(kind, msg=""):
    print(f"{kind} {msg}", flush=True)


def ts(t):
    t = max(0.0, t)
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def probe(ffmpeg, path):
    """Lấy kích thước + thời lượng qua 'ffmpeg -i' (không cần ffprobe)."""
    r = subprocess.run([ffmpeg, "-hide_banner", "-i", path], capture_output=True, text=True, encoding="utf-8", errors="ignore")
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.?\d*)", r.stderr)
    dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else 0
    v = re.search(r"Video:.*?(\d{2,5})x(\d{2,5})", r.stderr)
    w, h = (int(v.group(1)), int(v.group(2))) if v else (0, 0)
    rot = re.search(r"rotate\s*:\s*(-?\d+)|rotation of (-?\d+)", r.stderr)
    if rot and abs(int(rot.group(1) or rot.group(2))) in (90, 270):
        w, h = h, w
    return w, h, dur


def norm(s):
    return re.sub(r"[\s\W_]+", "", s)


def similar(a, b):
    a, b = norm(a), norm(b)
    if not a or not b:
        return a == b
    return difflib.SequenceMatcher(None, a, b).ratio() >= 0.75


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--ffmpeg", default="ffmpeg")
    ap.add_argument("--region", default="0,65,100,35")
    ap.add_argument("--fps", type=float, default=4)
    ap.add_argument("--min-score", type=float, default=0.6)
    ap.add_argument("--min-chars", type=int, default=2)
    a = ap.parse_args()
    try:
        W, H, dur = probe(a.ffmpeg, a.input)
        if not W:
            raise RuntimeError("Không đọc được kích thước video.")
        x, y, w, h = [float(v) for v in a.region.split(",")]
        cx, cy = int(W * x / 100), int(H * y / 100)
        cw, ch = max(16, int(W * w / 100)) // 2 * 2, max(16, int(H * h / 100)) // 2 * 2
        cw, ch = min(cw, W - cx) // 2 * 2, min(ch, H - cy) // 2 * 2
        # thu nhỏ vùng chữ nếu quá rộng để OCR nhanh hơn
        scale = min(1.0, 1280 / max(cw, 1))
        ow, oh = int(cw * scale) // 2 * 2, int(ch * scale) // 2 * 2

        say("STATUS", "Đang nạp RapidOCR...")
        from rapidocr_onnxruntime import RapidOCR
        engine = RapidOCR()

        vf = f"fps={a.fps},crop={cw}:{ch}:{cx}:{cy},scale={ow}:{oh}"
        p = subprocess.Popen([a.ffmpeg, "-v", "error", "-i", a.input, "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                             stdout=subprocess.PIPE)
        fsize = ow * oh * 3
        total = int(dur * a.fps) or 1
        say("STATUS", f"Đang đọc chữ: {total} khung hình, vùng {cw}x{ch}px ...")

        samples = []  # (thời điểm, chữ)
        prev_small, prev_text, n = None, "", 0
        while True:
            buf = p.stdout.read(fsize)
            if len(buf) < fsize:
                break
            img = np.frombuffer(buf, np.uint8).reshape(oh, ow, 3)
            t = n / a.fps
            small = img[::4, ::4].mean(axis=2)
            # khung giống khung trước -> dùng lại chữ, không OCR lại (nhanh hơn nhiều)
            if prev_small is not None and np.abs(small - prev_small).mean() < 2.0:
                text = prev_text
            else:
                res, _ = engine(img[:, :, ::-1].copy())
                lines = []
                for box, txt, score in (res or []):
                    if float(score) >= a.min_score and len(norm(txt)) >= a.min_chars:
                        ys = [pt[1] for pt in box]
                        xs = [pt[0] for pt in box]
                        lines.append((sum(ys) / 4, min(xs), txt.strip()))
                # gộp các mảnh cùng dòng (theo toạ độ y), sắp trên->dưới, trái->phải
                lines.sort()
                rows = []
                for yy, xx, txt in lines:
                    if rows and abs(rows[-1][0] - yy) < oh * 0.08:
                        rows[-1][1].append((xx, txt))
                    else:
                        rows.append([yy, [(xx, txt)]])
                text = "\n".join(" ".join(t2 for _, t2 in sorted(r[1])) for r in rows).strip()
            samples.append((t, text))
            prev_small, prev_text = small, text
            n += 1
            if n % max(1, int(a.fps * 5)) == 0:
                say("PROGRESS", min(99, int(n / total * 100)))
        p.wait()

        # gộp các mẫu liên tiếp có chữ giống nhau thành 1 câu phụ đề
        step = 1 / a.fps
        cues = []
        for t, text in samples:
            if not text:
                if cues and cues[-1]["open"]:
                    cues[-1]["open"] = False
                continue
            if cues and cues[-1]["open"] and similar(cues[-1]["text"], text):
                c = cues[-1]
                c["end"] = t + step
                c["votes"][text] = c["votes"].get(text, 0) + 1
            else:
                if cues:
                    cues[-1]["open"] = False
                cues.append({"start": t, "end": t + step, "text": text, "votes": {text: 1}, "open": True})
        out = []
        for c in cues:
            if c["end"] - c["start"] < 0.3:
                continue
            best = max(c["votes"].items(), key=lambda kv: (kv[1], len(kv[0])))[0]  # bản đọc xuất hiện nhiều nhất
            if out and similar(out[-1][2], best) and c["start"] - out[-1][1] < 0.6:
                out[-1] = (out[-1][0], c["end"], out[-1][2])
                continue
            out.append((c["start"], c["end"], best))
        with open(a.out, "w", encoding="utf-8") as f:
            for i, (s, e, txt) in enumerate(out, 1):
                f.write(f"{i}\n{ts(s)} --> {ts(e)}\n{txt}\n\n")
        say("STATUS", f"Đọc được {len(out)} câu phụ đề.")
        say("PROGRESS", 100)
        say("DONE", a.out)
    except Exception as e:  # noqa: BLE001
        say("ERROR", f"{type(e).__name__}: {e}")
        sys.exit(1)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

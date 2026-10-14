"""H-MMO - tạo phụ đề offline bằng faster-whisper.

Dùng:  python whisper_srt.py --input audio.wav --out out.srt [--model small] [--lang zh] [--models-dir DIR]
In ra stdout các dòng (để app đọc):
  STATUS <thông điệp>
  PROGRESS <0-100>
  DONE <đường dẫn srt>
  ERROR <thông điệp>
"""
import argparse
import os
import sys

MAX_CHARS = 42 * 2      # tối đa ~2 dòng mỗi cue
MAX_DUR = 5.5           # giây
MAX_GAP = 0.6           # khoảng lặng thì tách cue
END_PUNCT = tuple("。！？!?.…")


def say(kind, msg=""):
    print(f"{kind} {msg}", flush=True)


def ts(t):
    t = max(0.0, t)
    h, rem = divmod(int(round(t * 1000)), 3600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def wrap(text, width=42):
    text = text.strip()
    if len(text) <= width:
        return text
    # tách 2 dòng ở khoảng trắng gần giữa nhất (tiếng Trung không có khoảng trắng -> cắt giữa)
    mid = len(text) // 2
    spaces = [i for i, c in enumerate(text) if c == " "]
    cut = min(spaces, key=lambda i: abs(i - mid)) if spaces else mid
    return text[:cut].strip() + "\n" + text[cut:].strip()


def build_cues(segments, duration):
    cues, cur, start, last_end = [], "", None, None

    def flush(end):
        nonlocal cur, start
        if cur.strip():
            cues.append((start, end, wrap(cur)))
        cur, start = "", None

    for seg in segments:
        if duration:
            say("PROGRESS", int(min(99, seg.end / duration * 100)))
        words = seg.words or []
        if not words:  # không có mốc từng từ -> dùng nguyên đoạn
            flush(last_end or seg.start)
            cues.append((seg.start, seg.end, wrap(seg.text)))
            last_end = seg.end
            continue
        for w in words:
            if start is not None and (
                w.start - last_end > MAX_GAP
                or w.end - start > MAX_DUR
                or len(cur) + len(w.word) > MAX_CHARS
            ):
                flush(last_end)
            if start is None:
                start = w.start
            cur += w.word
            last_end = w.end
            if cur.strip().endswith(END_PUNCT) and len(cur.strip()) >= 12:
                flush(last_end)
    flush(last_end or 0)
    return cues


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="small")
    ap.add_argument("--lang", default="")
    ap.add_argument("--models-dir", default=None)
    a = ap.parse_args()

    try:
        say("STATUS", f"Đang nạp model Whisper '{a.model}' (lần đầu sẽ tải model về máy, có thể mất vài phút)...")
        from faster_whisper import WhisperModel

        model = WhisperModel(a.model, device="cpu", compute_type="int8",
                             cpu_threads=os.cpu_count() or 4, download_root=a.models_dir)
        say("STATUS", "Đang nhận diện giọng nói...")
        segments, info = model.transcribe(
            a.input,
            language=a.lang or None,
            vad_filter=True,
            word_timestamps=True,
            beam_size=5,
        )
        say("STATUS", f"Ngôn ngữ: {info.language} ({info.language_probability:.0%}), thời lượng {info.duration:.0f}s")
        cues = build_cues(segments, info.duration)
        if not cues:
            cues = [(0.0, min(5.0, info.duration or 5.0), "(Không có lời nói)")]
        with open(a.out, "w", encoding="utf-8") as f:
            for i, (s, e, t) in enumerate(cues, 1):
                f.write(f"{i}\n{ts(s)} --> {ts(max(e, s + 0.3))}\n{t}\n\n")
        say("PROGRESS", 100)
        say("DONE", a.out)
    except Exception as e:  # noqa: BLE001
        say("ERROR", f"{type(e).__name__}: {e}")
        sys.exit(1)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

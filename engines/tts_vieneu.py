"""H-MMO - đọc văn bản & clone giọng tiếng Việt bằng VieNeu-TTS (Apache-2.0, chạy CPU).

Dùng:
  python tts_vieneu.py list
  python tts_vieneu.py say  --text "..." --out out.wav [--voice "Tên giọng"] [--ref mau.wav] [--mode v3nano]
  python tts_vieneu.py srt   --srt in.srt --outdir thu_muc [--voice ...|--ref ...]   (mỗi câu 1 file NNNN.wav)
  python tts_vieneu.py batch --texts cau.json --outdir thu_muc [--voice ...|--ref ...] (JSON: ["câu 1", ...])
Giọng đã clone được lưu trong thư mục voices/ (file mẫu .wav) để dùng lại.
Stdout: STATUS / PROGRESS / DONE / ERROR <...>
"""
import argparse
import json
import os
import re
import sys


def say(kind, msg=""):
    print(f"{kind} {msg}", flush=True)


def load(mode):
    from vieneu import Vieneu
    say("STATUS", f"Đang nạp VieNeu-TTS ({mode or 'v3 Turbo'}); lần đầu sẽ tải model...")
    return Vieneu(mode=mode) if mode else Vieneu()


_VOICE_ALIASES = {}


def synth(tts, text, voice, ref):
    if ref:
        return tts.infer(text, ref_audio=ref, denoise=True)
    if not voice:
        return tts.infer(text)
    # giọng có sẵn: chấp nhận cả tên hiển thị lẫn mã giọng
    if not _VOICE_ALIASES:
        for label, vid in tts.list_preset_voices():
            _VOICE_ALIASES[label] = vid
            _VOICE_ALIASES[vid] = label
    try:
        return tts.infer(text, voice=voice)
    except Exception:
        alt = _VOICE_ALIASES.get(voice)
        if not alt:
            raise
        return tts.infer(text, voice=alt)


def run_many(tts, texts, outdir, voice, ref):
    os.makedirs(outdir, exist_ok=True)
    for i, text in enumerate(texts, 1):
        out = os.path.join(outdir, f"{i:04}.wav")
        tts.save(synth(tts, text, voice, ref), out)
        say("ITEM", i)
        say("PROGRESS", int(i / len(texts) * 100))
    say("DONE", outdir)


def parse_srt(path):
    raw = open(path, encoding="utf-8-sig").read().replace("\r\n", "\n")
    cues = []
    for block in re.split(r"\n\s*\n", raw.strip()):
        lines = block.split("\n")
        idx = next((i for i, l in enumerate(lines) if "-->" in l), None)
        if idx is None:
            continue
        text = " ".join(l.strip() for l in lines[idx + 1:] if l.strip())
        if text:
            cues.append(text)
    return cues


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["list", "say", "srt", "batch"])
    ap.add_argument("--texts")
    ap.add_argument("--text")
    ap.add_argument("--out")
    ap.add_argument("--srt")
    ap.add_argument("--outdir")
    ap.add_argument("--voice")
    ap.add_argument("--ref")
    ap.add_argument("--mode", default="")
    a = ap.parse_args()
    try:
        tts = load(a.mode)
        if a.cmd == "list":
            voices = [{"label": l, "id": v} for l, v in tts.list_preset_voices()]
            say("VOICES", json.dumps(voices, ensure_ascii=False))
            say("DONE", "list")
        elif a.cmd == "say":
            audio = synth(tts, a.text, a.voice, a.ref)
            tts.save(audio, a.out)
            say("DONE", a.out)
        elif a.cmd == "srt":
            run_many(tts, parse_srt(a.srt), a.outdir, a.voice, a.ref)
        else:
            texts = json.load(open(a.texts, encoding="utf-8"))
            run_many(tts, texts, a.outdir, a.voice, a.ref)
    except Exception as e:  # noqa: BLE001
        say("ERROR", f"{type(e).__name__}: {e}")
        sys.exit(1)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

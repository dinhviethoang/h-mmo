"""H-MMO - tách giọng nhân vật khỏi nhạc nền/tiếng động (audio-separator, chạy CPU).

Dùng: python separate_vocals.py --input audio.wav --outdir THU_MUC [--model Kim_Vocal_2.onnx] [--models-dir DIR]
Kết quả: THU_MUC/vocals.wav (giọng nói) và THU_MUC/instrumental.wav (nhạc nền + tiếng động)
Stdout: STATUS / DONE / ERROR <...>
"""
import argparse
import glob
import os
import shutil
import sys


def say(kind, msg=""):
    print(f"{kind} {msg}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--model", default="Kim_Vocal_2.onnx")
    ap.add_argument("--models-dir", default=None)
    a = ap.parse_args()
    try:
        os.makedirs(a.outdir, exist_ok=True)
        say("STATUS", f"Đang nạp model tách giọng {a.model} (lần đầu sẽ tải model về máy)...")
        from audio_separator.separator import Separator

        kw = dict(output_dir=a.outdir, output_format="WAV")
        if a.models_dir:
            kw["model_file_dir"] = a.models_dir
        sep = Separator(**kw)
        sep.load_model(model_filename=a.model)
        say("STATUS", "Đang tách giọng nhân vật khỏi nhạc nền (có thể mất vài phút với video dài)...")
        outs = sep.separate(a.input)
        outs = [o if os.path.isabs(o) else os.path.join(a.outdir, o) for o in outs]
        if len(outs) < 2:  # một số phiên bản trả tên file không đầy đủ -> tìm lại trong thư mục
            outs = glob.glob(os.path.join(a.outdir, "*.wav"))
        voc = next((o for o in outs if "(Vocals)" in os.path.basename(o)), None)
        ins = next((o for o in outs if "(Instrumental)" in os.path.basename(o) or "(No Vocals)" in os.path.basename(o)), None)
        if not voc or not ins:
            raise RuntimeError("Không tìm thấy file kết quả: " + ", ".join(os.path.basename(o) for o in outs))
        shutil.move(voc, os.path.join(a.outdir, "vocals.wav"))
        shutil.move(ins, os.path.join(a.outdir, "instrumental.wav"))
        say("DONE", a.outdir)
    except Exception as e:  # noqa: BLE001
        say("ERROR", f"{type(e).__name__}: {e}")
        sys.exit(1)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

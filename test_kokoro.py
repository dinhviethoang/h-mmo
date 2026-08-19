from kokoro_vietnamese import KokoroVietnamese
import soundfile as sf
import os

print("Initializing TTS...")
tts = KokoroVietnamese(device="cpu", voice="diem_trinh")

print("Synthesizing audio...")
audio, phonemes = tts.synthesize(
    "Giữa một buổi chiều yên tĩnh, cô ấy kể lại câu chuyện với giọng trầm ấm."
)

print("Phonemes:", phonemes)

print("Saving to output.wav...")
sf.write("output.wav", audio, 24000)
print("Done! File saved to output.wav")

import asyncio
import edge_tts

TEXT = "Giữa một buổi chiều yên tĩnh, cô ấy kể lại câu chuyện với giọng trầm ấm."
VOICE = "vi-VN-HoaiMyNeural"
OUTPUT_FILE = "output_edge.wav"

async def main():
    communicate = edge_tts.Communicate(TEXT, VOICE)
    await communicate.save(OUTPUT_FILE)
    print(f"Saved audio to {OUTPUT_FILE}")

if __name__ == "__main__":
    asyncio.run(main())

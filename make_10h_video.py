import os
import glob
import asyncio
import edge_tts
import subprocess
import json

import shutil

OUT_DIR = r"C:\Users\ITHN\Downloads\H-MMO-Shorts\10h_project"
os.makedirs(OUT_DIR, exist_ok=True)

IMAGE_PATH = r"C:\Users\ITHN\.gemini\antigravity\brain\69294080-119a-405e-9ebc-bc899d481896\aesthetic_book_background_1787421397532.jpg"
FFMPEG_EXE = r"C:\Users\ITHN\.gemini\antigravity\scratch\h-mmo\node_modules\@ffmpeg-installer\win32-x64\ffmpeg.exe"
FFPROBE_EXE = r"C:\Users\ITHN\.gemini\antigravity\scratch\h-mmo\node_modules\ffprobe-static\bin\win32\ia32\ffprobe.exe"

def get_audio_duration(file_path):
    cmd = [FFPROBE_EXE, "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file_path]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, text=True)
    return float(result.stdout.strip())

def format_srt_time(seconds):
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds - int(seconds)) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

async def process_scene(scene_id, text):
    print(f"Processing scene {scene_id}...")
    audio_path = os.path.join(OUT_DIR, f"scene_{scene_id}.wav")
    
    # 1. Generate TTS
    communicate = edge_tts.Communicate(text, "vi-VN-HoaiMyNeural")
    await communicate.save(audio_path)
    
    # 2. Get duration
    duration = get_audio_duration(audio_path)
    
    # 3. Create new SRT
    srt_path = os.path.join(OUT_DIR, f"scene_{scene_id}.srt")
    end_time_str = format_srt_time(duration)
    srt_content = f"1\n00:00:00,000 --> {end_time_str}\n{text}\n"
    with open(srt_path, "w", encoding="utf-8") as f:
        f.write(srt_content)
        
    # 4. Generate video segment
    video_path = os.path.join(OUT_DIR, f"scene_{scene_id}.mp4")
    
    # We will use ffmpeg to combine image, audio, and subtitle.
    # The subtitle filter requires escaped path for Windows
    srt_path_escaped = srt_path.replace('\\', '/').replace(':', '\\:')
    
    ffmpeg_cmd = [
        FFMPEG_EXE, "-y",
        "-loop", "1", "-framerate", "30",
        "-i", IMAGE_PATH,
        "-i", audio_path,
        "-c:v", "libx264", "-tune", "stillimage",
        "-c:a", "aac", "-b:a", "192k",
        "-vf", f"subtitles='{srt_path_escaped}':force_style='FontName=Arial,FontSize=20,PrimaryColour=&H00FFFF,OutlineColour=&H000000,BorderStyle=1,MarginV=30'",
        "-pix_fmt", "yuv420p",
        "-t", str(duration),
        video_path
    ]
    subprocess.run(ffmpeg_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return video_path

async def main():
    # Find all original srt files to get the text
    original_srts = glob.glob(r"C:\Users\ITHN\Downloads\H-MMO-Shorts\scene_*.srt")
    
    # Sort them by scene number
    def get_scene_num(filename):
        try:
            return int(os.path.basename(filename).replace("scene_", "").replace(".srt", ""))
        except:
            return 999
    
    original_srts.sort(key=get_scene_num)
    
    video_files = []
    
    for srt in original_srts:
        scene_id = get_scene_num(srt)
        if scene_id == 999: continue
        
        with open(srt, "r", encoding="utf-8") as f:
            lines = f.readlines()
            if len(lines) >= 3:
                text = "".join(lines[2:]).strip()
                if text:
                    vid_path = await process_scene(scene_id, text)
                    video_files.append(vid_path)
                    
    # Concatenate all segments
    list_file_path = os.path.join(OUT_DIR, "list.txt")
    with open(list_file_path, "w", encoding="utf-8") as f:
        for vid in video_files:
            # format for ffmpeg concat
            f.write(f"file '{vid}'\n")
            
    all_scenes_path = os.path.join(OUT_DIR, "all_scenes.mp4")
    print("Concatenating all scenes...")
    subprocess.run([FFMPEG_EXE, "-y", "-f", "concat", "-safe", "0", "-i", list_file_path, "-c", "copy", all_scenes_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    # Loop to 10 hours (36000 seconds)
    final_10h_path = r"C:\Users\ITHN\Downloads\H-MMO-Shorts\10_hours_video_final.mp4"
    print("Looping to 10 hours... This might take a bit.")
    # -stream_loop -1 will loop infinitely, -t 36000 stops it at 10 hours
    subprocess.run([FFMPEG_EXE, "-y", "-stream_loop", "-1", "-i", all_scenes_path, "-c", "copy", "-t", "36000", final_10h_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    print(f"DONE! 10-hour video saved to {final_10h_path}")

if __name__ == "__main__":
    asyncio.run(main())

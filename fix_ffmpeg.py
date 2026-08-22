import sys
import codecs

with codecs.open('src/main/videoEngine.ts', 'r', 'utf-8') as f:
    content = f.read()

# Add dubbedAudioPath to options
content = content.replace(
    "const { videoPath, srtPath, blurRegions, subStyle, fontSize = 32, textColor = '#ffffff', borderColor = '#000000', borderWidth = 2, addBg = false, fontFamily = 'Arial', flipVideo = false, applySubtitles = true, previewMode = false } = options",
    "const { videoPath, dubbedAudioPath, srtPath, blurRegions, subStyle, fontSize = 32, textColor = '#ffffff', borderColor = '#000000', borderWidth = 2, addBg = false, fontFamily = 'Arial', flipVideo = false, applySubtitles = true, previewMode = false } = options"
)

# Find where complexFilter is applied
replace_str = """
      if (complexFilter.length > 0) {
        command = command.videoFilters(complexFilter)
      }
"""

replacement = """
      let outputOptions: string[] = ['-y'];

      if (dubbedAudioPath && fs.existsSync(dubbedAudioPath)) {
        command = command.input(dubbedAudioPath)
          .inputOptions([
            '-f', 's16le',
            '-ar', '24000',
            '-ac', '1'
          ]);
          
        complexFilter.push('[0:a]volume=0.15[bg]');
        complexFilter.push('[1:a]volume=1.0[dub]');
        complexFilter.push('[bg][dub]amix=inputs=2:duration=first[amix]');
        complexFilter.push('[amix]alimiter=limit=-1.0dB[aout]');
        
        outputOptions.push('-map', '0:v', '-map', '[aout]', '-c:a', 'aac', '-b:a', '192k');
      } else {
        // Just copy audio if no dubbing
        outputOptions.push('-c:a', 'copy');
      }

      if (complexFilter.length > 0) {
        // Instead of videoFilters, use complexFilter to handle both A/V if needed
        command = command.complexFilter(complexFilter);
      }
"""

content = content.replace(replace_str, replacement)
content = content.replace(".outputOptions('-y')", ".outputOptions(outputOptions)")

with codecs.open('src/main/videoEngine.ts', 'w', 'utf-8') as f:
    f.write(content)

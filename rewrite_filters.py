import codecs
import re

with codecs.open('src/main/videoEngine.ts', 'r', 'utf-8') as f:
    content = f.read()

# Replace complexFilter array with vFilters
content = content.replace("let complexFilter: string[] = []", "let vFilters: string[] = []")
content = content.replace("complexFilter.push(delogo", "vFilters.push(delogo")
content = content.replace("complexFilter.push('hflip')", "vFilters.push('hflip')")
content = content.replace("complexFilter.push(subFilter)", "vFilters.push(subFilter)")

# Replace the assembly block
replace_str = """
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

replacement = """
      let filterChain: string[] = [];
      let videoPad = '0:v';
      
      if (vFilters.length > 0) {
        filterChain.push([0:v][vout]);
        videoPad = '[vout]';
      }

      let outputOptions: string[] = ['-y'];

      if (dubbedAudioPath && fs.existsSync(dubbedAudioPath)) {
        command = command.input(dubbedAudioPath)
          .inputOptions([
            '-f', 's16le',
            '-ar', '24000',
            '-ac', '1'
          ]);
          
        filterChain.push('[0:a]volume=0.15[bg]');
        filterChain.push('[1:a]volume=1.0[dub]');
        filterChain.push('[bg][dub]amix=inputs=2:duration=first[amix]');
        filterChain.push('[amix]alimiter=limit=-1.0dB[aout]');
        
        outputOptions.push('-map', videoPad, '-map', '[aout]', '-c:v', 'libx264', '-preset', 'fast', '-c:a', 'aac', '-b:a', '192k');
      } else {
        outputOptions.push('-map', videoPad, '-map', '0:a?', '-c:v', 'libx264', '-preset', 'fast', '-c:a', 'copy');
      }

      if (filterChain.length > 0) {
        command = command.complexFilter(filterChain);
      } else {
        // If NO filters at all, we don't need to re-encode video unless we want to, but we mapped it so we should.
      }
"""

content = content.replace(replace_str.strip(), replacement.strip())

with codecs.open('src/main/videoEngine.ts', 'w', 'utf-8') as f:
    f.write(content)

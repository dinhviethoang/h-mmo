const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegStatic);

const videoPath = 'C:\\Users\\ITHN\\.gemini\\antigravity\\scratch\\h-mmo\\Downloads\\videoplayback.mp4';
const srtPath = 'C:\\Users\\ITHN\\.gemini\\antigravity\\scratch\\h-mmo\\Downloads\\videoplayback_vi.srt';
const outPath = 'C:\\Users\\ITHN\\.gemini\\antigravity\\scratch\\h-mmo\\Downloads\\test_final.mp4';

// Test 1: what is currently in videoEngine.ts
const srtClean1 = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');

let complexFilter = [
  'hflip',
  `subtitles='${srtClean1}':force_style='FontName=Arial'`
];

console.log('Filters:', complexFilter);

ffmpeg(videoPath)
  .videoFilters(complexFilter)
  .output(outPath)
  .outputOptions('-y')
  .on('start', (cmd) => console.log('CMD:', cmd))
  .on('end', () => console.log('Done'))
  .on('error', (err) => console.error('Error:', err.message))
  .run();

const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegStatic);

const videoPath = 'C:\\Users\\ITHN\\.gemini\\antigravity\\scratch\\h-mmo\\Downloads\\videoplayback.mp4';
const srtPath = 'C:\\Users\\ITHN\\.gemini\\antigravity\\scratch\\h-mmo\\Downloads\\videoplayback_vi.srt';
const outPath = 'C:\\Users\\ITHN\\.gemini\\antigravity\\scratch\\h-mmo\\Downloads\\test_final.mp4';

const srtClean1 = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');

let complexFilter = [
  'hflip',
  `subtitles='${srtClean1}':force_style='FontName=Arial,Alignment=2,MarginV=20,FontSize=32,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,BorderStyle=1,Outline=2,Shadow=0,Bold=-1'`
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

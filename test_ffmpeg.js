const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegStatic);

const videoPath = 'Downloads/videoplayback_dubbed.mp4';
const srtPath = 'Downloads/videoplayback_vi.srt';
const outPath = 'Downloads/videoplayback_dubbed_final.mp4';
const srtClean = srtPath.replace(/\\/g, '/').replace(/:/g, '\\\\:');

let complexFilter = [
  'hflip',
  `subtitles='${srtClean}':force_style='FontName=Arial,Alignment=2,MarginV=20,FontSize=32,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,BorderStyle=1,Outline=2,Shadow=0,Bold=-1'`
];

console.log('Filters:', complexFilter);

ffmpeg(videoPath)
  .videoFilters(complexFilter)
  .output(outPath)
  .on('start', (cmd) => console.log('CMD:', cmd))
  .on('end', () => console.log('Done'))
  .on('error', (err) => console.error('Error:', err.message))
  .run();

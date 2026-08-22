const srtPath = 'C:\\Users\\ITHN\\.gemini\\antigravity\\scratch\\h-mmo\\Downloads\\videoplayback_vi.srt';
const srtClean1 = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
const srtClean2 = srtPath.replace(/\\/g, '/').replace(/:/g, '\\\\:');

console.log('srtClean1:', srtClean1);
console.log('srtClean2:', srtClean2);

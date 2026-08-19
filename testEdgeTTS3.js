const { EdgeTTS } = require('node-edge-tts');

async function testStr(str) {
  const tts = new EdgeTTS({
    voice: 'vi-VN-HoaiMyNeural',
    lang: 'vi-VN',
    outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
  });
  console.log(`Testing: ${str}`);
  try {
    await tts.ttsPromise(str, 'test.mp3');
    console.log(`Success: ${str}`);
  } catch(e) {
    console.log(`Failed: ${str} - ${e.message}`);
  }
}

async function test() {
  await testStr('Nhanh lên lùi lại nửa bước'); // No punctuation
  await testStr('Nhanh lên, lùi lại nửa bước'); // Comma
  await testStr('Nhanh lên lùi lại nửa bước!'); // Exclamation
  await testStr('Nhanh lên lùi lại nửa bước...'); // Ellipsis
}
test();

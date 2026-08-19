const { EdgeTTS } = require('node-edge-tts');

async function test() {
  try {
    const tts = new EdgeTTS({
      voice: 'vi-VN-HoaiMyNeural', // or vi-VN-NamMinhNeural
      lang: 'vi-VN',
      outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
    });
    
    await tts.ttsPromise('Xin chào, đây là bài kiểm tra lồng tiếng.', 'test_output.mp3');
    console.log('Success! Saved to test_output.mp3');
  } catch (e) {
    console.error('Error:', e);
  }
}

test();

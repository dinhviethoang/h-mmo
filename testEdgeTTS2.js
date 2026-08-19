const { EdgeTTS } = require('node-edge-tts');

async function generate(text, file) {
  const tts = new EdgeTTS({
    voice: 'vi-VN-HoaiMyNeural',
    lang: 'vi-VN',
    outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
  });
  return tts.ttsPromise(text, file);
}

async function test() {
  try {
    console.log("Generating 'Nhanh lên, lùi lại nửa bước!...'");
    await generate('Nhanh lên, lùi lại nửa bước!...', 'test1.mp3');
    console.log("Success 1");
    
    console.log("Generating 'Rõ!...'");
    await generate('Rõ!...', 'test2.mp3');
    console.log("Success 2");
  } catch (err) {
    console.error("Error:", err);
  }
}

test();

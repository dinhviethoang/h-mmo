const { EdgeTTS } = require('node-edge-tts');

const tts = new EdgeTTS({
    voice: 'vi-VN-HoaiMyNeural',
    lang: 'vi-VN',
    outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
});

async function run() {
    try {
        console.log("Synthesizing audio...");
        await tts.ttsPromise("Giữa một buổi chiều yên tĩnh, cô ấy kể lại câu chuyện với giọng trầm ấm.", "output_node_edge.mp3");
        console.log("Done!");
    } catch(err) {
        console.error("Error:", err);
    }
}
run();

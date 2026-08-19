import { KokoroTTS } from "kokoro-js";
import fs from "fs";

async function main() {
    console.log("Loading Kokoro-js...");
    try {
        // We'll try the base model first to see if JS is working
        const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
            dtype: "q8",
            device: "cpu" // we are on CPU/Windows node
        });

        console.log("Model loaded. Generating speech...");
        const text = "Hello world! This is Kokoro TTS running purely in JavaScript.";
        const audio = await tts.generate(text, {
            voice: "af_heart",
        });

        await audio.save("output_node.wav");
        console.log("Saved output_node.wav successfully!");
    } catch (error) {
        console.error("Error:", error);
    }
}

main();

import { client } from "@gradio/client";
import fs from "fs";

async function main() {
    console.log("Connecting to Hugging Face Space 'dinhthuan/Kokoro-Vietnamese'...");
    try {
        const app = await client("dinhthuan/Kokoro-Vietnamese");
        
        const apiInfo = await app.view_api();
        console.log("API Info:", JSON.stringify(apiInfo, null, 2));
        
        console.log("Connected! Requesting TTS...");
        const result = await app.predict("/synthesize", [
            "Giữa một buổi chiều yên tĩnh, cô ấy kể lại câu chuyện với giọng trầm ấm.", // text
            "diem_trinh", // voice
            1.0, // speed
            50 // crossfade_ms
        ]);

        console.log("Result received:", result);
        
        // result.data[0] should be the audio object { url: ... }
        const audioUrl = result.data[0].url;
        console.log("Downloading audio from:", audioUrl);
        
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        fs.writeFileSync("output_hf.wav", Buffer.from(arrayBuffer));
        console.log("Saved audio to output_hf.wav!");
    } catch (error) {
        console.error("Error connecting to HF Space API:");
        console.error(error);
    }
}

main();

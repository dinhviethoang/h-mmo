const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: "invalid_key", httpOptions: { apiVersion: 'v1' } });

async function run() {
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: 'Hello'
    });
    console.log(res.text);
  } catch (e) {
    console.error("String prompt error:", e.message);
  }

  try {
    const res = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [{
        role: 'user',
        parts: [
          { fileData: { fileUri: 'https://foo', mimeType: 'video/mp4' } }
        ]
      }]
    });
    console.log(res.text);
  } catch (e) {
    console.error("fileData prompt error:", e.message);
  }
}

run();

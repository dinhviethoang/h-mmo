import codecs

with codecs.open('src/main/autoshortsEngine.ts', 'r', 'utf-8-sig') as f:
    content = f.read()

import re

new_veo_func = """
// T?o video th?t b?ng Google Veo 3 (Gemini API)
async function generateVeo3Video(apiKey: string, prompt: string, outputPath: string, log: (m: string) => void) {
  log(`[Veo] Ðang g?i yêu c?u t?o video t?i Google API...`);
  log(`[Veo] Prompt: ${prompt.substring(0, 50)}...`);
  
  if (apiKey === 'AIzaSyC-Fake-Key-For-Veo-3' || !apiKey) {
    throw new Error('B?n chua nh?p Google API Key th?t! Vui lòng nh?p ? giao di?n.');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-video:predictLongRunning?key=${apiKey}`;
  
  const initRes = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt: prompt }],
      parameters: {
        aspectRatio: "9:16",
        durationSeconds: 5
      }
    })
  });

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`Google API Error (${initRes.status}): ${errText}`);
  }

  const initData = await initRes.json();
  const operationName = initData.name;
  if (!operationName) {
    throw new Error(`Không nh?n du?c Operation Name t? Google. D? li?u: ${JSON.stringify(initData)}`);
  }

  log(`[Veo] API dã ti?p nh?n l?nh (Operation: ${operationName}). Ðang ch? h? th?ng render... (Có th? m?t 2-5 phút)`);

  let done = false;
  let videoBase64 = null;
  let videoUri = null;

  while (!done) {
    await new Promise(r => setTimeout(r, 20000)); // Ch? 20 giây m?i l?n poll
    log(`[Veo] Ðang ki?m tra tr?ng thái video...`);
    
    const pollRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${apiKey}`);
    if (!pollRes.ok) {
      log(`[Veo] L?i khi ki?m tra tr?ng thái: HTTP ${pollRes.status}`);
      continue;
    }
    
    const pollData = await pollRes.json();
    if (pollData.error) {
      throw new Error(`L?i t? Google trong quá trình render: ${pollData.error.message}`);
    }
    
    if (pollData.done) {
      done = true;
      log(`[Veo] Render thành công! Ðang t?i video v? máy...`);
      
      // X? lý response t? API
      // D? li?u video thu?ng tr? v? d?ng bytes (Base64) ho?c URI
      try {
        const responseObj = pollData.response || {};
        const generatedVideo = responseObj.generatedVideo || responseObj.video || {};
        
        if (generatedVideo.videoBytes) {
           videoBase64 = generatedVideo.videoBytes;
        } else if (generatedVideo.uri) {
           videoUri = generatedVideo.uri;
        } else if (responseObj.predictions && responseObj.predictions[0]) {
           const pred = responseObj.predictions[0];
           if (pred.bytesBase64Encoded) videoBase64 = pred.bytesBase64Encoded;
           else if (pred.videoUri) videoUri = pred.videoUri;
        }
      } catch(e) {
        throw new Error(`Không th? parse video t? k?t qu? c?a Google: ${JSON.stringify(pollData)}`);
      }
    }
  }

  // T?i file xu?ng
  if (videoBase64) {
    fs.writeFileSync(outputPath, Buffer.from(videoBase64, 'base64'));
    log(`[Veo] Ðã luu video thành công t? Base64!`);
  } else if (videoUri) {
    log(`[Veo] Ðang t?i video t? URL: ${videoUri}`);
    const vidRes = await fetch(videoUri);
    const arrayBuffer = await vidRes.arrayBuffer();
    fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
    log(`[Veo] Ðã luu video thành công!`);
  } else {
    throw new Error('Google báo Render xong nhung không tr? v? n?i dung video.');
  }
}
"""

# Replace the mock function with the real one
pattern = re.compile(r'// Gi? l?p API call t?i Google Veo 3\nasync function generateVeo3Video.*?\n}\n', re.DOTALL)
new_content = pattern.sub(new_veo_func, content)

with codecs.open('src/main/autoshortsEngine.ts', 'w', 'utf-8-sig') as f:
    f.write(new_content)

print("Replaced Veo function successfully!")

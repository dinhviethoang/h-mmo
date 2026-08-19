async function run() {
  const apiKey = 'invalid_key';
  const fileUri = 'https://generativelanguage.googleapis.com/v1beta/files/abc1234';
  const mimeType = 'video/mp4';

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { fileData: { fileUri, mimeType } },
          { text: "Hello" }
        ]
      }]
    })
  });
  
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}

run();

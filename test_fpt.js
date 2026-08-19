const fs = require('fs');

async function testFPT() {
    try {
        const res = await fetch('https://api.fpt.ai/hmi/tts/v5', {
            method: 'POST',
            headers: {
                'api-key': '8DDtN1RmzZhHnnnS0suwFHgA9ptbCrUk', // use a dummy or read from args
                'voice': 'banmai',
                'format': 'mp3'
            },
            body: 'Xin chào, đây là thử nghiệm.'
        });
        const text = await res.text();
        console.log("Status:", res.status);
        console.log("Response:", text);
    } catch (e) {
        console.error(e);
    }
}
testFPT();

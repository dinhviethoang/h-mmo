import codecs
import re

# 1. Update UI (Remove API Key)
with codecs.open('src/renderer/src/pages/AutoShortsPage.tsx', 'r', 'utf-8-sig') as f:
    ui_content = f.read()

# Remove apiKey state usage and input box
ui_content = ui_content.replace(
    'const [apiKey, setApiKey] = useState(\'\');',
    'const [apiKey, setApiKey] = useState(\'FREE_MODE\');'
)

input_box_html = """<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label className="input-label" style={{ color: '#00ffff', fontWeight: 600 }}>Google API Key (Gemini Advanced)</label>
              <input 
                type="password" 
                className="form-control" 
                placeholder="Nh?p API Key b?t d?u b?ng AIzaSy..." 
                value={apiKey} 
                onChange={(e) => setApiKey(e.target.value)} 
                disabled={isProcessing}
                style={{ backgroundColor: '#121319', border: '1px solid #2a2c38', color: '#fff', padding: '12px', borderRadius: '6px' }}
              />
            </div>"""

ui_content = ui_content.replace(input_box_html, """<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ backgroundColor: '#1a472a', border: '1px solid #2ea043', padding: '15px', borderRadius: '8px' }}>
                <div style={{ color: '#39ff14', fontSize: '15px', fontWeight: 'bold', marginBottom: '5px' }}>? Ch? d? MI?N PHÍ 100%</div>
                <div style={{ color: '#8b949e', fontSize: '13px' }}>H? th?ng s? t? d?ng dùng AI sinh ?nh nét cao, t?o hi?u ?ng chuy?n d?ng và l?ng ghép ph? d? mà không t?n 1 d?ng API nào.</div>
              </div>
            </div>""")

# Remove alert for empty apiKey
ui_content = ui_content.replace(
    """if (!apiKey) {
      alert('Vui lòng nh?p API Key c?a Google Veo 3!');
      return;
    }""",
    ""
)

with codecs.open('src/renderer/src/pages/AutoShortsPage.tsx', 'w', 'utf-8-sig') as f:
    f.write(ui_content)

# 2. Update Engine
with codecs.open('src/main/autoshortsEngine.ts', 'r', 'utf-8-sig') as f:
    eng_content = f.read()

new_func = """// T?o video t? ?nh AI Mi?n phí + Hi?u ?ng chuy?n d?ng (Ken Burns)
async function generateVeo3Video(apiKey: string, prompt: string, outputPath: string, log: (m: string) => void) {
  log(`[AI Image] Ðang g?i Pollinations AI t?o ?nh t? prompt...`);
  log(`[AI Image] T? KHÓA: ${prompt.substring(0, 50)}...`);
  
  const encodedPrompt = encodeURIComponent(prompt + ", cinematic, ultra realistic, 8k, masterpiece");
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1080&height=1920&nologo=true`;
  
  const res = await fetch(url);
  if (!res.ok) throw new Error("Không th? t?i ?nh t? Pollinations AI");
  
  const arrayBuffer = await res.arrayBuffer();
  const imagePath = outputPath.replace('.mp4', '.jpg');
  fs.writeFileSync(imagePath, Buffer.from(arrayBuffer));
  
  log(`[AI Image] Ðã t?i ?nh thành công! Ðang t?o hi?u ?ng chuy?n d?ng video (Ken Burns)...`);
  
  const duration = 12; // M?c d?nh 12 giây cho video n?n
  
  await new Promise<void>((resolve, reject) => {
    // Zoom in nh? nhàng d? t?o c?m giác video th?c
    ffmpeg(imagePath)
      .loop(duration)
      .videoFilters([
        `zoompan=z='min(zoom+0.001,1.15)':d=${duration * 25}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920`
      ])
      .outputOptions([
        '-c:v libx264',
        '-t', duration.toString(),
        '-pix_fmt yuv420p',
        '-y'
      ])
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .save(outputPath);
  });
  
  if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
  log(`[AI Image] Render video n?n thành công!`);
}
"""

pattern = re.compile(r'// T?o video th?t b?ng Google Veo 3 \(Gemini API\)\nasync function generateVeo3Video.*?\n}\n', re.DOTALL)
eng_content = pattern.sub(new_func, eng_content)

with codecs.open('src/main/autoshortsEngine.ts', 'w', 'utf-8-sig') as f:
    f.write(eng_content)

print("Applied FREE pipeline successfully!")

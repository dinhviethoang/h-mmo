import re

with open('src/renderer/src/pages/EditorPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add state
content = re.sub(
    r'(const \[currentTimeMs, setCurrentTimeMs\] = useState\(0\);)',
    r'\1\n  const [enableSubtitles, setEnableSubtitles] = useState(true);',
    content
)

# Update button
content = re.sub(
    r'<button className="btn-toggle on">.*?</button>',
    r'<button className={tn-toggle } onClick={() => setEnableSubtitles(!enableSubtitles)}>{enableSubtitles ? "B?t" : "T?t"}</button>',
    content
)

# Wrap radio-card-group
content = content.replace(
    '<div className="radio-card-group">',
    '<div style={{ opacity: enableSubtitles ? 1 : 0.5, pointerEvents: enableSubtitles ? "auto" : "none" }}>\n                  <div className="radio-card-group">'
)

content = content.replace(
    '</div>\n                  <div className="section-header-flex" style={{ marginTop: \'30px\' }}>',
    '</div>\n                  </div>\n                  <div className="section-header-flex" style={{ marginTop: \'30px\' }}>'
)

# Pass applySubtitles to IPC
content = content.replace(
    'voiceId, flipVideo',
    'voiceId, flipVideo, applySubtitles: enableSubtitles'
)

with open('src/renderer/src/pages/EditorPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

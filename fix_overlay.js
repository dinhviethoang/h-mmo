const fs = require('fs');
let content = fs.readFileSync('src/renderer/src/pages/EditorPage.tsx', 'utf8');

// Hide subtitles if disabled
content = content.replace(
    '{parsedSubtitles.map(sub => {',
    '{enableSubtitles && parsedSubtitles.map(sub => {'
);

// Hide blur if disabled
content = content.replace(
    "{activeTab === 'blur' && blurRegions.map(region => (",
    "{enableBlur && activeTab === 'blur' && blurRegions.map(region => ("
);

// Fix text stroke eating the font by using paintOrder (not fully supported in HTML text but worth trying, or drop WebkitTextStroke if too buggy)
// Let's just fix the toggle first.

fs.writeFileSync('src/renderer/src/pages/EditorPage.tsx', content);

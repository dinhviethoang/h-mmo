const fs = require('fs');

// SubtitlePage.tsx
let subPage = fs.readFileSync('src/renderer/src/pages/SubtitlePage.tsx', 'utf8');

subPage = subPage.replace(
  "import { useState, useRef, useEffect } from 'react'",
  "import { useState, useRef, useEffect } from 'react'" // just in case
);

subPage = subPage.replace(
  "const [apiKey, setApiKey] = useState<string>('');",
  "const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('geminiApiKey') || '');\n  useEffect(() => { localStorage.setItem('geminiApiKey', apiKey); }, [apiKey]);"
);

fs.writeFileSync('src/renderer/src/pages/SubtitlePage.tsx', subPage, 'utf8');

// AutoShortsPage.tsx
let autoPage = fs.readFileSync('src/renderer/src/pages/AutoShortsPage.tsx', 'utf8');

autoPage = autoPage.replace(
  "const [activeTask, setActiveTask] = useState(1);",
  "const [activeTask, setActiveTask] = useState(1);\n  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('geminiApiKey') || '');\n  useEffect(() => { localStorage.setItem('geminiApiKey', apiKey); }, [apiKey]);"
);

autoPage = autoPage.replace(
  "<input type=\"text\" className=\"form-control mb-3\" placeholder=\"Nh?p API Key c?a b?n...\" />",
  "<input type=\"password\" className=\"form-control mb-3\" placeholder=\"Nh?p API Key c?a b?n...\" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />"
);

autoPage = autoPage.replace(
  "import { useState } from 'react';",
  "import { useState, useEffect } from 'react';"
);

fs.writeFileSync('src/renderer/src/pages/AutoShortsPage.tsx', autoPage, 'utf8');

const fs = require('fs');
let content = fs.readFileSync('src/renderer/src/App.tsx', 'utf8');

// Add import if not exists
if (!content.includes('AutoShortsPage')) {
    content = content.replace(
        "import DubbingPage from './pages/DubbingPage';",
        "import DubbingPage from './pages/DubbingPage';\nimport { AutoShortsPage } from './pages/AutoShortsPage';"
    );
}

// Add route if not exists
if (!content.includes("case 'autoshorts':")) {
    content = content.replace(
        "case 'dubbing':\n        return <DubbingPage />;",
        "case 'dubbing':\n        return <DubbingPage />;\n      case 'autoshorts':\n        return <AutoShortsPage />;"
    );
}

fs.writeFileSync('src/renderer/src/App.tsx', content);

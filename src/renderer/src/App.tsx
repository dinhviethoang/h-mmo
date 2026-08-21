import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { EditorPage } from './pages/EditorPage';
import { SubtitlePage } from './pages/SubtitlePage';
import { DownloadPage } from './pages/DownloadPage';
import DubbingPage from './pages/DubbingPage';
import { AutoShortsPage } from './pages/AutoShortsPage';

function App() {
  const [currentPath, setCurrentPath] = useState('editor');

  const renderContent = () => {
    switch (currentPath) {
      case 'editor':
        return <EditorPage />;
      case 'download':
        return <DownloadPage platform="YouTube" />;
      case 'douyin':
        return <DownloadPage platform="Douyin" />;
      case 'subtitle':
        return <SubtitlePage />;
      case 'dubbing':
        return <DubbingPage />;
      case 'autoshorts':
        return <AutoShortsPage />;
      default:
        return <EditorPage />;
    }
  };

  return (
    <>
      <Sidebar 
        currentPath={currentPath}
        onNavigate={setCurrentPath}
      />
      <main style={{ flex: 4, minWidth: 0, height: '100%', overflow: 'hidden' }}>
        {renderContent()}
      </main>
    </>
  );
}

export default App;

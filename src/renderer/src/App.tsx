import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { EditorPage } from './pages/EditorPage';
import { SubtitlePage } from './pages/SubtitlePage';
import { DownloadPage } from './pages/DownloadPage';
import { AutoShortsPage } from './pages/AutoShortsPage';
import { AutoComicPage } from './pages/AutoComicPage';
import { VoicePage } from './pages/VoicePage';
import { ControlBar } from './components/ControlBar';
import { TransformPage } from './pages/TransformPage';
import { OcrPage } from './pages/OcrPage';
import { SystemPage } from './pages/SystemPage';
import { AssemblePage } from './pages/AssemblePage';
import { ReviewPage } from './pages/ReviewPage';
import { PipelinePage } from './pages/PipelinePage';
import { GoiSachPage } from './pages/GoiSachPage';
import { ExplainerPage } from './pages/ExplainerPage';

const SECTION_NAMES: Record<string, string> = {
  pipeline: 'Dây chuyền 1 chạm',
  editor: 'Biên tập video', download: 'Tải xuống YouTube', douyin: 'Tải xuống Douyin', subtitle: 'Tạo phụ đề',
voices: 'Giọng đọc', transform: 'Hiệu chỉnh video', ocr: 'Đọc chữ video', system: 'Hệ thống', assemble: 'Ghép video', review: 'Chấm chất lượng', autoshorts: 'Auto Shorts', autocomic: 'Auto Comic', goisach: 'Gối Sách', explainer: 'Video vẽ tay'
};

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
      case 'autoshorts':
        return <AutoShortsPage />;
      case 'autocomic':
        return <AutoComicPage />;
      case 'voices':
        return <VoicePage />;
      case 'transform':
        return <TransformPage />;
      case 'ocr':
        return <OcrPage />;
      case 'system':
        return <SystemPage />;
      case 'pipeline':
        return <PipelinePage onNavigate={setCurrentPath} />;
      case 'assemble':
        return <AssemblePage />;
      case 'review':
        return <ReviewPage onNavigate={setCurrentPath} />;
      case 'goisach':
        return <GoiSachPage />;
      case 'explainer':
        return <ExplainerPage />;
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
      <main style={{ flex: 4, minWidth: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <ControlBar section={SECTION_NAMES[currentPath] || 'H-MMO'} />
        <div className="ind-content" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {renderContent()}
        </div>
      </main>
    </>
  );
}

export default App;

import { 
  Download, 
  Link2, 
  PenTool, 
  Video
} from 'lucide-react';
import './Sidebar.css';

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export function Sidebar({ currentPath, onNavigate }: SidebarProps) {
  const menuItems = [
    { id: 'download', icon: Download, label: 'Tải xuống' },
    { id: 'douyin', icon: Link2, label: 'Douyin' },
    { id: 'subtitle', icon: PenTool, label: 'Tạo phụ đề' },
    { id: 'editor', icon: Video, label: 'Biên tập video' },
    { id: 'autoshorts', icon: Video, label: 'Auto Shorts (AI)' },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1 className="logo">H-MMO</h1>
      </div>

      <nav className="sidebar-nav">
        {menuItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${currentPath === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <item.icon size={18} className="nav-icon" />
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">


        <div className="version-label">
          v2.0 · H-MMO Studio
        </div>
      </div>
    </div>
  );
}

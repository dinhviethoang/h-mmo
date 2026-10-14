import { 
  Download, 
  Link2, 
  PenTool, 
  Video,
  Mic,
  Crop,
  ScanText,
  Settings,
  Layers,
  ClipboardCheck,
  Zap
} from 'lucide-react';
import './Sidebar.css';
import logoGear from '../assets/logo-gear.png';

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export function Sidebar({ currentPath, onNavigate }: SidebarProps) {
  const menuItems = [
    { id: 'pipeline', icon: Zap, label: 'Dây chuyền 1 chạm' },
    { id: 'download', icon: Download, label: 'Tải xuống' },
    { id: 'douyin', icon: Link2, label: 'Douyin' },
    { id: 'transform', icon: Crop, label: 'Hiệu chỉnh video' },
    { id: 'subtitle', icon: PenTool, label: 'Tạo phụ đề' },
    { id: 'ocr', icon: ScanText, label: 'Đọc chữ video' },
    { id: 'editor', icon: Video, label: 'Biên tập video' },
    { id: 'assemble', icon: Layers, label: 'Ghép video' },
    { id: 'review', icon: ClipboardCheck, label: 'Chấm chất lượng' },
    { id: 'voices', icon: Mic, label: 'Giọng đọc' },
    { id: 'autoshorts', icon: Video, label: 'Auto Shorts (AI)' },
    { id: 'autocomic', icon: PenTool, label: 'Auto Comic' },
    { id: 'system', icon: Settings, label: 'Hệ thống' },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <img src={logoGear} className="logo-gear" alt="" />
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

// src/components/Icons.tsx
import { 
  FileText, 
  ExternalLink, 
  Share2, 
  Download, 
  Music,
  Image,
  Video,
  FileSpreadsheet,
  Globe,
  Package,
  Clock,
  User,
  Link,
  Tag,
  Eye,
  EyeOff,
  X,
  Loader2,
  Zap,
  Archive,
  FolderOpen,
  Users,
  Menu,
  Info,
  Calendar,
  BarChart,
  Heart,
  Layers,
  ChevronDown,
  CheckCircle,
  AlertTriangle,
  Settings,
  RotateCcw,
  Hash,
  AlertCircle,
  RefreshCw,
  Twitter,
  Github
} from 'lucide-preact'

interface IconProps {
  size?: number
  className?: string
  onClick?: () => void
}

export const Icons = {
  // Media Actions
  Details: (props: IconProps) => <FileText size={18} {...props} />,
  Open: (props: IconProps) => <ExternalLink size={18} {...props} />,
  Share: (props: IconProps) => <Share2 size={18} {...props} />,
  Download: (props: IconProps) => <Download size={18} {...props} />,
  
  // Media Types
  Music: (props: IconProps) => <Music size={18} {...props} />,
  Image: (props: IconProps) => <Image size={18} {...props} />,
  Video: (props: IconProps) => <Video size={18} {...props} />,
  Document: (props: IconProps) => <FileText size={18} {...props} />,
  Spreadsheet: (props: IconProps) => <FileSpreadsheet size={18} {...props} />,
  Website: (props: IconProps) => <Globe size={18} {...props} />,
  
  // Metadata
  Package: (props: IconProps) => <Package size={16} {...props} />,
  Clock: (props: IconProps) => <Clock size={16} {...props} />,
  User: (props: IconProps) => <User size={16} {...props} />,
  Link: (props: IconProps) => <Link size={16} {...props} />,
  Tag: (props: IconProps) => <Tag size={16} {...props} />,
  
  // Privacy
  Eye: (props: IconProps) => <Eye size={18} {...props} />,
  EyeOff: (props: IconProps) => <EyeOff size={18} {...props} />,
  
  // UI Elements
  Close: (props: IconProps) => <X size={20} {...props} />,
  Loading: (props: IconProps) => <Loader2 size={20} className="animate-spin" {...props} />,
  
  // Channels
  Everything: (props: IconProps) => <Zap size={20} {...props} />,
  Images: (props: IconProps) => <Image size={20} {...props} />,
  Videos: (props: IconProps) => <Video size={20} {...props} />,
  AudioMusic: (props: IconProps) => <Music size={20} {...props} />,
  Websites: (props: IconProps) => <Globe size={20} {...props} />,
  Text: (props: IconProps) => <FileText size={20} {...props} />,
  ArFS: (props: IconProps) => <FolderOpen size={20} {...props} />,
  ArNS: (props: IconProps) => <Globe size={20} {...props} />,
  Globe: (props: IconProps) => <Globe size={16} {...props} />,
  
  // Time periods
  Recent: (props: IconProps) => <Clock size={18} {...props} />,
  Archive: (props: IconProps) => <Archive size={18} {...props} />,
  
  // Creator
  Creator: (props: IconProps) => <User size={18} {...props} />,
  Everyone: (props: IconProps) => <Users size={18} {...props} />,
  
  // Menu
  Menu: (props: IconProps) => <Menu size={18} {...props} />,
  CloseMenu: (props: IconProps) => <X size={18} {...props} />,
  Info: (props: IconProps) => <Info size={16} {...props} />,
  
  // Date picker
  Calendar: (props: IconProps) => <Calendar size={20} {...props} />,
  
  // Statistics
  BarChart: (props: IconProps) => <BarChart size={20} {...props} />,
  Heart: (props: IconProps) => <Heart size={20} {...props} />,
  Layers: (props: IconProps) => <Layers size={20} {...props} />,
  
  // Alias X for close
  X: (props: IconProps) => <X size={20} {...props} />,
  
  // Verification icons
  CheckCircle: (props: IconProps) => <CheckCircle size={12} {...props} />,
  AlertTriangle: (props: IconProps) => <AlertTriangle size={12} {...props} />,
  
  // Advanced settings icons
  Settings: (props: IconProps) => <Settings size={16} {...props} />,
  RotateCcw: (props: IconProps) => <RotateCcw size={16} {...props} />,
  ChevronDown: (props: IconProps) => <ChevronDown size={16} {...props} />,
  
  // Block height icon
  Hash: (props: IconProps) => <Hash size={16} {...props} />,
  
  // Session stats icon
  Zap: (props: IconProps) => <Zap size={16} {...props} />,
  
  // Error handling icons
  AlertCircle: (props: IconProps) => <AlertCircle size={20} {...props} />,
  Refresh: (props: IconProps) => <RefreshCw size={16} {...props} />,
  
  // Social media icons
  Twitter: (props: IconProps) => <Twitter size={16} {...props} />,
  Github: (props: IconProps) => <Github size={16} {...props} />
}

// Helper function to get media type icon
export const getMediaTypeIcon = (contentType: string) => {
  if (contentType.startsWith('image/')) return Icons.Image
  if (contentType.startsWith('video/')) return Icons.Video
  if (contentType.startsWith('audio/')) return Icons.Music
  if (contentType.includes('pdf') || contentType.startsWith('text/')) return Icons.Document
  if (contentType.includes('html')) return Icons.Website
  if (contentType.includes('spreadsheet') || contentType.includes('csv')) return Icons.Spreadsheet
  return Icons.Document
}
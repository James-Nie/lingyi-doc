import type { DocumentViewMode } from '../utils/documentViewMode';
import type { TopBarBreadcrumbItem } from '../components/layout/topBar';

/** 文档访问/预览模式，由 UnifiedEditorPage 或 WikiSpaceDocEditor 下发给各 EditorPage */
export interface EditorAccessProps {
  readOnly?: boolean;
  canEdit?: boolean;
  effectiveViewMode?: DocumentViewMode;
  onTogglePreview?: () => void;
  /** 知识库等嵌入场景传入，用于替换默认「我的空间」面包屑 */
  breadcrumbItems?: TopBarBreadcrumbItem[];
}

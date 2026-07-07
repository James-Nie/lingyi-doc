import type { DocumentViewMode } from '../utils/documentViewMode';

/** 文档访问/预览模式，由 UnifiedEditorPage 或 WikiSpaceDocEditor 下发给各 EditorPage */
export interface EditorAccessProps {
  readOnly?: boolean;
  canEdit?: boolean;
  effectiveViewMode?: DocumentViewMode;
  onTogglePreview?: () => void;
}

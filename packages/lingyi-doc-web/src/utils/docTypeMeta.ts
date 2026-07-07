export interface DocTypeMeta {
  label: string;
  icon: string;
  bg: string;
  color: string;
}

const DOC_TYPE_META: Record<string, DocTypeMeta> = {
  freeform: { label: '普通表格', icon: '⊞', bg: '#e3f2fd', color: '#1565c0' },
  standard: { label: '普通表格', icon: '⊞', bg: '#e3f2fd', color: '#1565c0' },
  base: { label: '多维表格', icon: '▦', bg: '#fce4ec', color: '#c2185b' },
  richtext: { label: '文档', icon: '文', bg: '#e8f0fe', color: '#3370ff' },
  mindnote: { label: '思维笔记', icon: '思', bg: '#e0f7fa', color: '#00acc1' },
  whiteboard: { label: '画板', icon: '画', bg: '#e6f4ea', color: '#34a853' },
};

export function getDocTypeMeta(docType?: string): DocTypeMeta {
  return DOC_TYPE_META[docType || 'freeform'] || DOC_TYPE_META.freeform;
}

import type { CSSProperties } from 'react';

export const DOC_COLORS = {
  primary: '#165DFF',
  text: '#1F2329',
  muted: '#86909C',
  border: '#E5E6EB',
  pageBg: '#F7F8FA',
  editorBg: '#FFFFFF',
};

export const DOC_PAGE_BG = DOC_COLORS.pageBg;
export const DOC_EDITOR_MAX_WIDTH = 800;

export const DOC_PLACEHOLDER_TITLE_COLOR = '#C9CDD4';
export const DOC_PLACEHOLDER_BODY_COLOR = '#D0D3D9';

export const headingStyles: Record<1 | 2 | 3 | 4 | 5 | 6, CSSProperties> = {
  1: { fontSize: 28, fontWeight: 700, lineHeight: 1.5, margin: 0, padding: '24px 0', color: DOC_COLORS.text },
  2: { fontSize: 22, fontWeight: 700, lineHeight: 1.5, margin: 0, padding: '20px 0 12px', color: DOC_COLORS.text },
  3: { fontSize: 18, fontWeight: 600, lineHeight: 1.5, margin: 0, padding: '16px 0 8px', color: DOC_COLORS.text },
  4: { fontSize: 16, fontWeight: 600, lineHeight: 1.5, margin: 0, padding: '12px 0 8px', color: DOC_COLORS.text },
  5: { fontSize: 14, fontWeight: 600, lineHeight: 1.5, margin: 0, padding: '10px 0 6px', color: DOC_COLORS.text },
  6: { fontSize: 13, fontWeight: 600, lineHeight: 1.5, margin: 0, padding: '8px 0 6px', color: DOC_COLORS.text },
};

export const paragraphStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 400,
  lineHeight: 1.7,
  margin: 0,
  padding: '8px 0',
  color: DOC_COLORS.text,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

/** 列表序号/圆点/复选框与正文首行顶部对齐（多行换行时正文悬挂缩进） */
export const listMarkerStyle: CSSProperties = {
  width: 22,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'flex-end',
  color: DOC_COLORS.muted,
  fontSize: 15,
  lineHeight: 1.7,
  alignSelf: 'flex-start',
};

export const listCheckboxStyle: CSSProperties = {
  width: 16,
  height: 16,
  flexShrink: 0,
  margin: 0,
  cursor: 'pointer',
  alignSelf: 'flex-start',
  marginTop: 3,
};

export const quoteStyle: CSSProperties = {
  ...paragraphStyle,
  color: DOC_COLORS.muted,
  borderLeft: `2px solid ${DOC_COLORS.primary}`,
  paddingLeft: 12,
  margin: 0,
  paddingTop: 12,
  paddingBottom: 12,
};

export const codeStyle: CSSProperties = {
  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
  fontSize: 14,
  lineHeight: 1.6,
  background: '#F2F3F5',
  padding: 12,
  borderRadius: 4,
  margin: 0,
  whiteSpace: 'pre-wrap',
  color: DOC_COLORS.text,
};

export const dividerStyle: CSSProperties = {
  height: 1,
  background: DOC_COLORS.border,
  margin: 0,
  border: 'none',
};

/** 分割线块外层间距（用 padding 替代 margin，保证可点击） */
export const dividerWrapStyle: CSSProperties = {
  padding: '16px 0',
};

export const DOC_TOOLBAR_HOVER_BG = 'rgba(0, 0, 0, 0.06)';

export const docToolbarIconBtn = (disabled?: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 28,
  height: 28,
  padding: '0 6px',
  border: 'none',
  borderRadius: 4,
  background: 'transparent',
  color: disabled ? '#C9CDD4' : DOC_COLORS.text,
  cursor: disabled ? 'default' : 'pointer',
  fontSize: 13,
  opacity: disabled ? 0.5 : 1,
});

export const docToolbarDropdownBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  height: 28,
  padding: '0 8px',
  border: 'none',
  borderRadius: 4,
  background: 'transparent',
  color: DOC_COLORS.text,
  cursor: 'pointer',
  fontSize: 13,
  whiteSpace: 'nowrap',
};

export const toolbarDivider: CSSProperties = {
  width: 1,
  height: 20,
  background: DOC_COLORS.border,
  margin: '0 4px',
  flexShrink: 0,
};

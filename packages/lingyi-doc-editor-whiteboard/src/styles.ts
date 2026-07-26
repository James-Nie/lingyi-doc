export const WB_COLORS = {
  pageBg: '#ffffff',
  canvasBg: '#ffffff',
  toolbarBg: '#ffffff',
  toolbarShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
  toolbarRadius: 12,
  activeBg: '#ededed',
  border: '#dee0e3',
  text: '#1f2329',
  muted: '#8f959e',
  accent: '#3370ff',
  selectBorder: '#3370ff',
  /** 表格未选中 hover / 选中后单元格 hover 描边 */
  tableHoverBorder: '#c2cde9',
};

export const WB_PANEL = {
  bg: '#ffffff',
  shadow: '0 8px 28px rgba(31, 35, 41, 0.12)',
  radius: 12,
  border: '1px solid #dee0e3',
};

/** 画板浮层 z-index（数值越大越靠上） */
export const WB_Z_INDEX = {
  controls: 60,
  topToolbar: 70,
  shapeLibraryPanel: 75,
  mindmapLayer: 10000,
  shapeToolbar: 10070,
  inlineEditor: 10080,
  contextMenuBackdrop: 10190,
  contextMenu: 10200,
  commentPin: 10065,
} as const;

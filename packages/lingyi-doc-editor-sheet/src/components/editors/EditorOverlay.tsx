import React from 'react';

/** 编辑器浮层容器：阻止事件冒泡到表格，并保留选区 */
export const EditorOverlay: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    data-sheet-keep-selection
    onMouseDown={e => e.stopPropagation()}
    onClick={e => e.stopPropagation()}
    style={{ width: '100%', height: '100%', minWidth: 0, overflow: 'hidden' }}
  >
    {children}
  </div>
);

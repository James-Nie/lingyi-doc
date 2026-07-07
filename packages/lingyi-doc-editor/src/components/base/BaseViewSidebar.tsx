import React from 'react';
import type { BaseView, BaseViewType } from '@lingyi-doc/core';
import { BASE_THEME } from '@lingyi-doc/core';

const VIEW_ICONS: Record<BaseViewType, { icon: React.ReactNode; label: string }> = {
  grid: {
    label: '表格',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" />
        <line x1="9" y1="3" x2="9" y2="21" />
      </svg>
    ),
  },
  form: {
    label: '表单',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" />
      </svg>
    ),
  },
  kanban: { label: '看板', icon: <span>▦</span> },
  gantt: { label: '甘特', icon: <span>📊</span> },
  calendar: { label: '日历', icon: <span>📅</span> },
  gallery: { label: '画廊', icon: <span>🖼</span> },
};

interface BaseViewSidebarProps {
  views: BaseView[];
  activeViewId?: string;
  onSelectView: (viewId: string) => void;
}

export const BaseViewSidebar: React.FC<BaseViewSidebarProps> = ({
  views, activeViewId, onSelectView,
}) => (
  <div style={{
    width: 52, flexShrink: 0, borderRight: `1px solid ${BASE_THEME.gridColor}`,
    background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '8px 0', gap: 4,
  }}>
    {views.map(view => {
      const meta = VIEW_ICONS[view.viewType] || { label: view.viewName, icon: '?' };
      const active = view.viewId === activeViewId;
      return (
        <button
          key={view.viewId}
          type="button"
          title={view.viewName || meta.label}
          onClick={() => onSelectView(view.viewId)}
          style={{
            width: 40, minHeight: 52, border: 'none', borderRadius: 8, cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
            background: active ? BASE_THEME.selectionHeaderBg : 'transparent',
            color: active ? BASE_THEME.primaryColor : BASE_THEME.secondaryTextColor,
            fontSize: 11, padding: '6px 2px',
          }}
        >
          {meta.icon}
          <span style={{ lineHeight: 1.2, maxWidth: 40, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {view.viewType === 'grid' ? '表格' : view.viewType === 'form' ? '表单' : meta.label}
          </span>
        </button>
      );
    })}
    <button
      type="button"
      title="新建视图"
      style={{
        width: 40, height: 40, border: 'none', borderRadius: 8, cursor: 'pointer',
        background: 'transparent', color: BASE_THEME.secondaryTextColor, fontSize: 20, marginTop: 4,
      }}
    >
      +
    </button>
  </div>
);

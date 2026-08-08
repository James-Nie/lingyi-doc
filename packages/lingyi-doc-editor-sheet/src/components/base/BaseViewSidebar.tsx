import React, { useMemo, useState } from 'react';
import { Dropdown, Input, Modal, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { BaseView, BaseViewType, DashboardModel } from '@lingyi-doc/core-types';
import { BASE_THEME } from '@lingyi-doc/core-sheet';

const SIDEBAR_WIDTH = 200;

const SIDEBAR_HOVER_CSS = `
  .base-view-sidebar-btn {
    transition: background 0.15s, color 0.15s;
  }
  .base-view-sidebar-btn:hover {
    background: ${BASE_THEME.rowHoverBg} !important;
  }
  .base-view-sidebar-btn:active {
    background: ${BASE_THEME.selectionHeaderBg} !important;
    color: ${BASE_THEME.primaryColor} !important;
  }
`;

const VIEW_META: Record<BaseViewType, { icon: React.ReactNode; label: string }> = {
  grid: {
    label: '表格',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <ellipse cx="12" cy="6" rx="7" ry="3" />
        <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
        <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
      </svg>
    ),
  },
  form: {
    label: '表单',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" />
      </svg>
    ),
  },
  kanban: {
    label: '看板',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="3" y="4" width="6" height="16" rx="1" />
        <rect x="11" y="4" width="6" height="10" rx="1" />
        <rect x="19" y="4" width="2" height="13" rx="1" />
      </svg>
    ),
  },
  gantt: {
    label: '甘特',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M4 6h8v3H4zM4 11h14v3H4zM4 16h10v3H4z" />
      </svg>
    ),
  },
  calendar: {
    label: '日历',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </svg>
    ),
  },
  gallery: {
    label: '画廊',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="3" y="5" width="8" height="8" rx="1" />
        <rect x="13" y="5" width="8" height="8" rx="1" />
        <rect x="3" y="15" width="8" height="6" rx="1" />
        <rect x="13" y="15" width="8" height="6" rx="1" />
      </svg>
    ),
  },
  workflow: {
    label: '工作流',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M4 7h4a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" />
        <path d="M4 16h4a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1z" />
        <path d="M14 11.5h6a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1z" />
        <path d="M9 10v4" />
        <path d="M13 10v4" />
        <path d="M11 7v10" />
        <path d="M16 14.5c0 1.5 1.5 2.5 3 2.5" />
      </svg>
    ),
  },
};

const DashboardIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z" />
    <path d="M12 3v9l6.5 6.5" />
  </svg>
);

const CREATABLE_VIEW_TYPES: BaseViewType[] = ['grid', 'kanban', 'gantt', 'calendar', 'gallery', 'form', 'workflow'];

export interface BaseViewSidebarProps {
  views: BaseView[];
  activeViewId?: string;
  onSelectView: (viewId: string) => void;
  onCreateView?: (viewType: BaseViewType) => void;
  onRenameView?: (viewId: string, name: string) => void;
  onDuplicateView?: (viewId: string) => void;
  onDeleteView?: (viewId: string) => void;
  dashboards?: DashboardModel[];
  activeDashboardId?: string | null;
  onSelectDashboard?: (dashboardId: string) => void;
  onCreateDashboard?: () => void;
  /** 打开新建菜单时拉取仪表盘列表（独立接口，打开文档不请求） */
  onPrefetchDashboards?: () => void;
  onRenameDashboard?: (dashboardId: string, name: string) => void;
  onDeleteDashboard?: (dashboardId: string) => void;
  readOnly?: boolean;
}

const iconBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  border: 'none',
  borderRadius: 6,
  background: 'transparent',
  color: BASE_THEME.headerTextColor,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  flexShrink: 0,
};

function listItemStyle(active: boolean, hovered: boolean): React.CSSProperties {
  return {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    background: active
      ? BASE_THEME.selectionHeaderBg
      : hovered
        ? BASE_THEME.rowHoverBg
        : 'transparent',
    color: active ? BASE_THEME.primaryColor : BASE_THEME.cellTextColor,
    fontSize: 13,
    lineHeight: 1.3,
    textAlign: 'left',
    minHeight: 36,
    boxSizing: 'border-box',
    transition: 'background 0.15s',
  };
}

function viewDisplayName(view: BaseView): string {
  if (view.viewName?.trim()) return view.viewName.trim();
  return VIEW_META[view.viewType]?.label || '视图';
}

export const BaseViewSidebar: React.FC<BaseViewSidebarProps> = ({
  views,
  activeViewId,
  onSelectView,
  onCreateView,
  onRenameView,
  onDuplicateView,
  onDeleteView,
  dashboards = [],
  activeDashboardId,
  onSelectDashboard,
  onCreateDashboard,
  onPrefetchDashboards,
  onRenameDashboard,
  onDeleteDashboard,
  readOnly = false,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const dashboardMode = Boolean(activeDashboardId);

  const createMenuItems: MenuProps['items'] = useMemo(() => {
    const viewItems: MenuProps['items'] = CREATABLE_VIEW_TYPES.map(type => ({
      key: type,
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '2px 0' }}>
          <span style={{ display: 'inline-flex', color: BASE_THEME.headerIconColor }}>
            {VIEW_META[type].icon}
          </span>
          <span style={{ color: BASE_THEME.cellTextColor }}>{VIEW_META[type].label}</span>
        </span>
      ),
    }));
    if (onCreateDashboard) {
      return [
        ...viewItems,
        { type: 'divider' as const },
        {
          key: 'dashboard',
          label: (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '2px 0' }}>
              <span style={{ display: 'inline-flex', color: BASE_THEME.headerIconColor }}>
                {DashboardIcon}
              </span>
              <span style={{ color: BASE_THEME.cellTextColor }}>仪表盘</span>
            </span>
          ),
        },
      ];
    }
    return viewItems;
  }, [onCreateDashboard]);

  const filteredViews = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return views;
    return views.filter(v => viewDisplayName(v).toLowerCase().includes(q));
  }, [views, query]);

  const filteredDashboards = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return dashboards;
    return dashboards.filter(d => (d.name || '仪表盘').toLowerCase().includes(q));
  }, [dashboards, query]);

  const handleCreateMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'dashboard') {
      onCreateDashboard?.();
      return;
    }
    onCreateView?.(key as BaseViewType);
  };

  const promptRename = (title: string, current: string, onOk: (name: string) => void) => {
    let next = current;
    Modal.confirm({
      title,
      icon: null,
      content: (
        <Input
          defaultValue={current}
          autoFocus
          maxLength={40}
          onChange={e => { next = e.target.value; }}
          onPressEnter={() => {
            const name = next.trim();
            if (name) onOk(name);
            Modal.destroyAll();
          }}
        />
      ),
      okText: '确定',
      cancelText: '取消',
      onOk: () => {
        const name = next.trim();
        if (!name) return Promise.reject();
        onOk(name);
      },
    });
  };

  const viewMoreItems = (view: BaseView): MenuProps['items'] => [
    {
      key: 'rename',
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <EditOutlined /> 重命名
        </span>
      ),
      disabled: !onRenameView || readOnly,
    },
    {
      key: 'duplicate',
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <CopyOutlined /> 创建副本
        </span>
      ),
      disabled: !onDuplicateView || readOnly,
    },
    { type: 'divider' },
    {
      key: 'delete',
      danger: true,
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <DeleteOutlined /> 删除视图
        </span>
      ),
      disabled: !onDeleteView || readOnly || views.length <= 1,
    },
  ];

  const dashboardMoreItems = (dash: DashboardModel): MenuProps['items'] => [
    {
      key: 'rename',
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <EditOutlined /> 重命名
        </span>
      ),
      disabled: !onRenameDashboard || readOnly,
    },
    { type: 'divider' },
    {
      key: 'delete',
      danger: true,
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <DeleteOutlined /> 删除仪表盘
        </span>
      ),
      disabled: !onDeleteDashboard || readOnly,
    },
  ];

  if (collapsed) {
    return (
      <>
        <style>{SIDEBAR_HOVER_CSS}</style>
        <div style={{
          width: 28,
          flexShrink: 0,
          borderRight: `1px solid ${BASE_THEME.gridColor}`,
          background: BASE_THEME.pageBg,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 10,
        }}>
          <Tooltip title="展开视图栏" placement="right">
            <button
              type="button"
              className="base-view-sidebar-btn"
              onClick={() => setCollapsed(false)}
              style={iconBtnStyle}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </Tooltip>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{SIDEBAR_HOVER_CSS}</style>
      <div style={{
      width: SIDEBAR_WIDTH,
      flexShrink: 0,
      borderRight: `1px solid ${BASE_THEME.gridColor}`,
      background: BASE_THEME.pageBg,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: BASE_THEME.fontFamily,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px 10px 8px',
        gap: 2,
        flexShrink: 0,
      }}>
        <span style={{
          flex: 1,
          fontSize: 14,
          fontWeight: 600,
          color: BASE_THEME.cellTextColor,
          paddingLeft: 4,
        }}>
          数据
        </span>
        <Tooltip title="搜索" placement="bottom">
          <button
            type="button"
            className="base-view-sidebar-btn"
            onClick={() => setSearchOpen(v => !v)}
            style={{
              ...iconBtnStyle,
              color: searchOpen ? BASE_THEME.primaryColor : BASE_THEME.headerTextColor,
              background: searchOpen ? BASE_THEME.selectionHeaderBg : 'transparent',
            }}
          >
            <SearchOutlined style={{ fontSize: 14 }} />
          </button>
        </Tooltip>
        {!readOnly && (onCreateView || onCreateDashboard) && (
          <Dropdown
            menu={{ items: createMenuItems, onClick: handleCreateMenuClick }}
            trigger={['click']}
            placement="bottomLeft"
            overlayStyle={{ minWidth: 160 }}
            onOpenChange={open => {
              if (open) onPrefetchDashboards?.();
            }}
          >
            <Tooltip title="新建视图1" placement="bottom">
              <button type="button" className="base-view-sidebar-btn" style={iconBtnStyle}>
                <PlusOutlined style={{ fontSize: 14 }} />
              </button>
            </Tooltip>
          </Dropdown>
        )}
        <Tooltip title="收起" placement="bottom">
          <button
            type="button"
            className="base-view-sidebar-btn"
            onClick={() => setCollapsed(true)}
            style={iconBtnStyle}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <polyline points="15 18 9 12 15 6" />
              <polyline points="21 18 15 12 21 6" />
            </svg>
          </button>
        </Tooltip>
      </div>

      {searchOpen && (
        <div style={{ padding: '0 10px 8px' }}>
          <Input
            size="small"
            allowClear
            autoFocus
            placeholder="搜索视图"
            prefix={<SearchOutlined style={{ color: BASE_THEME.secondaryTextColor }} />}
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ borderRadius: 6 }}
          />
        </div>
      )}

      {/* List */}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: '4px 8px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}>
        {filteredViews.map(view => {
          const meta = VIEW_META[view.viewType] || { label: view.viewName, icon: '?' };
          const active = !dashboardMode && view.viewId === activeViewId;
          const showMore = active || hoveredId === view.viewId;
          const name = viewDisplayName(view);
          return (
            <div
              key={view.viewId}
              onMouseEnter={() => setHoveredId(view.viewId)}
              onMouseLeave={() => setHoveredId(null)}
              style={{ position: 'relative' }}
            >
              <Tooltip title={name} placement="right">
                <button
                  type="button"
                  onClick={() => onSelectView(view.viewId)}
                  style={listItemStyle(active, hoveredId === view.viewId)}
                >
                  <span style={{ display: 'inline-flex', flexShrink: 0, opacity: active ? 1 : 0.75 }}>
                    {meta.icon}
                  </span>
                  <span style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: active ? 500 : 400,
                    paddingRight: showMore ? 22 : 0,
                  }}>
                    {name}
                  </span>
                </button>
              </Tooltip>
              {showMore && !readOnly && (
                <Dropdown
                  menu={{
                    items: viewMoreItems(view),
                    onClick: ({ key, domEvent }) => {
                      domEvent.stopPropagation();
                      if (key === 'rename') {
                        promptRename('重命名视图', name, n => onRenameView?.(view.viewId, n));
                      } else if (key === 'duplicate') {
                        onDuplicateView?.(view.viewId);
                      } else if (key === 'delete') {
                        Modal.confirm({
                          title: '删除视图',
                          content: `确定删除「${name}」？`,
                          okText: '删除',
                          okButtonProps: { danger: true },
                          cancelText: '取消',
                          onOk: () => onDeleteView?.(view.viewId),
                        });
                      }
                    },
                  }}
                  trigger={['click']}
                  placement="bottomRight"
                >
                  <Tooltip title="更多" placement="bottom">
                    <button
                      type="button"
                      className="base-view-sidebar-btn"
                      onClick={e => e.stopPropagation()}
                      style={{
                        ...iconBtnStyle,
                        position: 'absolute',
                        right: 4,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: 24,
                        height: 24,
                        color: active ? BASE_THEME.primaryColor : BASE_THEME.secondaryTextColor,
                        background: active ? 'rgba(51,112,255,0.08)' : 'transparent',
                      }}
                    >
                      <MoreOutlined />
                    </button>
                  </Tooltip>
                </Dropdown>
              )}
            </div>
          );
        })}

        {filteredDashboards.length > 0 && (
          <>
            {filteredViews.length > 0 && (
              <div style={{
                height: 1,
                background: BASE_THEME.gridColor,
                margin: '8px 4px',
                flexShrink: 0,
              }} />
            )}
            {filteredDashboards.map(dash => {
              const active = dash.id === activeDashboardId;
              const fullName = dash.name || '仪表盘';
              const showMore = active || hoveredId === dash.id;
              return (
                <div
                  key={dash.id}
                  onMouseEnter={() => setHoveredId(dash.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{ position: 'relative' }}
                >
                  <Tooltip title={fullName} placement="right">
                    <button
                      type="button"
                      onClick={() => onSelectDashboard?.(dash.id)}
                      style={listItemStyle(active, hoveredId === dash.id)}
                    >
                      <span style={{ display: 'inline-flex', flexShrink: 0, opacity: active ? 1 : 0.75 }}>
                        {DashboardIcon}
                      </span>
                      <span style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: active ? 500 : 400,
                        paddingRight: showMore ? 22 : 0,
                      }}>
                        {fullName}
                      </span>
                    </button>
                  </Tooltip>
                  {showMore && !readOnly && (
                    <Dropdown
                      menu={{
                        items: dashboardMoreItems(dash),
                        onClick: ({ key, domEvent }) => {
                          domEvent.stopPropagation();
                          if (key === 'rename') {
                            promptRename('重命名仪表盘', fullName, n => onRenameDashboard?.(dash.id, n));
                          } else if (key === 'delete') {
                            Modal.confirm({
                              title: '删除仪表盘',
                              content: `确定删除「${fullName}」？`,
                              okText: '删除',
                              okButtonProps: { danger: true },
                              cancelText: '取消',
                              onOk: () => onDeleteDashboard?.(dash.id),
                            });
                          }
                        },
                      }}
                      trigger={['click']}
                      placement="bottomRight"
                    >
                      <Tooltip title="更多" placement="bottom">
                        <button
                          type="button"
                          className="base-view-sidebar-btn"
                          onClick={e => e.stopPropagation()}
                          style={{
                            ...iconBtnStyle,
                            position: 'absolute',
                            right: 4,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: 24,
                            height: 24,
                            color: active ? BASE_THEME.primaryColor : BASE_THEME.secondaryTextColor,
                            background: active ? 'rgba(51,112,255,0.08)' : 'transparent',
                          }}
                        >
                          <MoreOutlined />
                        </button>
                      </Tooltip>
                    </Dropdown>
                  )}
                </div>
              );
            })}
          </>
        )}

        {filteredViews.length === 0 && filteredDashboards.length === 0 && (
          <div style={{
            padding: '24px 8px',
            textAlign: 'center',
            color: BASE_THEME.secondaryTextColor,
            fontSize: 12,
          }}>
            无匹配视图
          </div>
        )}
      </div>
    </div>
  </>
  );
};

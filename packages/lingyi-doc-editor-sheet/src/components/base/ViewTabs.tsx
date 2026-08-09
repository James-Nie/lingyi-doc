import React, { useCallback, useMemo, useState } from 'react';
import { Button, Dropdown, Input, Modal, Typography } from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import type { BaseViewType, BaseView } from '@lingyi-doc/core-types';

const { Text } = Typography;

const VIEW_META: Record<BaseViewType, { label: string; tabLabel: string; order: number }> = {
  grid: { label: '表格', tabLabel: '表格', order: 0 },
  kanban: { label: '看板', tabLabel: '看板', order: 1 },
  form: { label: '表单', tabLabel: '表单', order: 2 },
  calendar: { label: '日历', tabLabel: '日历', order: 3 },
  gantt: { label: '甘特', tabLabel: '甘特图', order: 4 },
  gallery: { label: '画廊', tabLabel: '画廊', order: 5 },
  workflow: { label: '工作流', tabLabel: '工作流', order: 6 },
};

/** ViewTabs 只展示共用同一数据源的视图（仅渲染形式不同） */
const TAB_VIEW_TYPES: Set<BaseViewType> = new Set(['grid', 'kanban', 'form', 'calendar', 'gantt', 'gallery']);

const TAB_CREATE_ITEMS: MenuProps['items'] = (
  ['grid', 'kanban', 'form', 'calendar', 'gantt', 'gallery'] as BaseViewType[]
).map(type => ({
  key: type,
  label: VIEW_META[type]?.tabLabel || type,
}));

export interface ViewTabsProps {
  views: BaseView[];
  activeViewId?: string;
  onSelectView: (viewId: string) => void;
  onCreateView?: (viewType: BaseViewType) => void;
  onRenameView?: (viewId: string, name: string) => void;
  onDuplicateView?: (viewId: string) => void;
  onDeleteView?: (viewId: string) => void;
  readOnly?: boolean;
}

export const ViewTabs: React.FC<ViewTabsProps> = ({
  views,
  activeViewId,
  onSelectView,
  onCreateView,
  onRenameView,
  onDuplicateView,
  onDeleteView,
  readOnly,
}) => {
  const [addOpen, setAddOpen] = useState(false);
  const [moreOpenId, setMoreOpenId] = useState<string | null>(null);

  const sortedViews = useMemo(
    () =>
      views
        .filter(v => TAB_VIEW_TYPES.has(v.viewType))
        .sort((a, b) => {
          const oa = VIEW_META[a.viewType]?.order ?? 99;
          const ob = VIEW_META[b.viewType]?.order ?? 99;
          return oa - ob;
        }),
    [views],
  );

  const handleCreateMenu: MenuProps['onClick'] = useCallback(
    ({ key }: { key: string }) => {
      setAddOpen(false);
      onCreateView?.(key as BaseViewType);
    },
    [onCreateView],
  );

  const getViewMoreItems = useCallback(
    (view: BaseView, viewName: string): MenuProps['items'] => {
      const items: MenuProps['items'] = [];
      if (onRenameView) {
        items.push({
          key: 'rename',
          label: (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <EditOutlined /> 重命名
            </span>
          ),
        });
      }
      if (onDuplicateView) {
        items.push({
          key: 'duplicate',
          label: (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <CopyOutlined /> 创建副本
            </span>
          ),
        });
      }
      if (onDeleteView && views.length > 1) {
        if (items.length > 0) items.push({ type: 'divider' });
        items.push({
          key: 'delete',
          danger: true,
          label: (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <DeleteOutlined /> 删除视图
            </span>
          ),
        });
      }
      return items;
    },
    [onRenameView, onDuplicateView, onDeleteView, views.length],
  );

  const handleMoreMenuClick = useCallback(
    (view: BaseView, viewName: string, info: { key: string }) => {
      setMoreOpenId(null);
      if (info.key === 'rename') {
        let next = viewName;
        Modal.confirm({
          title: '重命名视图',
          icon: null,
          content: (
            <Input
              defaultValue={viewName}
              autoFocus
              maxLength={40}
              onChange={e => { next = e.target.value; }}
              onPressEnter={() => {
                const name = next.trim();
                if (name) onRenameView?.(view.viewId, name);
                Modal.destroyAll();
              }}
            />
          ),
          okText: '确定',
          cancelText: '取消',
          onOk: () => {
            const name = next.trim();
            if (!name) return Promise.reject();
            onRenameView?.(view.viewId, name);
          },
        });
      } else if (info.key === 'duplicate') {
        onDuplicateView?.(view.viewId);
      } else if (info.key === 'delete') {
        Modal.confirm({
          title: '删除视图',
          content: `确定删除「${viewName}」？`,
          okText: '删除',
          okButtonProps: { danger: true },
          cancelText: '取消',
          onOk: () => onDeleteView?.(view.viewId),
        });
      }
    },
    [onRenameView, onDuplicateView, onDeleteView],
  );

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 36,
        minHeight: 36,
        background: '#fff',
        borderBottom: '1px solid #e8e8e8',
        padding: '0 8px',
        gap: 0,
        userSelect: 'none',
      }}
    >
      {sortedViews.map(view => {
        const meta = VIEW_META[view.viewType] || VIEW_META.grid;
        const isActive = view.viewId === activeViewId;

        return (
          <div
            key={view.viewId}
            onClick={() => onSelectView(view.viewId)}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              height: 34,
              padding: '0 14px',
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? '#1a73e8' : '#555',
              background: 'transparent',
              borderRadius: '4px 4px 0 0',
              cursor: 'pointer',
              gap: 4,
              transition: 'all 0.15s',
              borderBottom: isActive ? '2px solid #1a73e8' : '2px solid transparent',
              marginBottom: isActive ? -1 : 0,
            }}
            onMouseEnter={e => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.background = '#f5f5f5';
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
              }
            }}
            title={view.viewName || meta.tabLabel}
          >
            <Text
              style={{
                fontSize: 13,
                color: isActive ? '#1a73e8' : '#555',
                fontWeight: isActive ? 600 : 400,
                whiteSpace: 'nowrap',
              }}
            >
              {view.viewName || meta.tabLabel}
            </Text>

            {isActive && !readOnly && onRenameView && (
              <Dropdown
                menu={{
                  items: getViewMoreItems(view, view.viewName || meta.tabLabel),
                  onClick: (info) => handleMoreMenuClick(view, view.viewName || meta.tabLabel, info as { key: string }),
                }}
                trigger={['click']}
                placement="bottom"
                open={moreOpenId === view.viewId}
                onOpenChange={(open) => setMoreOpenId(open ? view.viewId : null)}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<MoreOutlined style={{ fontSize: 12 }} />}
                  onClick={e => e.stopPropagation()}
                  style={{
                    minWidth: 20,
                    height: 20,
                    padding: 0,
                    color: '#1a73e8',
                    opacity: 0.7,
                    marginLeft: 2,
                  }}
                />
              </Dropdown>
            )}
          </div>
        );
      })}

      {!readOnly && onCreateView && (
        <Dropdown
          menu={{ items: TAB_CREATE_ITEMS, onClick: handleCreateMenu }}
          open={addOpen}
          onOpenChange={setAddOpen}
          trigger={['click']}
          placement="bottomRight"
        >
          <Button
            type="text"
            size="small"
            icon={<PlusOutlined />}
            style={{ fontSize: 14, color: '#888' }}
            title="新建视图"
          />
        </Dropdown>
      )}
    </div>
  );
};

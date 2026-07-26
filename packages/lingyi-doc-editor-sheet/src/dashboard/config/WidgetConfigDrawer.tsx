import React, { useEffect, useState } from 'react';
import { Tabs, Button } from 'antd';
import { SettingOutlined, CloseOutlined } from '@ant-design/icons';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import type { DashboardWidget } from '@lingyi-doc/core-types';
import { isBaseSheet } from '@lingyi-doc/core-types';
import {
  resolveWidgetConfigPanel,
  type WidgetConfigTabKey,
} from './panelRegistry';
import './builtinPanels';
import '../dashboard-config-panel.css';

export const WIDGET_CONFIG_SIDEBAR_WIDTH = 360;

interface WidgetConfigSidebarProps {
  widget: DashboardWidget | null;
  table: FreeTable;
  readOnly?: boolean;
  onClose: () => void;
  onChange: (patch: Partial<DashboardWidget>) => void;
}

/**
 * 右侧属性面板：选中组件后常驻展示，布局与画布并排（非浮层 Drawer）。
 */
export const WidgetConfigSidebar: React.FC<WidgetConfigSidebarProps> = ({
  widget,
  table,
  readOnly,
  onClose,
  onChange,
}) => {
  const descriptor = widget ? resolveWidgetConfigPanel(widget.componentType) : null;
  const [activeTab, setActiveTab] = useState<WidgetConfigTabKey>('basic');

  useEffect(() => {
    setActiveTab('basic');
  }, [widget?.id]);

  if (!widget) return null;

  const title = descriptor?.getTitle(widget) || '组件配置';
  const columnDefs = isBaseSheet(table.sheet) ? table.sheet.columnDefs : [];
  const ctx = {
    widget,
    table,
    columnDefs,
    sheetName: table.name || '数据表',
    readOnly,
    onChange,
  };
  const tabs = descriptor?.tabs || [{ key: 'basic' as const, label: '基础配置' }];

  return (
    <aside
      className="dashboard-widget-config-sidebar"
      onMouseDown={e => e.stopPropagation()}
      style={{
        width: WIDGET_CONFIG_SIDEBAR_WIDTH,
        flexShrink: 0,
        alignSelf: 'stretch',
        height: '100%',
        maxHeight: '100%',
        minHeight: 0,
        background: '#fff',
        borderLeft: '1px solid #f0f0f0',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 16px 10px',
        borderBottom: '1px solid #f0f0f0',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 15 }}>
          <SettingOutlined />
          {title}
        </div>
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} />
      </div>

      <div className="dashboard-widget-config-body">
        {descriptor ? (
          <Tabs
            className="dashboard-widget-config-tabs"
            activeKey={activeTab}
            onChange={k => setActiveTab(k as WidgetConfigTabKey)}
            items={tabs.map(t => ({
              key: t.key,
              label: t.label,
              children: (
                <div className="dashboard-widget-config-scroll">
                  {descriptor.renderTab(t.key, ctx)}
                </div>
              ),
            }))}
          />
        ) : (
          <div style={{ color: '#8c8c8c', padding: 24, textAlign: 'center' }}>
            该组件暂无配置面板，可通过 registerWidgetConfigPanel 扩展
          </div>
        )}
      </div>
    </aside>
  );
};

/** @deprecated 使用 WidgetConfigSidebar */
export const WidgetConfigDrawer = WidgetConfigSidebar;

export { registerWidgetConfigPanel, resolveWidgetConfigPanel, listRegisteredWidgetConfigPanels } from './panelRegistry';
export type { WidgetConfigPanelDescriptor, WidgetConfigPanelContext, WidgetConfigTabKey } from './panelRegistry';

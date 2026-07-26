import type { ReactNode } from 'react';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import type { ColumnDef, DashboardWidget, DashboardWidgetType } from '@lingyi-doc/core-types';

export type WidgetConfigTabKey = 'basic' | 'custom' | 'analysis';

export interface WidgetConfigPanelContext {
  widget: DashboardWidget;
  table: FreeTable;
  columnDefs: ColumnDef[];
  sheetName: string;
  readOnly?: boolean;
  onChange: (patch: Partial<DashboardWidget>) => void;
}

export interface WidgetConfigPanelDescriptor {
  /** 唯一 id，用于注册中心 */
  id: string;
  /** 匹配的组件类型 */
  match: (type: DashboardWidgetType) => boolean;
  /** 面板标题，如「指标卡」「饼图」 */
  getTitle: (widget: DashboardWidget) => string;
  /** 可用 Tab；默认基础 + 自定义 */
  tabs: Array<{ key: WidgetConfigTabKey; label: string }>;
  /** 各 Tab 渲染；未提供的 Tab 显示占位 */
  renderTab: (tab: WidgetConfigTabKey, ctx: WidgetConfigPanelContext) => ReactNode;
}

const registry: WidgetConfigPanelDescriptor[] = [];

export function registerWidgetConfigPanel(descriptor: WidgetConfigPanelDescriptor): void {
  const idx = registry.findIndex(d => d.id === descriptor.id);
  if (idx >= 0) registry[idx] = descriptor;
  else registry.push(descriptor);
}

export function resolveWidgetConfigPanel(
  type: DashboardWidgetType,
): WidgetConfigPanelDescriptor | null {
  return registry.find(d => d.match(type)) ?? null;
}

export function listRegisteredWidgetConfigPanels(): WidgetConfigPanelDescriptor[] {
  return [...registry];
}

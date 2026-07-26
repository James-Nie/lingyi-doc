import React, { useCallback, useMemo, useState } from 'react';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import type { BaseView, DashboardGridViewConfig, FilterCondition, GroupRule, SortRule } from '@lingyi-doc/core-types';
import { isBaseSheet } from '@lingyi-doc/core-types';
import { SheetContainer } from '../../components/SheetContainer';
import { BaseToolbar } from '../../components/Toolbar/BaseToolbar';
import {
  ensureActiveBaseView,
  updateBaseViewFilter,
  updateBaseViewFilterConjunction,
  updateBaseViewGroupRules,
  updateBaseViewSort,
} from '../../components/base/formViewUtils';

interface DashboardGridWidgetProps {
  table: FreeTable;
  config: DashboardGridViewConfig;
  readOnly?: boolean;
  /** 外部数据变更时强制刷新布局（如表行增删） */
  dataVersion?: number;
}

function resolveBoundView(table: FreeTable, viewId?: string): BaseView | null {
  if (!isBaseSheet(table.sheet)) return null;
  const sheet = table.sheet;
  if (viewId) {
    const found = sheet.views?.find(v => v.viewId === viewId);
    if (found) return found;
  }
  const grid = sheet.views?.find(v => v.viewType === 'grid');
  if (grid) return grid;
  return ensureActiveBaseView(sheet);
}

/** 仪表盘表格组件：嵌入只读多维表网格 + 轻量工具栏 */
export const DashboardGridWidget: React.FC<DashboardGridWidgetProps> = ({
  table,
  config,
  readOnly,
  dataVersion = 0,
}) => {
  const [layoutTick, setLayoutTick] = useState(0);

  const boundView = useMemo(
    () => resolveBoundView(table, config.viewId),
    [table, config.viewId, layoutTick, dataVersion],
  );

  const bump = useCallback(() => {
    table.notifyChange(null);
    setLayoutTick(t => t + 1);
  }, [table]);

  const filterConditions = boundView?.filter ?? [];
  const filterConjunction = boundView?.filterConjunction ?? 'and';
  const groupRules = boundView?.group ?? [];
  const sortRules = boundView?.sort ?? [];

  const recordCount = isBaseSheet(table.sheet) ? (table.sheet.rows?.length ?? 0) : 0;

  const onFilterChange = useCallback((conditions: FilterCondition[]) => {
    if (readOnly || !boundView) return;
    updateBaseViewFilter(boundView, conditions);
    bump();
  }, [readOnly, boundView, bump]);

  const onFilterConjunctionChange = useCallback((conjunction: 'and' | 'or') => {
    if (readOnly || !boundView) return;
    updateBaseViewFilterConjunction(boundView, conjunction);
    bump();
  }, [readOnly, boundView, bump]);

  const onGroupRulesChange = useCallback((rules: GroupRule[]) => {
    if (readOnly || !boundView) return;
    updateBaseViewGroupRules(boundView, rules);
    bump();
  }, [readOnly, boundView, bump]);

  const onSortChange = useCallback((rules: SortRule[]) => {
    if (readOnly || !boundView) return;
    updateBaseViewSort(boundView, rules);
    bump();
  }, [readOnly, boundView, bump]);

  if (!isBaseSheet(table.sheet)) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#bfbfbf', fontSize: 13 }}>
        当前不是多维表，无法展示表格视图
      </div>
    );
  }

  const showToolbar = config.showToolbar !== false;

  return (
    <div
      className="dashboard-grid-widget"
      style={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: config.background || '#fff',
        borderRadius: 4,
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      {showToolbar && (
        <BaseToolbar
          mode="embed"
          table={table}
          recordCount={recordCount}
          filterConditions={filterConditions}
          onFilterChange={readOnly ? undefined : onFilterChange}
          filterConjunction={filterConjunction}
          onFilterConjunctionChange={readOnly ? undefined : onFilterConjunctionChange}
          groupRules={groupRules}
          onGroupRulesChange={readOnly ? undefined : onGroupRulesChange}
          sortRules={sortRules}
          onSortChange={readOnly ? undefined : onSortChange}
        />
      )}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        <SheetContainer
          key={`${boundView?.viewId || 'default'}-${layoutTick}`}
          table={table}
          previewMode
          embedMode
          viewIdOverride={boundView?.viewId}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
};

import React, { useCallback, useEffect, useState } from 'react';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import type { DashboardModel, DashboardWidgetType, FilterCondition, ColumnDef } from '@lingyi-doc/core-types';
import { createDefaultDashboard } from '@lingyi-doc/core-sheet';
import { isBaseSheet } from '@lingyi-doc/core-types';
import { DashboardToolbar } from './DashboardToolbar';
import { DashboardCanvas } from './DashboardCanvas';
import { AddComponentPanel } from './components/AddComponentPanel';
import { createWidgetByType } from './createWidget';

export interface DashboardEditorProps {
  dashboard: DashboardModel;
  table: FreeTable;
  readOnly?: boolean;
  onChange: (dashboard: DashboardModel) => void;
}

export const DashboardEditor: React.FC<DashboardEditorProps> = ({
  dashboard,
  table,
  readOnly,
  onChange,
}) => {
  const [addOpen, setAddOpen] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [globalFilters, setGlobalFilters] = useState<FilterCondition[] | undefined>(
    dashboard.globalFilters,
  );

  useEffect(() => {
    setGlobalFilters(dashboard.globalFilters);
  }, [dashboard.id, dashboard.globalFilters]);

  useEffect(() => {
    return table.onChange(() => {
      setDataVersion(v => v + 1);
    });
  }, [table]);

  const handleDashboardChange = useCallback((next: DashboardModel) => {
    onChange({
      ...next,
      globalFilters,
      updatedAt: Date.now(),
    });
  }, [onChange, globalFilters]);

  const handleAdd = useCallback((type: DashboardWidgetType) => {
    if (!isBaseSheet(table.sheet)) return;
    const widget = createWidgetByType(
      type,
      table.sheetId,
      table.sheet.columnDefs,
      dashboard.widgets,
      {
        views: table.sheet.views,
        activeViewId: table.sheet.activeViewId,
      },
    );
    handleDashboardChange({
      ...dashboard,
      widgets: [...dashboard.widgets, widget],
    });
  }, [table, dashboard, handleDashboardChange]);

  const handleGlobalFiltersChange = useCallback((filters: FilterCondition[]) => {
    setGlobalFilters(filters);
    onChange({
      ...dashboard,
      globalFilters: filters,
      updatedAt: Date.now(),
    });
  }, [dashboard, onChange]);

  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      background: '#fff',
      height: '100%',
      overflow: 'hidden',
    }}>
      <DashboardToolbar
        readOnly={readOnly}
        onAddChart={() => setAddOpen(true)}
        statsHint={
          globalFilters?.length
            ? `已应用 ${globalFilters.length} 个筛选条件`
            : '基于全部数据统计'
        }
      />
      <AddComponentPanel
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={handleAdd}
      />
      <DashboardCanvas
        dashboard={dashboard}
        table={table}
        readOnly={readOnly}
        dataVersion={dataVersion}
        globalFilters={globalFilters}
        onChange={handleDashboardChange}
        onGlobalFiltersChange={handleGlobalFiltersChange}
      />
    </div>
  );
};

export function ensureDashboardForSheet(
  existing: DashboardModel[],
  sheetId: string,
  columnDefs: ColumnDef[],
): { dashboards: DashboardModel[]; activeId: string } {
  const current = existing.find(d => d.sourceSheetId === sheetId) || existing[0];
  if (current) {
    return { dashboards: existing, activeId: current.id };
  }
  const created = createDefaultDashboard(sheetId, columnDefs, '数据仪表盘');
  return { dashboards: [...existing, created], activeId: created.id };
}

import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import { message } from 'antd';
import type { Workbook, DashboardModel } from '@lingyi-doc/core';
import { createDefaultDashboard, createEmptyDashboard, DashboardApi, isBaseSheet } from '@lingyi-doc/core';
import { useSheetStore } from '@lingyi-doc/editor-pro';

export interface DashboardControllerOptions {
  docId?: string;
  workbookRef: MutableRefObject<Workbook | undefined>;
}

export function useDashboardController(options: DashboardControllerOptions) {
  const { docId, workbookRef } = options;

  const [activeDashboardId, setActiveDashboardId] = useState<string | null>(null);
  const [dashboardRevision, setDashboardRevision] = useState(0);
  const dashboardSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 仪表盘列表是否已从独立接口拉取（打开文档不请求，切换/创建时再拉） */
  const dashboardsHydratedRef = useRef(false);
  const dashboardsHydratingRef = useRef<Promise<void> | null>(null);

  const ensureDashboardsLoaded = useCallback(async (wb: Workbook, id: string) => {
    if (dashboardsHydratedRef.current) return;
    if (dashboardsHydratingRef.current) {
      await dashboardsHydratingRef.current;
      return;
    }
    const task = (async () => {
      try {
        const result = await DashboardApi.loadForDocument(
          id,
          wb.dashboards,
          null,
        );
        wb.setDashboards(result.dashboards);
        setDashboardRevision(v => v + 1);
      } catch {
        // 独立表不可用时保留 Workbook 内嵌 stub，仍标记已尝试，避免重复打接口
      } finally {
        dashboardsHydratedRef.current = true;
      }
    })();
    dashboardsHydratingRef.current = task;
    try {
      await task;
    } finally {
      if (dashboardsHydratingRef.current === task) {
        dashboardsHydratingRef.current = null;
      }
    }
  }, []);

  const resetDashboardSession = useCallback((wb?: Workbook | null) => {
    dashboardsHydratedRef.current = false;
    dashboardsHydratingRef.current = null;
    wb?.switchDashboard(undefined);
    setActiveDashboardId(null);
  }, []);

  const handleRenameDashboard = useCallback(async (dashboardId: string, name: string) => {
    const wb = workbookRef.current;
    if (!wb || !docId) return;
    try {
      await ensureDashboardsLoaded(wb, docId);
      const dash = wb.getDashboard(dashboardId);
      if (!dash) return;
      wb.updateDashboard(dashboardId, { ...dash, name });
      setDashboardRevision(v => v + 1);
      await DashboardApi.update(docId, dashboardId, {
        name,
        sourceSheetId: dash.sourceSheetId,
        layout: dash.layout,
        widgets: dash.widgets,
        globalFilters: dash.globalFilters,
        version: dash.version ?? 1,
      });
    } catch {
      message.warning('重命名仪表盘失败');
    }
  }, [docId, ensureDashboardsLoaded]);

  const handleDeleteDashboard = useCallback(async (dashboardId: string) => {
    const wb = workbookRef.current;
    if (!wb || !docId) return;
    try {
      await ensureDashboardsLoaded(wb, docId);
      await DashboardApi.remove(docId, dashboardId);
      wb.removeDashboard(dashboardId);
      if (activeDashboardId === dashboardId) {
        setActiveDashboardId(null);
        wb.switchDashboard(undefined);
      }
      setDashboardRevision(v => v + 1);
      useSheetStore.getState().setStatusText('已删除仪表盘');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '删除仪表盘失败');
    }
  }, [docId, activeDashboardId, ensureDashboardsLoaded]);

  const handlePrefetchDashboards = useCallback(() => {
    const wb = workbookRef.current;
    if (!wb || !docId) return;
    void ensureDashboardsLoaded(wb, docId);
  }, [docId, ensureDashboardsLoaded]);

  const handleSelectDashboard = useCallback(async (dashboardId: string) => {
    const wb = workbookRef.current;
    if (!wb || !docId) return;
    try {
      // 打开文档不拉仪表盘；切换时再请求独立接口
      await ensureDashboardsLoaded(wb, docId);
      const detail = await DashboardApi.get(docId, dashboardId);
      wb.replaceDashboard(detail);
      wb.switchDashboard(dashboardId);
      setActiveDashboardId(dashboardId);
      setDashboardRevision(v => v + 1);
    } catch (err) {
      message.warning(err instanceof Error ? err.message : '加载仪表盘失败');
    }
  }, [docId, ensureDashboardsLoaded]);

  const handleCreateDashboard = useCallback(async () => {
    const wb = workbookRef.current;
    const activeTable = wb?.activeSheet ?? null;
    if (!wb || !docId || !activeTable || !isBaseSheet(activeTable.sheet)) return;
    try {
      await ensureDashboardsLoaded(wb, docId);
      const draft = wb.dashboards.length === 0
        ? createDefaultDashboard(activeTable.sheetId, activeTable.sheet.columnDefs, '数据仪表盘')
        : createEmptyDashboard(activeTable.sheetId, `仪表盘 ${wb.dashboards.length + 1}`);
      const saved = await DashboardApi.create(docId, {
        id: draft.id,
        name: draft.name,
        sourceSheetId: draft.sourceSheetId,
        layout: draft.layout,
        widgets: draft.widgets,
        globalFilters: draft.globalFilters,
        setActive: false,
      });
      wb.addDashboard(saved);
      wb.switchDashboard(saved.id);
      setActiveDashboardId(saved.id);
      setDashboardRevision(v => v + 1);
      useSheetStore.getState().setStatusText('已创建仪表盘');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '创建仪表盘失败');
    }
  }, [docId, ensureDashboardsLoaded]);

  const handleDashboardChange = useCallback((dashboard: DashboardModel) => {
    const wb = workbookRef.current;
    if (!wb || !docId) return;
    const baseVersion = wb.getDashboard(dashboard.id)?.version ?? dashboard.version ?? 1;
    wb.updateDashboard(dashboard.id, dashboard);
    setDashboardRevision(v => v + 1);
    if (dashboardSaveTimerRef.current) clearTimeout(dashboardSaveTimerRef.current);
    dashboardSaveTimerRef.current = setTimeout(() => {
      const latest = workbookRef.current?.getDashboard(dashboard.id) ?? dashboard;
      void DashboardApi.update(docId, latest.id, {
        name: latest.name,
        sourceSheetId: latest.sourceSheetId,
        layout: latest.layout,
        widgets: latest.widgets,
        globalFilters: latest.globalFilters,
        version: baseVersion,
      }).then((saved) => {
        workbookRef.current?.replaceDashboard(saved);
        setDashboardRevision(v => v + 1);
      }).catch((err) => {
        message.warning(err instanceof Error ? err.message : '仪表盘保存失败');
      });
    }, 600);
  }, [docId]);

  return {
    activeDashboardId,
    setActiveDashboardId,
    dashboardRevision,
    setDashboardRevision,
    ensureDashboardsLoaded,
    resetDashboardSession,
    handleRenameDashboard,
    handleDeleteDashboard,
    handlePrefetchDashboards,
    handleSelectDashboard,
    handleCreateDashboard,
    handleDashboardChange,
  };
}

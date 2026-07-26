import type { DashboardModel } from '@lingyi-doc/core-types';
import { DocumentManager } from './DocumentManager';

export interface DashboardListResult {
  dashboards: DashboardModel[];
  activeDashboardId: string | null;
}

/**
 * Base 仪表盘独立 API（持久化在 base_dashboards，不写入 Workbook JSON）。
 * 打开文档不请求；切换 / 创建仪表盘时再调用。
 * 认证与 apiBase 复用 DocumentManager.configureDocumentManager。
 */
export class DashboardApi {
  static list(docId: string): Promise<DashboardListResult> {
    return DocumentManager.requestJson<DashboardListResult>(`/docs/${docId}/dashboards`);
  }

  static get(docId: string, dashboardId: string): Promise<DashboardModel> {
    return DocumentManager.requestJson<DashboardModel>(`/docs/${docId}/dashboards/${dashboardId}`);
  }

  static create(
    docId: string,
    body: {
      id?: string;
      name?: string;
      sourceSheetId: string;
      layout?: DashboardModel['layout'];
      widgets?: DashboardModel['widgets'];
      globalFilters?: DashboardModel['globalFilters'];
      setActive?: boolean;
    },
  ): Promise<DashboardModel> {
    return DocumentManager.requestJson<DashboardModel>(`/docs/${docId}/dashboards`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  static update(
    docId: string,
    dashboardId: string,
    body: Partial<Pick<DashboardModel, 'name' | 'sourceSheetId' | 'layout' | 'widgets' | 'globalFilters' | 'version'>>,
  ): Promise<DashboardModel> {
    return DocumentManager.requestJson<DashboardModel>(`/docs/${docId}/dashboards/${dashboardId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  static remove(docId: string, dashboardId: string): Promise<{ ok: true }> {
    return DocumentManager.requestJson<{ ok: true }>(`/docs/${docId}/dashboards/${dashboardId}`, {
      method: 'DELETE',
    });
  }

  static setActive(docId: string, activeDashboardId: string | null): Promise<{ activeDashboardId: string | null }> {
    return DocumentManager.requestJson<{ activeDashboardId: string | null }>(`/docs/${docId}/dashboards/active`, {
      method: 'PATCH',
      body: JSON.stringify({ activeDashboardId }),
    });
  }

  /** 将 Workbook 内嵌仪表盘导入独立表（库中已有则默认跳过） */
  static importFromWorkbook(
    docId: string,
    body: {
      dashboards: DashboardModel[];
      activeDashboardId?: string | null;
      overwrite?: boolean;
    },
  ): Promise<DashboardListResult> {
    return DocumentManager.requestJson<DashboardListResult>(`/docs/${docId}/dashboards/import`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * 加载文档仪表盘：优先独立表；若为空且 workbook 有内嵌数据则自动导入一次。
   */
  static async loadForDocument(
    docId: string,
    workbookDashboards: DashboardModel[],
    workbookActiveId?: string | null,
  ): Promise<DashboardListResult> {
    let result = await DashboardApi.list(docId);
    if (result.dashboards.length === 0 && workbookDashboards.length > 0) {
      result = await DashboardApi.importFromWorkbook(docId, {
        dashboards: workbookDashboards,
        activeDashboardId: workbookActiveId ?? null,
      });
    }
    return result;
  }
}

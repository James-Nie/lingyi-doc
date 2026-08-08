export interface DashboardLayoutDto {
  columns: number;
  rowHeight: number;
  gap: number;
}

export interface DashboardWidgetDto {
  id: string;
  componentType: string;
  layout: { x: number; y: number; w: number; h: number };
  title?: string;
  config: Record<string, unknown>;
  dataBinding?: {
    query: Record<string, unknown>;
    listenGlobalFilters?: boolean;
  };
}

export interface DashboardModelDto {
  id: string;
  name: string;
  sourceSheetId: string;
  layout: DashboardLayoutDto;
  widgets: DashboardWidgetDto[];
  globalFilters?: unknown[];
  version: number;
  createdAt: number;
  updatedAt: number;
  sortOrder?: number;
}

export interface DashboardListResponseDto {
  dashboards: DashboardModelDto[];
  activeDashboardId: string | null;
}

export interface CreateDashboardBody {
  id?: string;
  name?: string;
  sourceSheetId: string;
  layout?: Partial<DashboardLayoutDto>;
  widgets?: DashboardWidgetDto[];
  globalFilters?: unknown[];
  setActive?: boolean;
}

export interface UpdateDashboardBody {
  name?: string;
  sourceSheetId?: string;
  layout?: Partial<DashboardLayoutDto>;
  widgets?: DashboardWidgetDto[];
  globalFilters?: unknown[] | null;
  version?: number;
  sortOrder?: number;
}

export interface SetActiveDashboardBody {
  activeDashboardId: string | null;
}

export interface ImportFromWorkbookBody {
  dashboards?: DashboardModelDto[];
  activeDashboardId?: string | null;
  /** 若库中已有数据时是否覆盖（默认 false：已有则跳过导入） */
  overwrite?: boolean;
}

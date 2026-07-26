/**
 * HTTP / 产品 API 客户端（从引擎域剥离的入口）。
 * 后续可独立为 @lingyi-doc/core-client 包；当前仍由 @lingyi-doc/core 门面 re-export。
 */
export {
  DocumentManager,
  configureDocumentManager,
  type DocumentListItem,
  type RecycleBinItem,
  type DocumentApiResponse,
  type DocumentPermission,
  type UploadedFileInfo,
} from './DocumentManager';
export { DashboardApi, type DashboardListResult } from './DashboardApi';

import type { RecordHistoryPayloadEntry } from '@lingyi-doc/core-types';

export interface RecordHistoryPageResult {
  items: RecordHistoryPayloadEntry[];
  total: number;
  hasMore: boolean;
}

export type RecordHistoryFetcher = (
  recordId: string,
  page: number,
  pageSize: number,
) => Promise<RecordHistoryPageResult>;

let activeFetcher: RecordHistoryFetcher | null = null;

/**
 * 注册多维表行级变更历史的接口拉取函数（由宿主应用按当前 docId 配置）。
 * 详情抽屉「历史」页仅在该 fetcher 存在时走接口分页；否则回退内存 _history。
 */
export function configureRecordHistoryApi(fetcher: RecordHistoryFetcher | null): void {
  activeFetcher = fetcher;
}

export function getRecordHistoryFetcher(): RecordHistoryFetcher | null {
  return activeFetcher;
}

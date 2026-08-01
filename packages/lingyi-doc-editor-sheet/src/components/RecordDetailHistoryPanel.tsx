import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Flex, Space, Spin } from 'antd';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import type { RecordRow } from '@lingyi-doc/core-types';
import type { RecordHistoryPayloadEntry } from '@lingyi-doc/core-types';
import { buildRecordHistoryDisplayRows, buildRecordHistoryDisplayRowsFromEntries } from '@lingyi-doc/core-sheet';
import { isBaseSheet } from '@lingyi-doc/core-types';
import { getRecordHistoryFetcher } from '../utils/recordHistoryApi';

const PAGE_SIZE = 50;

const FIELD_ICONS: Record<string, string> = {
  text: 'A≡', number: '123', select: '◉', multiSelect: '☑', date: '📅',
  datetime: '📅', boolean: '☑', user: '👤', attachment: '📎', link: '🔗',
  rating: '⚡', progress: '▓', email: '@', phone: '📞', currency: '¥', percent: '%',
  formula: 'ƒ', autoNumber: '#',
};

function getAvatarText(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.slice(0, 1).toUpperCase();
}

function HistoryValueTag({ tag }: { tag: { label: string; color: string } }) {
  return (
    <span style={{
      padding: '0 8px',
      borderRadius: 12,
      background: `${tag.color}22`,
      color: tag.color,
      fontSize: 12,
      lineHeight: '22px',
    }}>
      {tag.label}
    </span>
  );
}

interface RecordDetailHistoryPanelProps {
  table: FreeTable;
  record: RecordRow | undefined;
  revision?: number;
  style?: React.CSSProperties;
}

/** 详情抽屉：行变更历史列表（优先接口分页拉取，兼容未配置接口时回退内存 _history） */
export const RecordDetailHistoryPanel: React.FC<RecordDetailHistoryPanelProps> = ({
  table,
  record,
  revision = 0,
  style,
}) => {
  const fetcher = getRecordHistoryFetcher();
  const columnDefs = useMemo(() => {
    const sheet = table.sheet;
    return isBaseSheet(sheet) ? sheet.columnDefs : [];
  }, [table.sheet]);

  const recordId = record?._id;
  const [serverItems, setServerItems] = useState<RecordHistoryPayloadEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadPage = useCallback(async (targetPage: number) => {
    if (!fetcher || !recordId) return;
    setLoading(true);
    setFetchError(null);
    try {
      const result = await fetcher(recordId, targetPage, PAGE_SIZE);
      if (!mountedRef.current) return;
      setServerItems(prev => (targetPage === 1 ? result.items : [...prev, ...result.items]));
      setTotal(result.total);
      setPage(targetPage);
      setHasMore(result.hasMore);
    } catch {
      if (!mountedRef.current) return;
      setFetchError('历史记录加载失败');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [fetcher, recordId]);

  useEffect(() => {
    setServerItems([]);
    setTotal(0);
    setPage(1);
    setHasMore(false);
    if (fetcher && recordId) {
      void loadPage(1);
    }
  }, [fetcher, recordId, revision, loadPage]);

  // 接口分页模式：合并尚未落库的内存历史（当前会话刚编辑、保存尚未完成的部分）
  const historyRows = useMemo(() => {
    if (fetcher) {
      const fetchedIds = new Set(serverItems.map(e => e.id));
      const pendingEntries = (record?._history ?? [])
        .filter(e => !fetchedIds.has(e.id));
      return buildRecordHistoryDisplayRowsFromEntries(
        [...serverItems, ...pendingEntries],
        columnDefs,
      );
    }
    return buildRecordHistoryDisplayRows(record, columnDefs);
  }, [fetcher, serverItems, record, columnDefs]);

  if (!record) return null;

  return (
    <div style={style}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '72px 88px 72px 1fr',
        gap: 8,
        padding: '12px 0',
        fontSize: 12,
        color: '#8f959e',
        borderBottom: '1px solid #f0f0f0',
      }}>
        <span>时间</span>
        <span>操作人</span>
        <span>字段</span>
        <span>变更前 → 变更后</span>
      </div>
      {fetchError ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#e34d59', fontSize: 13 }}>
          {fetchError}
        </div>
      ) : loading && historyRows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#8f959e' }}>
          <Spin size="small" />
        </div>
      ) : historyRows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#8f959e', fontSize: 13 }}>
          暂无历史记录
        </div>
      ) : (
        <>
          {historyRows.map(row => (
            <div
              key={row.key}
              style={{
                display: 'grid',
                gridTemplateColumns: '72px 88px 72px 1fr',
                gap: 8,
                padding: '14px 0',
                borderBottom: '1px solid #f5f6f7',
                fontSize: 13,
                alignItems: 'center',
              }}
            >
              <span style={{ color: '#646a73' }}>{row.timeLabel}</span>
              <Space size={6}>
                <span style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: '#7c6cff', color: '#fff',
                  fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {getAvatarText(row.operator)}
                </span>
                <span style={{ color: '#1f2329', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.operator}
                </span>
              </Space>
              <Space size={4}>
                {!row.isCreate && row.fieldType && (
                  <span style={{ color: '#8f959e', fontSize: 12 }}>{FIELD_ICONS[row.fieldType] || '?'}</span>
                )}
                <span style={{ color: '#646a73', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.fieldName}
                </span>
              </Space>
              <div style={{ color: '#646a73', minWidth: 0 }}>
                {row.isCreate ? null : (
                  <Flex align="center" gap={8} wrap="wrap">
                    {row.beforeTag ? <HistoryValueTag tag={row.beforeTag} /> : <span>{row.before}</span>}
                    <span style={{ color: '#c9cdd4' }}>→</span>
                    {row.afterTag ? <HistoryValueTag tag={row.afterTag} /> : <span style={{ color: '#1f2329' }}>{row.after}</span>}
                  </Flex>
                )}
              </div>
            </div>
          ))}
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            {hasMore ? (
              <Button
                type="link"
                loading={loading}
                onClick={() => void loadPage(page + 1)}
                style={{ color: '#3370ff' }}
              >
                加载更多
              </Button>
            ) : (
              <span style={{ color: '#c9cdd4', fontSize: 13 }}>
                {total > 0 ? `共 ${total} 条记录` : '已经到底了'}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
};

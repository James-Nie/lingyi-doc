import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Spin, Tooltip } from 'antd';
import { CloseOutlined, HistoryOutlined } from '@ant-design/icons';
import {
  listDocumentVersions,
  type DocumentVersionListItem,
} from '../../api/documentVersion';
import {
  formatHistoryTime,
  getAvatarColor,
  getAvatarText,
  groupHistoryItems,
  historyActionLabel,
} from './historyUtils';
import './doc-history-panel.css';

export interface DocHistoryPanelProps {
  docId: string;
  selectedVersion: number | null;
  onSelectVersion: (version: number) => void;
  onVersionsChange?: (items: DocumentVersionListItem[], total: number) => void;
  onClose: () => void;
}

export const DocHistoryPanel: React.FC<DocHistoryPanelProps> = ({
  docId,
  selectedVersion,
  onSelectVersion,
  onVersionsChange,
  onClose,
}) => {
  const [items, setItems] = useState<DocumentVersionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publish = useCallback((nextItems: DocumentVersionListItem[], nextTotal: number) => {
    onVersionsChange?.(nextItems, nextTotal);
  }, [onVersionsChange]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listDocumentVersions(docId, { limit: 20 });
      setItems(result.items);
      setTotal(result.total);
      setHasMore(result.hasMore);
      publish(result.items, result.total);
      if (result.items.length > 0 && selectedVersion == null) {
        onSelectVersion(result.items[0].version);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载历史记录失败');
      setItems([]);
      setTotal(0);
      setHasMore(false);
      publish([], 0);
    } finally {
      setLoading(false);
    }
  }, [docId, onSelectVersion, publish, selectedVersion]);

  useEffect(() => {
    void loadInitial();
  }, [docId]); // eslint-disable-line react-hooks/exhaustive-deps -- 仅随文档切换重载

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || items.length === 0) return;
    setLoadingMore(true);
    try {
      const last = items[items.length - 1];
      const result = await listDocumentVersions(docId, {
        limit: 20,
        beforeVersion: last.version,
      });
      const nextItems = [...items, ...result.items];
      setItems(nextItems);
      setTotal(result.total);
      setHasMore(result.hasMore);
      publish(nextItems, result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载更多失败');
    } finally {
      setLoadingMore(false);
    }
  }, [docId, hasMore, items, loadingMore, publish]);

  const groups = useMemo(() => groupHistoryItems(items), [items]);
  const latestVersion = items[0]?.version ?? null;

  return (
    <aside className="doc-history-panel">
      <div className="doc-history-panel-header">
        <div className="doc-history-panel-title">
          <HistoryOutlined />
          <span>历史记录</span>
        </div>
        <Tooltip title="关闭">
          <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} />
        </Tooltip>
      </div>

      <div className="doc-history-panel-body">
        {loading ? (
          <div className="doc-history-empty">
            <Spin size="small" />
          </div>
        ) : error ? (
          <div className="doc-history-error">
            <div>{error}</div>
            <Button type="link" size="small" onClick={() => void loadInitial()}>
              重试
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="doc-history-empty">暂无历史记录</div>
        ) : (
          <>
            {groups.map((group) => (
              <div key={group.label}>
                <div className="doc-history-group-label">{group.label}</div>
                {group.items.map((item) => {
                  const name = item.createdByName?.trim() || '未知用户';
                  const tag = historyActionLabel(item, { isLatest: item.version === latestVersion });
                  const active = item.version === selectedVersion;
                  return (
                    <button
                      key={item.version}
                      type="button"
                      className={`doc-history-item${active ? ' is-active' : ''}`}
                      onClick={() => onSelectVersion(item.version)}
                    >
                      <span
                        className="doc-history-avatar"
                        style={{ background: getAvatarColor(name) }}
                      >
                        {getAvatarText(name)}
                      </span>
                      <span className="doc-history-item-main">
                        <span className="doc-history-item-time">
                          {formatHistoryTime(item.createdAt)}
                        </span>
                        <span className="doc-history-item-meta">
                          {tag && <span className="doc-history-item-tag">{tag}</span>}
                          <span>{name}</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
            {hasMore && (
              <button
                type="button"
                className="doc-history-more"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? '加载中...' : '展开更多历史记录'}
              </button>
            )}
            {!hasMore && total > 0 && (
              <div className="doc-history-empty" style={{ paddingTop: 8 }}>
                共 {total} 条记录
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
};

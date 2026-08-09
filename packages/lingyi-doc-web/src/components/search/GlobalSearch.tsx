import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchDocuments } from '../../api/search';
import type { SearchResultItem } from './search.types';
import { getDocTypeMeta } from '../../utils/docTypeMeta';
import { formatLastVisited } from '../../utils/formatDate';
import { navigateToDoc, openDocInNewTab } from '../../utils/navigateToDoc';

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

const SEARCH_PANEL_WIDTH = 600;
const SEARCH_PANEL_HEIGHT = 480;
const MIN_LOADING_MS = 250;

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // 按 Enter 触发搜索
  const doSearch = useCallback(async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setResults([]);
      setError(null);
      return;
    }

    const startAt = Date.now();
    setLoading(true);
    setError(null);
    try {
      const response = await searchDocuments(trimmed, 20);
      setResults(response.results);
      setSelectedIndex(-1);
    } catch (err) {
      console.error('搜索失败:', err);
      setError('搜索服务暂时不可用，请稍后重试');
      setResults([]);
    } finally {
      const elapsed = Date.now() - startAt;
      const remaining = Math.max(0, MIN_LOADING_MS - elapsed);
      if (remaining > 0) {
        setTimeout(() => setLoading(false), remaining);
      } else {
        setLoading(false);
      }
    }
  }, []);

  // 打开时聚焦输入框
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      setQuery('');
      setResults([]);
      setError(null);
      setSelectedIndex(-1);
    }
  }, [open]);

  // 关闭面板
  const handleClose = useCallback(() => {
    onClose();
    setQuery('');
    setResults([]);
    setError(null);
  }, [onClose]);

  // 键盘导航：集中在输入框处理，避免全局监听与 input 默认行为冲突导致闪动
  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => {
          if (results.length === 0) return -1;
          return prev < 0 ? 0 : Math.min(prev + 1, results.length - 1);
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => {
          if (results.length === 0) return -1;
          return prev < 0 ? results.length - 1 : Math.max(prev - 1, 0);
        });
        break;
      case 'Enter':
        e.preventDefault();
        e.stopPropagation();
        if (selectedIndex >= 0 && results.length > 0) {
          handleOpenDocument(results[selectedIndex], e.metaKey || e.ctrlKey);
        } else if (query.trim()) {
          doSearch(query);
        }
        break;
      case 'Escape':
        e.preventDefault();
        handleClose();
        break;
    }
  }, [results, selectedIndex, handleClose, query, doSearch]);

  // 滚动到选中项
  useEffect(() => {
    if (resultsRef.current && selectedIndex >= 0) {
      const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // 打开文档
  const handleOpenDocument = (item: SearchResultItem, openInNewTab: boolean) => {
    const path = item.spaceSlug && item.bookSlug && item.docSlug
      ? { spaceSlug: item.spaceSlug, bookSlug: item.bookSlug, docSlug: item.docSlug }
      : null;
    if (openInNewTab) {
      void openDocInNewTab(item.docId, path, item.recordId);
    } else {
      void navigateToDoc(navigate, item.docId, { path, recordId: item.recordId });
    }
    handleClose();
  };

  // 渲染文档类型图标
  const renderDocTypeIcon = (docType: string) => {
    const meta = getDocTypeMeta(docType);
    return (
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          background: meta.bg,
          color: meta.color,
          flexShrink: 0,
        }}
      >
        {meta.icon}
      </span>
    );
  };

  // 渲染摘要（支持HTML高亮）
  const renderSnippet = (snippet: string) => {
    if (!snippet) return null;
    return (
      <span
        style={{
          fontSize: 13,
          color: '#646a73',
          lineHeight: 1.5,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
        dangerouslySetInnerHTML={{ __html: snippet }}
      />
    );
  };

  // 加载骨架屏
  const renderSkeleton = () => (
    <div style={{ padding: '8px 0' }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: 12,
            padding: '14px 16px',
            alignItems: 'flex-start',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: '#f0f1f2',
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                width: '40%',
                height: 16,
                borderRadius: 4,
                background: '#f0f1f2',
                marginBottom: 8,
              }}
            />
            <div
              style={{
                width: '80%',
                height: 13,
                borderRadius: 4,
                background: '#f0f1f2',
                marginBottom: 8,
              }}
            />
            <div
              style={{
                width: '50%',
                height: 12,
                borderRadius: 4,
                background: '#f0f1f2',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );

  // 空状态
  const renderEmpty = () => (
    <div style={{ padding: '40px 32px', textAlign: 'center' }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: '#f5f6f7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8f959e" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      </div>
      <div style={{ color: '#1f2329', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
        未找到与「{query}」相关的结果
      </div>
      <div style={{ color: '#8f959e', fontSize: 13 }}>
        建议检查拼写、缩短关键词或尝试同义词
      </div>
    </div>
  );

  // 错误状态
  const renderError = () => (
    <div style={{ padding: '40px 32px', textAlign: 'center' }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: '#fff2f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff4d4f" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="m15 9-6 6M9 9l6 6" />
        </svg>
      </div>
      <div style={{ color: '#1f2329', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
        {error}
      </div>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setQuery('');
          inputRef.current?.focus();
        }}
        style={{
          padding: '6px 16px',
          border: '1px solid #d9d9d9',
          borderRadius: 6,
          background: '#fff',
          color: '#1f2329',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        重新输入
      </button>
    </div>
  );

  // 初始提示
  const renderInitialHint = () => (
    <div style={{ padding: '40px 32px', textAlign: 'center' }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: '#f0f5ff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3370ff" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      </div>
      <div style={{ color: '#1f2329', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
        输入关键词搜索文档
      </div>
      <div style={{ color: '#8f959e', fontSize: 13 }}>
        支持搜索文档标题、正文和多维表格记录
      </div>
    </div>
  );

  // 渲染结果来源标签
  const renderSourceTag = (item: SearchResultItem) => {
    if (item.docType === 'base' && item.recordId) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0 6px',
            height: 18,
            borderRadius: 4,
            background: '#e6f4ff',
            color: '#1677ff',
            fontSize: 11,
            fontWeight: 500,
            marginLeft: 8,
            flexShrink: 0,
          }}
        >
          多维表格 · 记录
        </span>
      );
    }
    return null;
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.35)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 100,
        zIndex: 1000,
        backdropFilter: 'blur(4px)',
      }}
      onClick={handleClose}
    >
      <div
        style={{
          width: SEARCH_PANEL_WIDTH,
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 搜索输入框 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px 16px',
            borderBottom: '1px solid #f0f1f2',
            gap: 12,
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#8f959e"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => {
              const value = e.target.value;
              setQuery(value);
              if (!value.trim()) {
                setResults([]);
                setSelectedIndex(-1);
                setError(null);
              }
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="搜索文档标题、内容..."
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: 14,
              color: '#1f2329',
              background: 'transparent',
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setResults([]);
                setSelectedIndex(-1);
                setError(null);
                inputRef.current?.focus();
              }}
              style={{
                width: 22,
                height: 22,
                border: 'none',
                background: '#e5e6eb',
                borderRadius: '50%',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#8f959e',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={handleClose}
            style={{
              width: 28,
              height: 28,
              border: 'none',
              background: 'transparent',
              borderRadius: 6,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#8f959e',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 搜索结果区域 */}
        <div
          ref={resultsRef}
          style={{
            flex: 1,
            overflow: 'auto',
            maxHeight: SEARCH_PANEL_HEIGHT - 100,
          }}
        >
          {/* 高级搜索入口 */}
          {query && !loading && !error && results.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 16px',
                color: '#3370ff',
                fontSize: 13,
                cursor: 'pointer',
              }}
              onClick={() => {
                console.log('打开高级搜索:', query);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <span>在高级搜索中查看「{query}」</span>
            </div>
          )}

          {/* 加载中骨架屏 */}
          {loading && renderSkeleton()}

          {/* 错误状态 */}
          {!loading && error && renderError()}

          {/* 初始提示 */}
          {!loading && !error && !query && renderInitialHint()}

          {/* 无结果 */}
          {!loading && !error && query && results.length === 0 && renderEmpty()}

          {/* 搜索结果列表 */}
          {!loading && !error && results.length > 0 && (
            <div>
              {results.map((item, index) => {
                const isSelected = index === selectedIndex;

                return (
                  <div
                    key={item.docId}
                    onClick={() => handleOpenDocument(item, false)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    style={{
                      padding: '14px 16px',
                      cursor: 'pointer',
                      background: isSelected ? '#f0f5ff' : 'transparent',
                      borderLeft: isSelected ? '3px solid #3370ff' : '3px solid transparent',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 12 }}>
                      {renderDocTypeIcon(item.docType)}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* 标题 */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            fontSize: 14,
                            color: '#1f2329',
                            fontWeight: 500,
                            marginBottom: 4,
                            overflow: 'hidden',
                          }}
                        >
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {item.title || '未命名文档'}
                          </span>
                          {renderSourceTag(item)}
                        </div>

                        {/* 摘要 */}
                        {renderSnippet(item.snippet)}

                        {/* 位置和时间信息 */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 16,
                            marginTop: 8,
                            fontSize: 12,
                            color: '#8f959e',
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="#f9ab00">
                              <path d="M4 8h6l2 2h8v10H4V8z" />
                            </svg>
                            {item.location}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                              <circle cx="12" cy="10" r="3" />
                            </svg>
                            {item.ownerName}
                          </span>
                          <span>{item.lastVisitedAt ? formatLastVisited(item.lastVisitedAt) : ''}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部提示 */}
        <div
          style={{
            padding: '10px 16px',
            borderTop: '1px solid #f0f1f2',
            fontSize: 12,
            color: '#8f959e',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <span>支持 ↑↓ 键选择</span>
          <span>Enter 键打开</span>
          <span>⌘+Enter 新窗口打开</span>
        </div>
      </div>
    </div>
  );
};

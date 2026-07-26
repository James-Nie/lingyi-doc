import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocumentManager, importDocumentFile } from '@lingyi-doc/core';
import type { DocumentListItem } from '@lingyi-doc/core';
import { DOC_SHARE_PERMISSION_LABELS } from '../api/documentShare';
import { formatCreatedAt, formatLastVisited, getAvatarColor, getAvatarText } from '../utils/formatDate';
import { getDocTypeMeta } from '../utils/docTypeMeta';
import { DocumentRowMenu, type DocumentRowAction } from '../components/DocumentRowMenu';
import { UploadCard } from '../components/UploadMenu';
import { DuplicateTitleModal } from '../components/DuplicateTitleModal';
import { confirmDeleteToRecycleBin } from '../utils/appDialog';
import { isDocumentTitleTaken } from '../utils/documentTitle';
import { CreateDocQuickCard, CreateDocTemplateLibraryCard } from '../components/createDoc';
import { useCreateDocument } from '../hooks/useCreateDocument';
import { PageTopBar } from '../components/layout/topBar';
import { appPath } from '../utils/appPaths';
import { navigateToDoc, rememberDocPathsFromList } from '../utils/navigateToDoc';

type SortKey = 'lastVisited' | 'created' | 'updated';
type TabKey = 'recent' | 'owned' | 'shared' | 'starred';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'recent', label: '最近访问' },
  { key: 'owned', label: '归我所有' },
  { key: 'shared', label: '与我共享' }
];

/** 列表列：minmax(0, …) 允许在侧栏+主内容区内收缩，避免右侧被裁切 */
const DOC_LIST_GRID_COLUMNS =
  'minmax(0, 2.2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.9fr) minmax(0, 0.9fr) 36px';

const cellEllipsis: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
};

export const DocumentListPage: React.FC = () => {
  const navigate = useNavigate();
  const createDoc = useCreateDocument();
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [sharedDocuments, setSharedDocuments] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('lastVisited');
  const [activeTab, setActiveTab] = useState<TabKey>('recent');
  const [importing, setImporting] = useState(false);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const [openMenuDocId, setOpenMenuDocId] = useState<string | null>(null);
  const [hoveredDocId, setHoveredDocId] = useState<string | null>(null);
  const [actionBusyDocId, setActionBusyDocId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [duplicateTitle, setDuplicateTitle] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((msg: string) => setToast(msg), []);
  const showStub = useCallback((name: string) => showToast(`${name}功能开发中`), [showToast]);

  const loadDocuments = useCallback(async (sort: SortKey = sortBy) => {
    setLoading(true);
    setError(null);
    try {
      const items = activeTab === 'owned'
        ? await DocumentManager.listOwned(sort)
        : await DocumentManager.listRecent(sort, 30);
      rememberDocPathsFromList(items);
      setDocuments(items);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [sortBy, activeTab]);

  const loadSharedDocuments = useCallback(async (sort: SortKey = sortBy) => {
    setLoading(true);
    setError(null);
    try {
      const items = await DocumentManager.listSharedWithMe(sort);
      rememberDocPathsFromList(items);
      setSharedDocuments(items);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [sortBy]);

  useEffect(() => {
    if (activeTab === 'shared') {
      void loadSharedDocuments(sortBy);
      return;
    }
    if (activeTab === 'recent' || activeTab === 'owned') {
      void loadDocuments(sortBy);
    }
  }, [sortBy, activeTab, loadDocuments, loadSharedDocuments]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const showDuplicateTitle = useCallback((title: string) => {
    setDuplicateTitle(title);
  }, []);

  const handleImportClick = () => {
    setUploadMenuOpen(false);
    importInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImporting(true);
    setError(null);
    try {
      const imported = await importDocumentFile(file);
      if (isDocumentTitleTaken(imported.title, documents)) {
        showDuplicateTitle(imported.title);
        return;
      }
      if (imported.kind === 'richtext') {
        const id = await DocumentManager.createRichTextFromDocument(imported.title, imported.document);
        await navigateToDoc(navigate, id);
        return;
      }
      const id = await DocumentManager.create(imported.title, imported.workbook, imported.docType);
      await navigateToDoc(navigate, id);
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes('已存在')) {
        setDuplicateTitle(message.match(/「(.+?)」/)?.[1] ?? message);
      } else {
        setError(`导入失败: ${message}`);
      }
    } finally {
      setImporting(false);
    }
  };

  const handleSort = (key: SortKey) => {
    if (key === sortBy) return;
    setSortBy(key);
  };

  const handleDelete = async (docId: string) => {
    const confirmed = await confirmDeleteToRecycleBin();
    if (!confirmed) return;
    setActionBusyDocId(docId);
    setOpenMenuDocId(null);
    try {
      await DocumentManager.delete(docId);
      showToast('文档已移入回收站');
      await loadDocuments(sortBy);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionBusyDocId(null);
    }
  };

  const handleDuplicate = async (docId: string) => {
    setActionBusyDocId(docId);
    setOpenMenuDocId(null);
    try {
      const newId = await DocumentManager.duplicate(docId);
      showToast('副本已创建');
      await loadDocuments(sortBy);
      await navigateToDoc(navigate, newId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionBusyDocId(null);
    }
  };

  const handleCopyLink = async (docId: string) => {
    setOpenMenuDocId(null);
    try {
      await DocumentManager.copyLink(docId);
      showToast('链接已复制');
    } catch (err) {
      setError(`复制链接失败: ${(err as Error).message}`);
    }
  };

  const handleRowAction = (docId: string, action: DocumentRowAction) => {
    if (action === 'copyLink') handleCopyLink(docId);
    else if (action === 'duplicate') handleDuplicate(docId);
    else handleDelete(docId);
  };

  const busy = importing;
  const isSharedTab = activeTab === 'shared';
  const filteredDocs = useMemo(() => {
    if (isSharedTab) return sharedDocuments;
    return documents;
  }, [activeTab, documents, isSharedTab, sharedDocuments]);

  const emptyMessage = isSharedTab
    ? '暂无共享文档'
    : activeTab === 'owned'
      ? '暂无归你所有的文档'
      : activeTab === 'recent'
        ? '近 30 天暂无访问记录'
        : '暂无文档，点击「新建」创建第一个表格';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, overflow: 'hidden' }}>
      <DuplicateTitleModal
        title={duplicateTitle}
        onClose={() => setDuplicateTitle(null)}
      />
      <input
        ref={importInputRef}
        type="file"
        accept=".docx,.md,.markdown,.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/markdown"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />

      {/* 顶栏 */}
      <PageTopBar title="主页" onStub={showStub} />

      {/* 快捷操作卡片 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 16,
        padding: '0 24px 24px',
        flexShrink: 0,
        minWidth: 0,
        width: '100%',
        boxSizing: 'border-box',
      }}>
        <CreateDocQuickCard
          menuOpen={createDoc.menuOpen}
          disabled={busy}
          onToggle={() => {
            setUploadMenuOpen(false);
            createDoc.setMenuOpen(v => !v);
          }}
          onClose={createDoc.closeMenu}
          onCreate={createDoc.handlePickDocType}
          onStub={showStub}
          onCreateKnowledgeBase={createDoc.openCreateKnowledgeBase}
        />

        {/* 上传 */}
        <UploadCard
          open={uploadMenuOpen}
          disabled={busy}
          onToggle={() => { createDoc.closeMenu(); setUploadMenuOpen(v => !v); }}
          onClose={() => setUploadMenuOpen(false)}
          onUploadFile={handleImportClick}
          onStub={showStub}
        />

        <CreateDocTemplateLibraryCard onClick={createDoc.openTemplateLibrary} />
      </div>

      {/* 列表区 */}
      <div style={{
        flex: 1, minWidth: 0, minHeight: 0,
        overflow: 'auto', padding: '0 24px 32px', position: 'relative',
      }}>
        {toast && <Toast message={toast} />}
        {error && (
          <div style={{ margin: '0 0 16px', padding: '12px 16px', background: '#fff1f0', color: '#cf1322', borderRadius: 6, fontSize: 13 }}>
            {error}
            <button
              onClick={() => {
                if (isSharedTab) void loadSharedDocuments(sortBy);
                else void loadDocuments(sortBy);
              }}
              style={{ marginLeft: 12, border: 'none', background: 'none', color: '#3370ff', cursor: 'pointer' }}
            >
              重试
            </button>
          </div>
        )}

        {/* Tabs + 工具栏 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          minWidth: 0,
          flexWrap: 'wrap',
          borderBottom: '1px solid #ebebeb',
          marginBottom: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flexWrap: 'wrap' }}>
            {TABS.map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  if (tab.key === 'starred') {
                    showStub(tab.label);
                    return;
                  }
                  setActiveTab(tab.key);
                }}
                style={{
                  padding: '10px 12px', border: 'none', background: 'transparent',
                  fontSize: 14, cursor: 'pointer', position: 'relative',
                  color: activeTab === tab.key ? '#3370ff' : '#646a73',
                  fontWeight: activeTab === tab.key ? 500 : 400,
                }}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <span style={{
                    position: 'absolute', left: 12, right: 12, bottom: 0,
                    height: 2, background: '#3370ff', borderRadius: 1,
                  }} />
                )}
              </button>
            ))}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, paddingBottom: 6,
            flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end',
          }}>
            <ToolBtn label="筛选" onClick={() => showStub('筛选')} />
            <ToolBtn label="显示设置" onClick={() => showStub('显示设置')} />
            <HeaderIconBtn title="列表视图" onClick={() => showStub('列表视图')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </HeaderIconBtn>
            <HeaderIconBtn title="网格视图" onClick={() => showStub('网格视图')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="4" width="7" height="7" /><rect x="13" y="4" width="7" height="7" />
                <rect x="4" y="13" width="7" height="7" /><rect x="13" y="13" width="7" height="7" />
              </svg>
            </HeaderIconBtn>
          </div>
        </div>

        <div style={{ minWidth: 0, width: '100%' }}>
        {/* 表头 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: DOC_LIST_GRID_COLUMNS,
          gap: 12,
          padding: '12px 8px',
          borderBottom: '1px solid #ebebeb',
          fontSize: 13,
          color: '#8f959e',
          position: 'sticky',
          top: 0,
          background: '#fff',
          zIndex: 1,
        }}>
          <span>标题</span>
          <span>位置</span>
          <span>所有者</span>
          <SortHeader label="创建时间" active={sortBy === 'created'} onClick={() => handleSort('created')} />
          <SortHeader label="最近访问" active={sortBy === 'lastVisited'} onClick={() => handleSort('lastVisited')} />
          <span />
        </div>

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#8f959e', fontSize: 14 }}>加载中...</div>
        ) : filteredDocs.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#8f959e', fontSize: 14 }}>
            {emptyMessage}
          </div>
        ) : (
          filteredDocs.map(doc => {
            const meta = getDocTypeMeta(doc.docType);
            const ownerName = doc.ownerName || '—';
            const avatarColor = getAvatarColor(ownerName);
            const isHovered = hoveredDocId === doc.id;
            const isMenuOpen = openMenuDocId === doc.id;
            const isBusy = actionBusyDocId === doc.id;
            const showActions = !isSharedTab && (isHovered || isMenuOpen);
            const locationText = isSharedTab
              ? (doc.sharedByName
                ? `${doc.sharedByName} 分享 · ${DOC_SHARE_PERMISSION_LABELS[doc.sharePermission ?? 'read']}`
                : doc.location || '共享文档')
              : (doc.location || '我的文档库');

            return (
              <div
                key={doc.id}
                onClick={() => {
                  void navigateToDoc(navigate, doc.id, {
                    path: doc.spaceSlug && doc.bookSlug && doc.docSlug
                      ? { spaceSlug: doc.spaceSlug, bookSlug: doc.bookSlug, docSlug: doc.docSlug }
                      : null,
                  });
                }}
                onMouseEnter={() => setHoveredDocId(doc.id)}
                onMouseLeave={() => { if (!isMenuOpen) setHoveredDocId(null); }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: DOC_LIST_GRID_COLUMNS,
                  gap: 12,
                  padding: '14px 8px',
                  borderBottom: '1px solid #f5f6f7',
                  alignItems: 'center',
                  cursor: 'pointer',
                  fontSize: 14,
                  color: '#1f2329',
                  background: isHovered || isMenuOpen ? '#f5f8ff' : 'transparent',
                  transition: 'background 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                    background: meta.bg, color: meta.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                  }}>
                    {meta.icon}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.title || '未命名文档'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#646a73', fontSize: 13, minWidth: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#f9ab00" style={{ flexShrink: 0 }}><path d="M4 8h6l2 2h8v10H4V8z" /></svg>
                  <span style={cellEllipsis}>{locationText}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    background: avatarColor, color: '#fff', fontSize: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {getAvatarText(ownerName)}
                  </span>
                  <span style={{ fontSize: 13, color: '#646a73', ...cellEllipsis }}>
                    {ownerName}
                  </span>
                </div>

                <span style={{ fontSize: 13, color: '#646a73', ...cellEllipsis }}>{formatCreatedAt(doc.createdAt)}</span>
                <span style={{ fontSize: 13, color: '#646a73', ...cellEllipsis }}>{formatLastVisited(doc.lastVisitedAt)}</span>

                <div
                  style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end' }}
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    type="button"
                    title="更多操作"
                    onClick={() => {
                      setOpenMenuDocId(prev => (prev === doc.id ? null : doc.id));
                      setHoveredDocId(doc.id);
                    }}
                    style={{
                      width: 28, height: 28, border: 'none', borderRadius: 6,
                      background: isMenuOpen ? '#dee0e3' : showActions ? 'rgba(255,255,255,0.8)' : 'transparent',
                      color: '#646a73', cursor: 'pointer', fontSize: 18, lineHeight: 1,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      opacity: showActions ? 1 : 0,
                      pointerEvents: showActions ? 'auto' : 'none',
                      transition: 'opacity 0.15s ease, background 0.15s ease',
                    }}
                  >
                    ···
                  </button>
                  <DocumentRowMenu
                    open={isMenuOpen}
                    busy={isBusy}
                    onClose={() => { setOpenMenuDocId(null); setHoveredDocId(null); }}
                    onAction={action => handleRowAction(doc.id, action)}
                  />
                </div>
              </div>
            );
          })
        )}
        </div>
      </div>
    </div>
  );
};

function HeaderIconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        width: 32, height: 32, border: 'none', borderRadius: 6,
        background: 'transparent', cursor: 'pointer', color: '#646a73',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#f5f6f7'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}

function ToolBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 10px', border: 'none', borderRadius: 4,
        background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#646a73',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#f5f6f7'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </button>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <div style={{
      position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
      padding: '10px 18px', background: '#1f2329', color: '#fff',
      borderRadius: 8, fontSize: 13, zIndex: 200,
      boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    }}>
      {message}
    </div>
  );
}

const SortHeader: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({
  label, active, onClick,
}) => (
  <button
    onClick={onClick}
    style={{
      border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
      fontSize: 13, color: active ? '#3370ff' : '#8f959e', textAlign: 'left',
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}
  >
    {label}
    {active && <span style={{ fontSize: 10 }}>▼</span>}
  </button>
);

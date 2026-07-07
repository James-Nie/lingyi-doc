import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { message } from 'antd';
import { formatRelativeModified } from '../utils/formatDate';
import { authStore } from '../stores/authStore';
import { appPath } from '../utils/appPaths';
import { DocShareModal } from './share/DocShareModal';
import { DocInfoModal } from './docInfo/DocInfoModal';
import {
  AppTopBar,
  TopBarBreadcrumbs,
  TopBarToolbar,
  DEFAULT_DOCUMENT_MORE_ITEMS,
  type DocumentMoreMenuItem,
} from './layout/topBar';
import type { DocumentViewMode } from '../utils/documentViewMode';
import { appendDownloadMenuItem, parseDownloadFormat, type DownloadFormat, type EditorDocType } from '../utils/downloadAs';

interface DocumentBarProps {
  docId: string | null;
  title: string;
  saveStatus: 'saved' | 'unsaved' | 'saving' | 'error';
  onTitleChange: (title: string) => void;
  onBack?: () => void;
  showBack?: boolean;
  showTitle?: boolean;
  showExport?: boolean;
  exporting?: boolean;
  onExport?: (format: 'xlsx' | 'csv') => void;
  docType?: EditorDocType;
  onDownloadAs?: (format: DownloadFormat) => void;
  lastModified?: number;
  onStub?: (name: string) => void;
  moreMenuItems?: DocumentMoreMenuItem[];
  breadcrumbItems?: Array<{ label: string; onClick?: () => void }>;
  canEdit?: boolean;
  effectiveViewMode?: DocumentViewMode;
  onTogglePreview?: () => void;
  titleEditable?: boolean;
}

export const DocumentBar: React.FC<DocumentBarProps> = ({
  docId,
  title,
  saveStatus,
  onTitleChange,
  onBack,
  showBack = false,
  showTitle = true,
  showExport,
  exporting,
  onExport,
  docType,
  onDownloadAs,
  lastModified,
  onStub,
  moreMenuItems,
  breadcrumbItems,
  canEdit = true,
  effectiveViewMode = 'edit',
  onTogglePreview,
  titleEditable,
}) => {
  const navigate = useNavigate();
  const authState = useSyncExternalStore(authStore.subscribe, authStore.getState);
  const tenantId = authState.session?.currentIdentityType === 'tenant'
    ? authState.session.currentTenantId
    : null;
  const [pinned, setPinned] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [docInfoOpen, setDocInfoOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [exportMenuOpen]);

  const workspaceName = useMemo(() => {
    const session = authState.session;
    if (session?.currentIdentityType === 'tenant') {
      const tenant = authState.tenants.find(t => t.id === session.currentTenantId);
      return tenant?.name ?? '企业空间';
    }
    return '我的空间';
  }, [authState.session, authState.tenants]);

  const saveStatusText = {
    saved: '已保存',
    unsaved: '未保存',
    saving: '保存中...',
    error: '保存失败',
  }[saveStatus];

  const modifiedText = lastModified ? `最近修改：${formatRelativeModified(lastModified)}` : null;
  const isPreview = effectiveViewMode === 'preview';
  const subtitleParts = [
    isPreview ? '预览模式' : null,
    modifiedText,
    isPreview ? null : saveStatusText,
  ].filter(Boolean) as string[];

  const resolvedTitleEditable = titleEditable ?? (canEdit && !isPreview && showTitle);

  const crumbs = breadcrumbItems ?? [
    { label: workspaceName, onClick: () => navigate(appPath.home) },
    ...(showTitle ? [] : [{ label: title || '未命名文档' }]),
  ];

  const stub = useCallback((name: string) => {
    if (onStub) onStub(name);
  }, [onStub]);

  const resolvedMoreMenuItems = useMemo(() => {
    const baseItems = moreMenuItems ?? DEFAULT_DOCUMENT_MORE_ITEMS;
    return docType ? appendDownloadMenuItem(baseItems, docType) : baseItems;
  }, [moreMenuItems, docType]);

  const handleMoreAction = useCallback((key: string) => {
    const downloadFormat = parseDownloadFormat(key);
    if (downloadFormat && onDownloadAs) {
      onDownloadAs(downloadFormat);
      return;
    }
    if (key === 'docInfo' && docId) {
      setDocInfoOpen(true);
      return;
    }
    stub(key);
  }, [docId, onDownloadAs, stub]);

  const exportExtra = showExport ? (
    <div ref={exportMenuRef} style={{ position: 'relative', marginRight: 4 }}>
      <button
        type="button"
        disabled={exporting}
        onClick={() => setExportMenuOpen(v => !v)}
        style={{
          height: 32,
          padding: '0 12px',
          border: '1px solid #dee0e3',
          borderRadius: 6,
          background: '#fff',
          cursor: exporting ? 'not-allowed' : 'pointer',
          fontSize: 13,
          color: '#1f2329',
          opacity: exporting ? 0.6 : 1,
        }}
      >
        {exporting ? '导出中...' : '导出'}
      </button>
      {exportMenuOpen && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: '100%',
          marginTop: 6,
          minWidth: 160,
          background: '#fff',
          border: '1px solid #dee0e3',
          borderRadius: 8,
          boxShadow: '0 8px 28px rgba(31, 35, 41, 0.12)',
          zIndex: 200,
          overflow: 'hidden',
        }}>
          {(['xlsx', 'csv'] as const).map(fmt => (
            <button
              key={fmt}
              type="button"
              onClick={() => {
                setExportMenuOpen(false);
                onExport?.(fmt);
              }}
              style={menuItemStyle}
            >
              {fmt === 'xlsx' ? 'Excel (.xlsx)' : 'CSV (.csv)'}
            </button>
          ))}
        </div>
      )}
    </div>
  ) : null;

  const previewToggle = canEdit && onTogglePreview ? (
    <button
      type="button"
      onClick={onTogglePreview}
      style={{
        height: 32,
        padding: '0 12px',
        border: '1px solid #dee0e3',
        borderRadius: 6,
        background: isPreview ? '#f0f4ff' : '#fff',
        color: isPreview ? '#3370ff' : '#1f2329',
        cursor: 'pointer',
        fontSize: 13,
        marginRight: 4,
      }}
    >
      {isPreview ? '退出预览' : '预览'}
    </button>
  ) : null;

  const previewBadge = !canEdit && isPreview ? (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      height: 22,
      padding: '0 8px',
      marginRight: 8,
      borderRadius: 4,
      background: '#f0f4ff',
      color: '#3370ff',
      fontSize: 12,
      flexShrink: 0,
    }}>
      只读预览
    </span>
  ) : null;

  return (
    <>
      <AppTopBar
      left={(
        <>
          {showBack && onBack && (
            <button
              type="button"
              onClick={onBack}
              style={{
                marginRight: 8,
                padding: '4px 8px',
                border: '1px solid #dee0e3',
                borderRadius: 6,
                background: '#fff',
                cursor: 'pointer',
                fontSize: 13,
                flexShrink: 0,
              }}
            >
              返回
            </button>
          )}
          <TopBarBreadcrumbs
            items={crumbs}
            pinned={pinned}
            onTogglePin={() => setPinned(v => !v)}
            titleEditable={resolvedTitleEditable}
            title={title}
            onTitleChange={onTitleChange}
            subtitle={subtitleParts.join(' · ')}
            trailing={previewBadge ?? undefined}
          />
        </>
      )}
      right={(
        <TopBarToolbar
          onStub={stub}
          onMoreAction={handleMoreAction}
          onShare={docId && canEdit && !isPreview ? () => setShareOpen(true) : undefined}
          moreMenuItems={resolvedMoreMenuItems}
          extra={(
            <>
              {previewToggle}
              {exportExtra}
            </>
          )}
        />
      )}
    />
      {docId && (
        <DocInfoModal
          open={docInfoOpen}
          docId={docId}
          onClose={() => setDocInfoOpen(false)}
        />
      )}
      {docId && (
        <DocShareModal
          open={shareOpen}
          docId={docId}
          tenantId={tenantId}
          onClose={() => setShareOpen(false)}
          onToast={msg => message.success(msg)}
        />
      )}
    </>
  );
};

const menuItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '10px 14px',
  border: 'none',
  background: '#fff',
  textAlign: 'left',
  fontSize: 13,
  color: '#1f2329',
  cursor: 'pointer',
};

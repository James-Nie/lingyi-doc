import React from 'react';
import type { DocumentMoreMenuItem } from '../components/layout/topBar/DocumentMoreMenu';

export type RichDocDownloadFormat = 'word' | 'pdf' | 'markdown';
export type SheetDownloadFormat = 'xlsx' | 'png' | 'csv';
export type DownloadFormat = RichDocDownloadFormat | SheetDownloadFormat;

export type EditorDocType = 'richtext' | 'freeform' | 'base' | 'mindnote';

const SUBMENU_PANEL: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #dee0e3',
  borderRadius: 8,
  boxShadow: '0 8px 28px rgba(31, 35, 41, 0.12)',
  padding: '8px 0',
  minWidth: 240,
};

const SUBMENU_HEADER: React.CSSProperties = {
  padding: '6px 16px 4px',
  fontSize: 12,
  color: '#8f959e',
  lineHeight: '20px',
};

const SUBMENU_ITEM: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 16px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 14,
  color: '#1f2329',
  textAlign: 'left',
};

function FileIcon({ bg, label, color = '#fff' }: { bg: string; label: string; color?: string }) {
  return (
    <span style={{
      width: 20,
      height: 20,
      borderRadius: 4,
      background: bg,
      color,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 11,
      fontWeight: 700,
      flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

const RICH_DOC_ITEMS = [
  { key: 'word', label: 'Word' },
  { key: 'pdf', label: 'PDF' },
  { key: 'markdown', label: 'Markdown' },
] as const;

const SHEET_GROUPS = [
  {
    title: '表格下载为',
    items: [
      { key: 'xlsx', label: '本地 Excel 表格(.xlsx)', icon: <FileIcon bg="#34a853" label="X" /> },
    ],
  },
  {
    title: '当前工作表下载为',
    items: [
      { key: 'png', label: '图片(.png)', icon: <FileIcon bg="#f5a623" label="🖼" color="#fff" /> },
      { key: 'csv', label: '本地 CSV 文件(.csv)', icon: <FileIcon bg="#34a853" label="C" /> },
    ],
  },
] as const;

export function buildDownloadSubmenu(docType: EditorDocType): DocumentMoreMenuItem['submenu'] {
  if (docType === 'richtext') {
    return RICH_DOC_ITEMS.map(item => ({
      key: `downloadAs:${item.key}`,
      label: item.label,
    }));
  }
  if (docType === 'freeform') {
    return SHEET_GROUPS.flatMap(group => group.items.map(item => ({
      key: `downloadAs:${item.key}`,
      label: item.label,
      group: group.title,
      icon: item.icon,
    })));
  }
  return undefined;
}

export function renderDownloadSubmenu(
  items: NonNullable<DocumentMoreMenuItem['submenu']>,
  onSelect: (key: string) => void,
  onMouseEnter?: () => void,
  onMouseLeave?: () => void,
): React.ReactNode {
  let lastGroup: string | undefined;

  return (
    <div
      style={SUBMENU_PANEL}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {items.map(item => {
        const showHeader = item.group && item.group !== lastGroup;
        if (item.group) lastGroup = item.group;
        return (
          <React.Fragment key={item.key}>
            {showHeader && <div style={SUBMENU_HEADER}>{item.group}</div>}
            <button
              type="button"
              style={SUBMENU_ITEM}
              onClick={() => onSelect(item.key)}
              onMouseEnter={e => { e.currentTarget.style.background = '#f5f6f7'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              {item.icon ? item.icon : <span style={{ width: 20 }} />}
              <span>{item.label}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function parseDownloadFormat(key: string): DownloadFormat | null {
  if (!key.startsWith('downloadAs:')) return null;
  return key.slice('downloadAs:'.length) as DownloadFormat;
}

export function appendDownloadMenuItem(
  items: DocumentMoreMenuItem[],
  docType: EditorDocType,
): DocumentMoreMenuItem[] {
  const submenu = buildDownloadSubmenu(docType);
  if (!submenu?.length) return items;

  return items.map(item => (
    item.key === 'downloadAs'
      ? {
        ...item,
        submenu,
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3v12" /><path d="M8 11l4 4 4-4" /><path d="M4 21h16" />
          </svg>
        ),
      }
      : item
  ));
}

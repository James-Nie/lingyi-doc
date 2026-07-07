import React, { useEffect, useRef } from 'react';

export type DocumentRowAction = 'copyLink' | 'duplicate' | 'delete';

interface DocumentRowMenuProps {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onAction: (action: DocumentRowAction) => void;
}

const MENU_ITEMS: Array<{
  action: DocumentRowAction;
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  dividerBefore?: boolean;
}> = [
  {
    action: 'copyLink',
    label: '复制链接',
    icon: <LinkIcon />,
  },
  {
    action: 'duplicate',
    label: '创建副本',
    icon: <CopyIcon />,
    dividerBefore: true,
  },
  {
    action: 'delete',
    label: '删除',
    icon: <DeleteIcon />,
    danger: true,
    dividerBefore: true,
  },
];

export const DocumentRowMenu: React.FC<DocumentRowMenuProps> = ({
  open,
  busy,
  onClose,
  onAction,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      style={{
        position: 'absolute',
        right: 0,
        top: '100%',
        marginTop: 4,
        minWidth: 200,
        background: '#fff',
        border: '1px solid #dee0e3',
        borderRadius: 8,
        boxShadow: '0 6px 24px rgba(31, 35, 41, 0.12)',
        padding: '6px 0',
        zIndex: 50,
      }}
      onClick={e => e.stopPropagation()}
    >
      {MENU_ITEMS.map(item => (
        <React.Fragment key={item.action}>
          {item.dividerBefore && (
            <div style={{ height: 1, background: '#ebebeb', margin: '4px 0' }} />
          )}
          <button
            disabled={busy}
            onClick={() => onAction(item.action)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '9px 16px',
              border: 'none',
              background: 'transparent',
              cursor: busy ? 'not-allowed' : 'pointer',
              fontSize: 14,
              color: item.danger ? '#f54a45' : '#1f2329',
              textAlign: 'left',
              opacity: busy ? 0.6 : 1,
            }}
            onMouseEnter={e => {
              if (!busy) e.currentTarget.style.background = item.danger ? '#fff1f0' : '#f5f6f7';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span style={{
              width: 18,
              height: 18,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: item.danger ? '#f54a45' : '#646a73',
              flexShrink: 0,
            }}>
              {item.icon}
            </span>
            {item.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};

function LinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M6.2 9.8a3 3 0 0 0 4.24 0l2.12-2.12a3 3 0 1 0-4.24-4.24L7.7 4.3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M9.8 6.2a3 3 0 0 0-4.24 0L3.44 8.32a3 3 0 1 0 4.24 4.24l.34-.34"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="5" y="5" width="8" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M4 11V3.8A.8.8 0 0 1 4.8 3H11"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 4.5h9M6 4.5V3.8a.8.8 0 0 1 .8-.8h2.4a.8.8 0 0 1 .8.8V4.5M6.5 7v4M9.5 7v4M4.5 4.5l.5 8.2a.8.8 0 0 0 .8.8h4.4a.8.8 0 0 0 .8-.8l.5-8.2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

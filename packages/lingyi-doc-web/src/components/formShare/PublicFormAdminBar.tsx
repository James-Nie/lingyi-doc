import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { message } from 'antd';
import { UserAccountMenu } from '../auth/UserAccountMenu';
import { authStore } from '../../stores/authStore';

export type PublicFormAdminPanel = 'none' | 'stats' | 'submissions';

export interface PublicFormAdminBarProps {
  activePanel: PublicFormAdminPanel;
  shareLink: string;
  onEditForm: () => void;
  onToggleStats: () => void;
  onToggleSubmissions: () => void;
}

const PRIMARY = '#3370ff';

export const PublicFormAdminBar: React.FC<PublicFormAdminBarProps> = ({
  activePanel,
  shareLink,
  onEditForm,
  onToggleStats,
  onToggleSubmissions,
}) => {
  const [shareOpen, setShareOpen] = useState(false);
  const shareBtnRef = useRef<HTMLButtonElement>(null);
  const sharePanelRef = useRef<HTMLDivElement>(null);
  const user = useSyncExternalStore(
    authStore.subscribe,
    () => authStore.getState().user,
    () => null,
  );

  useEffect(() => {
    setShareOpen(false);
  }, [activePanel]);

  useEffect(() => {
    if (!shareOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (sharePanelRef.current?.contains(target)) return;
      if (shareBtnRef.current?.contains(target)) return;
      setShareOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [shareOpen]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      message.success('链接已复制');
    } catch {
      message.error('复制失败，请手动复制');
    }
  };

  return (
    <div style={{
      position: 'absolute',
      top: 12,
      right: 16,
      zIndex: 20,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
      <AdminButton icon={<EditIcon />} label="编辑表单" onClick={onEditForm} />
      <AdminButton
        icon={<ChartIcon />}
        label="统计"
        active={activePanel === 'stats'}
        onClick={onToggleStats}
      />
      <AdminButton
        icon={<SearchDocIcon />}
        label="查看提交记录"
        active={activePanel === 'submissions'}
        onClick={onToggleSubmissions}
      />
      <div style={{ position: 'relative' }}>
        <AdminButton
          ref={shareBtnRef}
          icon={<ShareIcon />}
          label="分享"
          primary
          active={shareOpen}
          onClick={() => setShareOpen(v => !v)}
        />
        {shareOpen && (
          <div
            ref={sharePanelRef}
            role="dialog"
            aria-label="分享给他人"
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              width: 420,
              maxWidth: 'calc(100vw - 32px)',
              background: '#fff',
              borderRadius: 10,
              border: '1px solid #dee0e3',
              boxShadow: '0 8px 28px rgba(31, 35, 41, 0.14)',
              padding: '16px 18px 18px',
              zIndex: 30,
            }}
            onMouseDown={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1f2329', marginBottom: 12 }}>
              分享给他人
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                readOnly
                value={shareLink}
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: 36,
                  border: 'none',
                  borderRadius: 6,
                  background: '#f5f6f7',
                  padding: '0 12px',
                  fontSize: 13,
                  color: '#646a73',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => void copyLink()}
                style={{
                  height: 36,
                  border: 'none',
                  borderRadius: 6,
                  background: PRIMARY,
                  color: '#fff',
                  padding: '0 14px',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                <CopyIcon />
                复制链接
              </button>
            </div>
          </div>
        )}
      </div>
      {user && (
        <UserAccountMenu
          displayName={user.displayName}
          email={user.email}
          variant="avatar"
        />
      )}
    </div>
  );
};

interface AdminButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
  active?: boolean;
}

const AdminButton = React.forwardRef<HTMLButtonElement, AdminButtonProps>(function AdminButton(
  { icon, label, onClick, primary, active },
  ref,
) {
  const isPrimary = !!primary;
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      style={{
        height: 32,
        padding: '0 12px',
        borderRadius: 16,
        border: isPrimary ? 'none' : `1px solid ${active ? PRIMARY : '#dee0e3'}`,
        background: isPrimary ? PRIMARY : active ? '#e8f3ff' : '#fff',
        color: isPrimary ? '#fff' : active ? PRIMARY : '#1f2329',
        fontSize: 13,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
        boxShadow: isPrimary ? '0 1px 4px rgba(51,112,255,0.25)' : 'none',
      }}
    >
      {icon}
      {label}
    </button>
  );
});

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 19V5M4 19h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 15l3.5-4.5L15 13l4-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchDocIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M8 4h7l3 3v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="13" r="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M14 15l2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M10 6H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 4h6v6M20 4l-9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

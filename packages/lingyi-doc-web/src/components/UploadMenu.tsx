import React, { useEffect, useRef } from 'react';

interface UploadMenuProps {
  open: boolean;
  onClose: () => void;
  onUploadFile: () => void;
  onStub: (name: string) => void;
}

export const UploadMenu: React.FC<UploadMenuProps> = ({ open, onClose, onUploadFile, onStub }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const items = [
    {
      key: 'file',
      label: '上传文件',
      icon: (
        <span style={{ width: 28, height: 28, borderRadius: 6, background: '#fef3e6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f57c00" strokeWidth="2">
            <path d="M12 16V4M8 8l4-4 4 4" /><path d="M4 20h16" />
          </svg>
        </span>
      ),
      onClick: () => { onUploadFile(); onClose(); },
    },
    {
      key: 'folder',
      label: '上传文件夹',
      icon: (
        <span style={{ width: 28, height: 28, borderRadius: 6, background: '#fef9e6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#f9ab00"><path d="M4 8h6l2 2h8v10H4V8z" /></svg>
        </span>
      ),
      onClick: () => { onStub('上传文件夹'); onClose(); },
    }
  ];

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        left: 0,
        top: '100%',
        marginTop: 4,
        width: 220,
        background: '#fff',
        border: '1px solid #dee0e3',
        borderRadius: 8,
        boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
        zIndex: 200,
        padding: '6px 0',
      }}
    >
      {items.map(item => (
        <button
          key={item.key}
          type="button"
          onClick={item.onClick}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', border: 'none', background: 'transparent',
            cursor: 'pointer', fontSize: 14, color: '#1f2329', textAlign: 'left',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#f5f6f7'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
};

interface UploadCardProps {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onUploadFile: () => void;
  onStub: (name: string) => void;
  disabled?: boolean;
}

export const UploadCard: React.FC<UploadCardProps> = ({
  open, onToggle, onClose, onUploadFile, onStub, disabled,
}) => (
  <div style={{ position: 'relative', minWidth: 0, width: '100%' }}>
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        border: `1px solid ${open ? '#dee0e3' : '#e8e9eb'}`,
        borderRadius: 8,
        background: open ? '#fafafa' : '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.7 : 1,
        textAlign: 'left',
      }}
    >
      <span style={{
        width: 36, height: 36, borderRadius: 8, background: '#fef3e6', flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f57c00" strokeWidth="1.8">
          <path d="M12 16V4M8 8l4-4 4 4" /><path d="M4 20h16" />
        </svg>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#1f2329', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>上传</div>
        <div style={{ fontSize: 12, color: '#8f959e', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>支持 Word、Markdown、Excel</div>
      </div>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2">
        <path d={open ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} />
      </svg>
    </button>
    <UploadMenu open={open} onClose={onClose} onUploadFile={onUploadFile} onStub={onStub} />
  </div>
);

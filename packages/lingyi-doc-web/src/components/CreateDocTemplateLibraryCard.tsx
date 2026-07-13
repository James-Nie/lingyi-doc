import React from 'react';

interface CreateDocTemplateLibraryCardProps {
  onClick: () => void;
}

/** 快捷操作「模板库」卡片 */
export const CreateDocTemplateLibraryCard: React.FC<CreateDocTemplateLibraryCardProps> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      minWidth: 0,
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '14px 16px',
      border: '1px solid #e8e9eb',
      borderRadius: 8,
      background: '#fff',
      cursor: 'pointer',
      textAlign: 'left',
      boxSizing: 'border-box',
    }}
    onMouseEnter={e => { e.currentTarget.style.background = '#fafafa'; }}
    onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
  >
    <span style={{
      width: 36,
      height: 36,
      borderRadius: 8,
      background: '#f3e8fd',
      flexShrink: 0,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9333ea" strokeWidth="1.8">
        <rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" />
        <rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" />
      </svg>
    </span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        fontSize: 14,
        fontWeight: 500,
        color: '#1f2329',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        模板库
      </div>
      <div style={{
        fontSize: 12,
        color: '#8f959e',
        marginTop: 2,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        选择模板快速创建
      </div>
    </div>
  </button>
);

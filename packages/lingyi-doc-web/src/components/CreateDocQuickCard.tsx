import React from 'react';
import { CreateDocMenu, type CreateDocType } from './CreateDocMenu';

interface CreateDocQuickCardProps {
  menuOpen: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onClose: () => void;
  onCreate: (type: CreateDocType) => void;
  onStub: (name: string) => void;
  onCreateKnowledgeBase?: () => void;
}

/** 主页/知识库列表页「新建」快捷卡片 + 类型选择菜单 */
export const CreateDocQuickCard: React.FC<CreateDocQuickCardProps> = ({
  menuOpen,
  disabled = false,
  onToggle,
  onClose,
  onCreate,
  onStub,
  onCreateKnowledgeBase,
}) => (
  <div style={{ minWidth: 0, position: 'relative' }}>
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
        border: '1px solid #e8e9eb',
        borderRadius: 8,
        background: menuOpen ? '#fafafa' : '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.7 : 1,
        textAlign: 'left',
        boxSizing: 'border-box',
      }}
      onMouseEnter={e => { if (!disabled && !menuOpen) e.currentTarget.style.background = '#fafafa'; }}
      onMouseLeave={e => { if (!menuOpen) e.currentTarget.style.background = '#fff'; }}
    >
      <span style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        background: '#e8f0fe',
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3370ff" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
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
          新建
        </div>
        <div style={{
          fontSize: 12,
          color: '#8f959e',
          marginTop: 2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          新建文档开始协作
        </div>
      </div>
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#bbb"
        strokeWidth="2"
        style={{
          transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s',
          flexShrink: 0,
        }}
      >
        <path d="M18 15l-6-6-6 6" />
      </svg>
    </button>
    <CreateDocMenu
      open={menuOpen}
      onClose={onClose}
      onCreate={onCreate}
      onStub={onStub}
      onCreateKnowledgeBase={onCreateKnowledgeBase}
    />
  </div>
);

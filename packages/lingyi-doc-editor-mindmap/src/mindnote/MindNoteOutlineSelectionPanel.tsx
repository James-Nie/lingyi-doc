import React, { useState } from 'react';
import type { MindNode } from '@lingyi-doc/core-types';
import { isMacPlatform } from '@lingyi-doc/editor-shared';
import { MN_COLORS } from './styles';

const TEXT_COLORS = [
  { value: '#F76964', bg: '#FDD9D5' },
  { value: '#FF8800', bg: '#FAE6A7' },
  { value: '#7C6CFF', bg: '#E8D4F8' },
  { value: '#3370FF', bg: '#C8D9FA' },
  { value: '#00B8A9', bg: '#C8EDE8' },
  { value: '#7EB712', bg: '#D9F5A7' },
  { value: '#8F959E', bg: '#E8E9EB' },
] as const;

function shortcutModEnter(): string {
  return isMacPlatform() ? '⌘+Enter' : 'Ctrl+Enter';
}

function shortcutModShiftDelete(): string {
  return isMacPlatform() ? '⌘+⇧+Delete' : 'Ctrl+Shift+Delete';
}

export interface MindNoteOutlineSelectionPanelProps {
  selectedIds: string[];
  totalChars: number;
  nodes: MindNode[];
  onPatch: (patch: Partial<MindNode>) => void;
  onComplete: () => void;
  onDelete: () => void;
}

export const MindNoteOutlineSelectionPanel: React.FC<MindNoteOutlineSelectionPanelProps> = ({
  selectedIds,
  totalChars,
  nodes,
  onPatch,
  onComplete,
  onDelete,
}) => {
  const [hoveredAction, setHoveredAction] = useState<'complete' | 'delete' | null>(null);
  const allCompleted = nodes.length > 0 && nodes.every(n => n.completed);

  const toggleStyle = (key: 'bold' | 'italic' | 'underline') => {
    const allOn = nodes.every(n => n[key]);
    onPatch({ [key]: allOn ? undefined : true });
  };

  return (
    <div
      data-outline-selection-panel=""
      style={{
        width: 280,
        flexShrink: 0,
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
        padding: '16px 0 12px',
        position: 'sticky',
        top: 24,
        alignSelf: 'flex-start',
      }}
    >
      <div style={{ padding: '0 16px 12px', fontSize: 13, fontWeight: 600, color: MN_COLORS.text }}>
        样式
      </div>

      <div style={{ padding: '0 16px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TEXT_COLORS.map(c => (
          <button
            key={c.value}
            type="button"
            title={c.value}
            onClick={() => {
              const allSame = nodes.every(n => n.color === c.value);
              onPatch({ color: allSame ? undefined : c.value });
            }}
            style={{
              width: 28,
              height: 28,
              border: nodes.every(n => n.color === c.value) ? `2px solid ${MN_COLORS.primary}` : 'none',
              borderRadius: 6,
              background: c.bg,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 600,
              color: c.value,
              padding: 0,
            }}
          >
            A
          </button>
        ))}
      </div>

      <div style={{ padding: '4px 16px 12px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {([1, 2, 3] as const).map(level => (
          <button
            key={level}
            type="button"
            onClick={() => {
              const allSame = nodes.every(n => n.headingLevel === level);
              onPatch({ headingLevel: allSame ? undefined : level });
            }}
            style={{
              minWidth: 32,
              height: 28,
              padding: '0 8px',
              border: 'none',
              borderRadius: 6,
              background: nodes.every(n => n.headingLevel === level) ? '#E8E9EB' : 'transparent',
              color: MN_COLORS.text,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            H{level}
          </button>
        ))}
        {([
          { key: 'bold' as const, label: 'B', style: { fontWeight: 700 } },
          { key: 'italic' as const, label: 'I', style: { fontStyle: 'italic' } },
          { key: 'underline' as const, label: 'U', style: { textDecoration: 'underline' } },
        ]).map(item => (
          <button
            key={item.key}
            type="button"
            onClick={() => toggleStyle(item.key)}
            style={{
              minWidth: 28,
              height: 28,
              padding: '0 6px',
              border: 'none',
              borderRadius: 6,
              background: nodes.every(n => n[item.key]) ? '#E8E9EB' : 'transparent',
              color: MN_COLORS.text,
              fontSize: 13,
              cursor: 'pointer',
              ...item.style,
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div style={{ height: 1, background: '#F0F1F2', margin: '4px 0' }} />

      <div style={{ padding: '8px 16px 4px', fontSize: 13, fontWeight: 600, color: MN_COLORS.text }}>
        常用
      </div>

      <button
        type="button"
        onMouseEnter={() => setHoveredAction('complete')}
        onMouseLeave={() => setHoveredAction(null)}
        onClick={onComplete}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px',
          border: 'none',
          background: hoveredAction === 'complete' ? '#F7F8FA' : 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: `2px solid ${allCompleted ? MN_COLORS.primary : '#C9CDD4'}`,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {allCompleted && (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <path d="M2 5l2 2 4-4" stroke={MN_COLORS.primary} strokeWidth="1.6" fill="none" strokeLinecap="round" />
            </svg>
          )}
        </span>
        <span style={{ flex: 1, fontSize: 14, color: MN_COLORS.text }}>完成</span>
        <span style={{ fontSize: 12, color: '#8F959E' }}>{shortcutModEnter()}</span>
      </button>

      <button
        type="button"
        onMouseEnter={() => setHoveredAction('delete')}
        onMouseLeave={() => setHoveredAction(null)}
        onClick={onDelete}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px',
          border: 'none',
          background: hoveredAction === 'delete' ? '#F7F8FA' : 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ width: 18, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v12a2 2 0 01-2 2H8a2 2 0 01-2-2V7h12z" stroke="#FF8800" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <span style={{ flex: 1, fontSize: 14, color: MN_COLORS.text }}>删除</span>
        <span style={{ fontSize: 12, color: '#8F959E' }}>{shortcutModShiftDelete()}</span>
      </button>

      <div style={{ height: 1, background: '#F0F1F2', margin: '8px 0 0' }} />

      <div style={{ padding: '10px 16px 0', fontSize: 12, color: '#8F959E', lineHeight: '20px' }}>
        <div>已选择节点数：{selectedIds.length}</div>
        <div>已选择总字数：{totalChars}</div>
      </div>
    </div>
  );
};

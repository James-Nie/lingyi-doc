import React, { useCallback, useRef, useState } from 'react';
import type { OutlineNode } from '@lingyi-doc/core-doc';
import { DOC_COLORS } from './styles';

interface DocOutlineProps {
  nodes: OutlineNode[];
  activeId: string | null;
  onNavigate: (blockId: string) => void;
}

export const DocOutline: React.FC<DocOutlineProps> = ({ nodes, activeId, onNavigate }) => {
  const [width, setWidth] = useState(240);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startW: width };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - ev.clientX;
      setWidth(Math.max(180, Math.min(360, dragRef.current.startW + delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [width]);

  return (
    <div style={{
      width,
      flexShrink: 0,
      borderLeft: `1px solid ${DOC_COLORS.border}`,
      background: '#fff',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
    }}>
      <div
        onMouseDown={onMouseDown}
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
          cursor: 'col-resize', zIndex: 1,
        }}
      />
      <div style={{
        padding: '12px 16px', fontSize: 14, fontWeight: 600, color: DOC_COLORS.text,
        borderBottom: `1px solid ${DOC_COLORS.border}`,
      }}>
        大纲
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
        {nodes.length === 0 ? (
          <div style={{ padding: '16px', fontSize: 13, color: DOC_COLORS.muted, lineHeight: 1.6 }}>
            暂无标题，添加标题后自动生成大纲
          </div>
        ) : (
          nodes.map(node => (
            <OutlineNodeView
              key={node.id}
              node={node}
              depth={0}
              activeId={activeId}
              collapsed={collapsed}
              onToggle={toggleCollapse}
              onNavigate={onNavigate}
            />
          ))
        )}
      </div>
    </div>
  );
};

function OutlineNodeView({
  node,
  depth,
  activeId,
  collapsed,
  onToggle,
  onNavigate,
}: {
  node: OutlineNode;
  depth: number;
  activeId: string | null;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onNavigate: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.id);
  const isActive = activeId === node.id;
  const indent = depth * 16;

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '6px 12px',
          paddingLeft: 12 + indent,
          cursor: 'pointer',
          fontSize: 13,
          color: isActive ? DOC_COLORS.primary : DOC_COLORS.text,
          background: isActive ? '#E8F3FF' : 'transparent',
          transition: 'background 150ms',
        }}
        onClick={() => onNavigate(node.id)}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#F7F8FA'; }}
        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onToggle(node.id); }}
            style={{
              width: 16, height: 16, border: 'none', background: 'transparent',
              cursor: 'pointer', padding: 0, marginRight: 4, color: DOC_COLORS.muted,
              transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 150ms',
            }}
          >
            ▾
          </button>
        ) : (
          <span style={{ width: 20, flexShrink: 0 }} />
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.text}
        </span>
      </div>
      {hasChildren && !isCollapsed && node.children.map(child => (
        <OutlineNodeView
          key={child.id}
          node={child}
          depth={depth + 1}
          activeId={activeId}
          collapsed={collapsed}
          onToggle={onToggle}
          onNavigate={onNavigate}
        />
      ))}
    </>
  );
}

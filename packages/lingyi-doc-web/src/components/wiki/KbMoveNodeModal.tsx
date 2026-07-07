import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WikiSpaceNode } from '../../stores/knowledgeBaseStore';

interface KbMoveNodeModalProps {
  open: boolean;
  node: WikiSpaceNode | null;
  nodes: WikiSpaceNode[];
  onClose: () => void;
  onMove: (targetParentId: string | null) => Promise<void>;
}

export const KbMoveNodeModal: React.FC<KbMoveNodeModalProps> = ({
  open,
  node,
  nodes,
  onClose,
  onMove,
}) => {
  const [targetId, setTargetId] = useState<string>('root');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTargetId('root');
  }, [open, node?.id]);

  const targets = useMemo(() => {
    if (!node) return [];
    const blocked = new Set<string>([node.id]);
    return nodes.filter(item => {
      if (blocked.has(item.id)) return false;
      if (item.type === 'page' && item.isHome) return true;
      if (item.type === 'page' || !item.docId) return true;
      return false;
    });
  }, [node, nodes]);

  if (!open || !node) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 12000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="移动到"
        onMouseDown={e => e.stopPropagation()}
        style={{
          width: 420, maxWidth: '100%', background: '#fff', borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0,0,0,0.18)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee', fontSize: 16, fontWeight: 600 }}>
          移动到
        </div>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 13, color: '#646a73', marginBottom: 12 }}>
            将「{node.title}」移动到：
          </div>
          <select
            value={targetId}
            onChange={e => setTargetId(e.target.value)}
            style={{
              width: '100%', height: 36, borderRadius: 8, border: '1px solid #dee0e3',
              padding: '0 10px', fontSize: 14,
            }}
          >
            <option value="root">根目录</option>
            {targets.map(item => (
              <option key={item.id} value={item.id}>{item.title}</option>
            ))}
          </select>
        </div>
        <div style={{
          padding: '12px 20px', borderTop: '1px solid #eee',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button type="button" onClick={onClose} style={btnSecondary}>取消</button>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              void onMove(targetId === 'root' ? null : targetId).finally(() => setLoading(false));
            }}
            style={btnPrimary}
          >
            确定
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const btnSecondary: React.CSSProperties = {
  height: 32, padding: '0 16px', borderRadius: 6, border: '1px solid #dee0e3',
  background: '#fff', cursor: 'pointer', fontSize: 13,
};

const btnPrimary: React.CSSProperties = {
  height: 32, padding: '0 16px', borderRadius: 6, border: 'none',
  background: '#3370ff', color: '#fff', cursor: 'pointer', fontSize: 13,
};

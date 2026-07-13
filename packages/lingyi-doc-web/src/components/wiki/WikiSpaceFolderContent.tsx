import React from 'react';
import type { WikiSpaceNode } from '../../stores/knowledgeBaseStore';
import { getDocTypeMeta } from '../../utils/docTypeMeta';

interface WikiSpaceFolderContentProps {
  folder: WikiSpaceNode;
  childNodes: WikiSpaceNode[];
  onSelectNode: (nodeId: string) => void;
}

export const WikiSpaceFolderContent: React.FC<WikiSpaceFolderContentProps> = ({
  folder,
  childNodes,
  onSelectNode,
}) => {
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '32px 48px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <span style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: '#fef9e6',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
          }}>
            📁
          </span>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: '#1f2329' }}>
            {folder.title || '未命名文件夹'}
          </h1>
        </div>

        {childNodes.length === 0 ? (
          <div style={{
            padding: '48px 24px',
            textAlign: 'center',
            color: '#8f959e',
            fontSize: 14,
            border: '1px dashed #dee0e3',
            borderRadius: 12,
            background: '#fafbfc',
          }}>
            文件夹为空，可在左侧目录点击 + 添加文档或子文件夹
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {childNodes.map(child => {
              const docType = child.type === 'folder'
                ? 'folder'
                : child.type === 'sheet'
                  ? 'freeform'
                  : 'richtext';
              const meta = getDocTypeMeta(docType);
              return (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => onSelectNode(child.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    border: '1px solid #eee',
                    borderRadius: 8,
                    background: '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 14,
                    color: '#1f2329',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#f5f6f7'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
                >
                  <span style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: meta.bg,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    color: meta.color,
                    flexShrink: 0,
                  }}>
                    {meta.icon}
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {child.title || '未命名'}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

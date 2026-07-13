import React from 'react';
import type { ActiveCellEditor, CollabConnectionState, OnlineUser } from '@lingyi-doc/core';
import { blockLockLabel, cellRefLabel } from '@lingyi-doc/core';

interface CollabStatusBarProps {
  collabState: CollabConnectionState;
  collabUsers: OnlineUser[];
  collabViewOnly?: boolean;
  activeBlockEditor?: ActiveCellEditor | null;
  /** 表格单元格锁（兼容旧 prop 名） */
  activeCellEditor?: ActiveCellEditor | null;
  editingLabel?: string;
}

function resolveEditingLabel(editor: ActiveCellEditor): string {
  if (editor.sheetId === 'rt' || editor.sheetId.startsWith('wb:') || editor.sheetId.startsWith('mn:')) {
    return blockLockLabel(editor);
  }
  return cellRefLabel(editor.row, editor.col);
}

export const CollabStatusBar: React.FC<CollabStatusBarProps> = ({
  collabState,
  collabUsers,
  collabViewOnly = false,
  activeBlockEditor = null,
  activeCellEditor = null,
  editingLabel,
}) => {
  if (collabState !== 'connected') return null;

  const editor = activeBlockEditor ?? activeCellEditor;
  const label = editingLabel ?? (editor ? resolveEditingLabel(editor) : '');

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '2px 12px',
      borderTop: '1px solid #e8e8e8',
      background: collabViewOnly ? '#fff7e6' : '#f6ffed',
      fontSize: 11,
      color: collabViewOnly ? '#d48806' : '#389e0d',
    }}>
      {collabViewOnly && editor ? (
        <>
          <span>{editor.displayName} 正在编辑{label ? ` ${label}` : ''}</span>
          <span>·</span>
          <span>当前为查看模式</span>
        </>
      ) : (
        <>
          <span>协同已连接</span>
          <span>·</span>
          <span>{collabUsers.length} 人在线</span>
          {collabUsers.length > 0 && (
            <span style={{ color: '#666' }}>
              {collabUsers.map(u => u.displayName).join('、')}
            </span>
          )}
        </>
      )}
    </div>
  );
};

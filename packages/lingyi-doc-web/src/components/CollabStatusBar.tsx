import React from 'react';
import type { ActiveCellEditor, CollabConnectionState, OnlineUser } from '@lingyi-doc/core';
import { blockLockLabel, cellRefLabel } from '@lingyi-doc/core';

interface CollabStatusBarProps {
  collabState: CollabConnectionState;
  collabUsers: OnlineUser[];
  /** 其他人占用的区域锁列表 */
  activeEditors?: ActiveCellEditor[];
  /** @deprecated 使用 activeEditors */
  activeBlockEditor?: ActiveCellEditor | null;
  /** @deprecated 使用 activeEditors */
  activeCellEditor?: ActiveCellEditor | null;
}

function resolveEditingLabel(editor: ActiveCellEditor): string {
  if (editor.sheetId === 'rt' || editor.sheetId.startsWith('wb:') || editor.sheetId.startsWith('mn:') || editor.sheetId.startsWith('wbt:')) {
    return blockLockLabel(editor);
  }
  return cellRefLabel(editor.row, editor.col);
}

function normalizeEditors(
  activeEditors?: ActiveCellEditor[],
  activeBlockEditor?: ActiveCellEditor | null,
  activeCellEditor?: ActiveCellEditor | null,
): ActiveCellEditor[] {
  if (Array.isArray(activeEditors)) return activeEditors;
  const single = activeBlockEditor ?? activeCellEditor;
  return single ? [single] : [];
}

export const CollabStatusBar: React.FC<CollabStatusBarProps> = ({
  collabState,
  collabUsers,
  activeEditors,
  activeBlockEditor = null,
  activeCellEditor = null,
}) => {
  if (collabState === 'idle') return null;

  if (collabState === 'connecting' || collabState === 'reconnecting') {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '2px 12px',
        borderTop: '1px solid #e8e8e8',
        background: '#e6f4ff',
        fontSize: 11,
        color: '#1677ff',
      }}>
        <span>{collabState === 'reconnecting' ? '协同重连中…' : '协同连接中…'}</span>
      </div>
    );
  }

  if (collabState === 'offline') {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '2px 12px',
        borderTop: '1px solid #e8e8e8',
        background: '#fff2f0',
        fontSize: 11,
        color: '#cf1322',
      }}>
        <span>协同已断开</span>
        <span>·</span>
        <span>请刷新页面或检查网络后重试</span>
      </div>
    );
  }

  if (collabState !== 'connected') return null;

  const editors = normalizeEditors(activeEditors, activeBlockEditor, activeCellEditor);
  const hasRemoteLocks = editors.length > 0;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '2px 12px',
      borderTop: '1px solid #e8e8e8',
      background: hasRemoteLocks ? '#fff7e6' : '#f6ffed',
      fontSize: 11,
      color: hasRemoteLocks ? '#d48806' : '#389e0d',
    }}>
      <span>协同已连接</span>
      <span>·</span>
      <span>{collabUsers.length} 人在线</span>
      {collabUsers.length > 0 && (
        <span style={{ color: '#666' }}>
          {collabUsers.map(u => u.displayName).join('、')}
        </span>
      )}
      {hasRemoteLocks && (
        <>
          <span>·</span>
          <span>
            {editors.map(e => `${e.displayName} 正在编辑 ${resolveEditingLabel(e)}`).join('；')}
          </span>
        </>
      )}
    </div>
  );
};

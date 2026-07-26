import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface FormFieldDeleteDialogProps {
  visible: boolean;
  fieldName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 表单视图：删除字段确认弹窗 */
export const FormFieldDeleteDialog: React.FC<FormFieldDeleteDialogProps> = ({
  visible, fieldName, onConfirm, onCancel,
}) => {
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible, onCancel]);

  if (!visible) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 20000,
        background: 'rgba(0, 0, 0, 0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseDown={onCancel}
    >
      <div
        data-sheet-keep-selection
        style={{
          width: 420, maxWidth: 'calc(100vw - 48px)', background: '#fff',
          borderRadius: 8, boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18)',
          padding: '24px 24px 20px',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%', background: '#ff7d00',
            color: '#fff', fontSize: 14, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
          }}>
            !
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1f2329', lineHeight: '22px' }}>
              删除字段
            </div>
            <div style={{ marginTop: 8, fontSize: 14, color: '#646a73', lineHeight: '22px' }}>
              确认删除字段「{fieldName}」吗？此操作将同时删除表格视图中的字段。删除后，你可通过 撤销 (⌘+Z) 恢复原字段。
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" onClick={onCancel} style={{
            minWidth: 72, height: 32, padding: '0 16px',
            border: '1px solid #dee0e3', borderRadius: 6, background: '#fff',
            color: '#1f2329', fontSize: 14, cursor: 'pointer',
          }}>
            取消
          </button>
          <button type="button" onClick={onConfirm} style={{
            minWidth: 72, height: 32, padding: '0 16px',
            border: 'none', borderRadius: 6, background: '#f54a45',
            color: '#fff', fontSize: 14, cursor: 'pointer',
          }}>
            删除
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

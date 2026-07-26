import React from 'react';
import { createPortal } from 'react-dom';
import { Modal } from 'antd';
import { DOC_COLORS } from './styles';

interface MarkdownConvertDialogProps {
  open: boolean;
  onConvert: () => void;
  onDismiss: () => void;
}

export const MarkdownConvertDialog: React.FC<MarkdownConvertDialogProps> = ({
  open,
  onConvert,
  onDismiss,
}) => {
  const handleConvert = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onConvert();
  };

  if (!open) return null;

  return createPortal(
    <Modal
      open={open}
      title="是否需要做样式转换？"
      onCancel={onDismiss}
      footer={null}
      width={420}
      centered
      maskClosable={false}
      destroyOnClose
      zIndex={10050}
      getContainer={() => document.body}
    >
      <p style={{ margin: '8px 0 24px', fontSize: 14, color: DOC_COLORS.text, lineHeight: 1.6 }}>
        检测到粘贴内容符合 Markdown 语法，是否需要做样式转换？
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={onDismiss}
          style={{
            padding: '6px 16px', border: `1px solid ${DOC_COLORS.border}`,
            borderRadius: 4, background: '#fff', fontSize: 14, cursor: 'pointer',
            color: DOC_COLORS.text,
          }}
        >
          取消
        </button>
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={handleConvert}
          style={{
            padding: '6px 20px', border: 'none', borderRadius: 4,
            background: '#00B42A', color: '#fff', fontSize: 14, cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          立即转换
        </button>
      </div>
    </Modal>,
    document.body,
  );
};

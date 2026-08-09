import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from 'antd';
import { DOC_COLORS } from './styles';

interface DocLinkDialogProps {
  open: boolean;
  /** 预填充的标题（选中的文本） */
  initialTitle?: string;
  /** 预填充的 URL */
  initialUrl?: string;
  onConfirm: (title: string, url: string) => void;
  onCancel: () => void;
}

export const DocLinkDialog: React.FC<DocLinkDialogProps> = ({
  open,
  initialTitle = '',
  initialUrl = '',
  onConfirm,
  onCancel,
}) => {
  const [title, setTitle] = useState(initialTitle);
  const [url, setUrl] = useState(initialUrl);
  const titleRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setUrl(initialUrl);
    }
  }, [open, initialTitle, initialUrl]);

  useEffect(() => {
    if (open) {
      // 优先聚焦到标题输入框；如果标题已有值则聚焦到 URL
      const timer = setTimeout(() => {
        if (initialTitle) {
          urlRef.current?.focus();
        } else {
          titleRef.current?.focus();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open, initialTitle]);

  const handleSubmit = () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    // 如果标题为空，使用 URL 作为显示文本
    const displayTitle = title.trim() || trimmedUrl;
    onConfirm(displayTitle, trimmedUrl);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!open) return null;

  return createPortal(
    <Modal
      open={open}
      title="插入链接"
      onCancel={onCancel}
      footer={null}
      width={420}
      centered
      maskClosable={false}
      destroyOnClose
      zIndex={10050}
      getContainer={() => document.body}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 14, color: DOC_COLORS.text, fontWeight: 500 }}>
            标题
          </label>
          <input
            ref={titleRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="链接显示文本"
            style={{
              width: '100%',
              height: 36,
              borderRadius: 4,
              border: `1px solid ${DOC_COLORS.border}`,
              padding: '0 12px',
              fontSize: 14,
              color: DOC_COLORS.text,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 14, color: DOC_COLORS.text, fontWeight: 500 }}>
            链接
          </label>
          <input
            ref={urlRef}
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="https://"
            style={{
              width: '100%',
              height: 36,
              borderRadius: 4,
              border: `1px solid ${DOC_COLORS.border}`,
              padding: '0 12px',
              fontSize: 14,
              color: DOC_COLORS.text,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={onCancel}
            style={{
              padding: '6px 16px',
              border: `1px solid ${DOC_COLORS.border}`,
              borderRadius: 4,
              background: '#fff',
              fontSize: 14,
              cursor: 'pointer',
              color: DOC_COLORS.text,
            }}
          >
            取消
          </button>
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={handleSubmit}
            disabled={!url.trim()}
            style={{
              padding: '6px 20px',
              border: 'none',
              borderRadius: 4,
              background: url.trim() ? DOC_COLORS.primary : '#C9CDD4',
              color: '#fff',
              fontSize: 14,
              cursor: url.trim() ? 'pointer' : 'default',
              fontWeight: 500,
            }}
          >
            确认
          </button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
};

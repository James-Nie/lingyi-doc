import React, { useRef, useState } from 'react';
import { Modal, Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { EDITOR_COLORS } from './tokens';
import { prepareImageFileForInsert } from './docImageUtils';

const MAX_SIZE_MB = 10;

export interface InsertImagePayload {
  url: string;
  naturalWidth: number;
  naturalHeight: number;
  fileName: string;
}

interface DocImageInsertDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (payload: InsertImagePayload) => void;
  /** 自定义图片处理；默认上传 OSS 供文档使用 */
  prepareFile?: (file: File) => Promise<InsertImagePayload>;
  title?: string;
}

export const DocImageInsertDialog: React.FC<DocImageInsertDialogProps> = ({
  open,
  onClose,
  onInsert,
  prepareFile,
  title = '插入图片',
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件');
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`图片大小不能超过 ${MAX_SIZE_MB}MB`);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const payload = await (prepareFile ?? prepareImageFileForInsert)(file);
      onInsert(payload);
      onClose();
    } catch {
      setError('图片上传失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const uploadProps: UploadProps = {
    accept: 'image/jpeg,image/png,image/gif,image/webp,image/bmp,image/svg+xml',
    multiple: false,
    showUploadList: false,
    beforeUpload: file => {
      void handleFile(file);
      return false;
    },
  };

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      footer={null}
      width={480}
      destroyOnClose
      afterClose={() => { setError(null); setLoading(false); }}
    >
      <Upload.Dragger {...uploadProps} disabled={loading} style={{ padding: '16px 0' }}>
        <p style={{ marginBottom: 8 }}>
          <InboxOutlined style={{ fontSize: 40, color: EDITOR_COLORS.primary }} />
        </p>
        <p style={{ fontSize: 15, color: EDITOR_COLORS.text, margin: '0 0 4px' }}>
          点击或拖拽图片到此处
        </p>
        <p style={{ fontSize: 13, color: EDITOR_COLORS.muted, margin: 0 }}>
          支持 JPG、PNG、GIF、WebP，最大 {MAX_SIZE_MB}MB
        </p>
      </Upload.Dragger>

      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <button
          type="button"
          disabled={loading}
          onClick={() => inputRef.current?.click()}
          style={{
            padding: '6px 16px',
            border: `1px solid ${EDITOR_COLORS.border}`,
            borderRadius: 4,
            background: '#fff',
            cursor: loading ? 'default' : 'pointer',
            fontSize: 13,
            color: EDITOR_COLORS.text,
          }}
        >
          {loading ? '正在上传…' : '从本地选择图片'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/bmp,image/svg+xml"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {error && (
        <p style={{ marginTop: 12, fontSize: 13, color: '#F53F3F', textAlign: 'center' }}>{error}</p>
      )}
    </Modal>
  );
};

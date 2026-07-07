import React, { useCallback, useState } from 'react';
import { Button, List, Space, Spin, Upload, Typography } from 'antd';
import type { UploadProps } from 'antd';
import { DeleteOutlined, InboxOutlined, PaperClipOutlined, PlusOutlined } from '@ant-design/icons';
import type { BaseEditorProps } from './BaseCellEditor';
import { resolveBelowPopupStyle } from './editorUtils';
import { uploadAttachmentItems } from './attachmentUpload';

export interface AttachmentItem {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileIcon = (type: string): React.ReactNode => {
  if (type.startsWith('image/')) return '🖼️';
  if (type.includes('pdf')) return '📄';
  if (type.includes('word') || type.includes('doc')) return '📝';
  if (type.includes('excel') || type.includes('sheet')) return '📊';
  if (type.includes('zip') || type.includes('rar')) return '📦';
  return <PaperClipOutlined />;
};

/** 附件上传编辑器 */
export const AttachmentEditor: React.FC<BaseEditorProps> = ({
  rect, initialValue, onCommit, onCancel, inline,
}) => {
  const [attachments, setAttachments] = useState<AttachmentItem[]>(() => {
    if (initialValue.type === 'text' && initialValue.text) {
      try {
        return JSON.parse(initialValue.text);
      } catch {
        return [];
      }
    }
    return [];
  });
  const [uploading, setUploading] = useState(false);

  const persistAttachments = useCallback((items: AttachmentItem[]) => {
    if (items.length === 0) {
      onCommit({ type: 'empty' });
    } else {
      onCommit({ type: 'text', text: JSON.stringify(items) });
    }
  }, [onCommit]);

  const handleCommit = useCallback(() => {
    persistAttachments(attachments);
  }, [attachments, persistAttachments]);

  const addFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const newItems = await uploadAttachmentItems(files);
      setAttachments(prev => {
        const next = [...prev, ...newItems];
        if (inline) persistAttachments(next);
        return next;
      });
    } catch (err) {
      console.error('附件上传失败', err);
    } finally {
      setUploading(false);
    }
  }, [inline, persistAttachments]);

  const handleRemove = (id: string) => {
    setAttachments(prev => {
      const next = prev.filter(item => item.id !== id);
      if (inline) persistAttachments(next);
      return next;
    });
  };

  const uploadProps: UploadProps = {
    multiple: true,
    showUploadList: false,
    disabled: uploading,
    beforeUpload: file => {
      void addFiles([file]);
      return false;
    },
  };

  return (
    <div
      style={{
        ...resolveBelowPopupStyle(rect, inline, 320),
        ...(inline ? {} : {
          background: '#fff',
          border: '1px solid #d9d9d9',
          borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        }),
        padding: inline ? 0 : 16,
      }}
      onMouseDown={e => e.stopPropagation()}
      onPaste={e => {
        const items = e.clipboardData.items;
        const files: File[] = [];
        for (let i = 0; i < items.length; i++) {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
        if (files.length > 0) {
          e.preventDefault();
          void addFiles(files);
        }
      }}
    >
      <Spin spinning={uploading}>
        <Upload.Dragger {...uploadProps}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">粘贴或拖拽至这里上传</p>
          <p className="ant-upload-hint">支持图片、文档、压缩包等，上传至云端存储</p>
        </Upload.Dragger>
      </Spin>

      <Upload {...uploadProps}>
        <Button icon={<PlusOutlined />} block style={{ marginTop: 12 }} disabled={uploading}>
          添加本地文件
        </Button>
      </Upload>

      {attachments.length > 0 && (
        <List
          size="small"
          style={{ marginTop: 12, maxHeight: 200, overflowY: 'auto' }}
          dataSource={attachments}
          renderItem={item => (
            <List.Item
              actions={[
                <Button
                  key="delete"
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemove(item.id)}
                />,
              ]}
            >
              <List.Item.Meta
                avatar={
                  item.type.startsWith('image/') && item.url ? (
                    <img
                      src={item.url}
                      alt=""
                      style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4 }}
                    />
                  ) : (
                    <span style={{ fontSize: 16 }}>{getFileIcon(item.type)}</span>
                  )
                }
                title={
                  <Typography.Text ellipsis style={{ maxWidth: 200 }}>
                    {item.name}
                  </Typography.Text>
                }
                description={formatFileSize(item.size)}
              />
            </List.Item>
          )}
        />
      )}

      {!inline && (
        <Space style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" onClick={handleCommit}>确定</Button>
        </Space>
      )}
    </div>
  );
};

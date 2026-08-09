import React, { useEffect, useState } from 'react';
import { Input, Modal, message } from 'antd';
import { createNamedDocumentVersion } from '../../api/documentVersion';

export interface SaveVersionModalProps {
  open: boolean;
  docId: string;
  onClose: () => void;
  onSaved?: () => void;
}

export const SaveVersionModal: React.FC<SaveVersionModalProps> = ({
  open,
  docId,
  onClose,
  onSaved,
}) => {
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setLabel('');
      setSaving(false);
    }
  }, [open]);

  const handleOk = async () => {
    const trimmed = label.trim();
    if (!trimmed) {
      message.warning('请输入版本名称');
      return;
    }
    setSaving(true);
    try {
      await createNamedDocumentVersion(docId, trimmed);
      message.success('已另存为版本');
      onSaved?.();
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '另存为版本失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="另存为版本"
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      onOk={() => void handleOk()}
      onCancel={onClose}
      destroyOnHidden
      centered
    >
      <Input
        autoFocus
        maxLength={200}
        placeholder="请输入版本名称"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onPressEnter={() => void handleOk()}
      />
    </Modal>
  );
};

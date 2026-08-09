import React from 'react';
import { Modal, Button } from 'antd';

interface DuplicateTitleModalProps {
  title: string | null;
  onClose: () => void;
}

export const DuplicateTitleModal: React.FC<DuplicateTitleModalProps> = ({ title, onClose }) => (
  <Modal
    open={title !== null}
    title="名称重复"
    onCancel={onClose}
    footer={(
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="primary" onClick={onClose}>确认</Button>
      </div>
    )}
    width={400}
    centered
    destroyOnHidden
  >
    <div style={{ padding: '8px 0', fontSize: 14, color: '#333' }}>
      文档名称「{title}」已存在，请输入其他名称
    </div>
  </Modal>
);

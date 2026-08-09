import React, { useEffect } from 'react';
import { Form, Input, Modal } from 'antd';

export interface PositionGroupFormValues {
  name: string;
}

interface PositionGroupFormModalProps {
  open: boolean;
  initialName?: string;
  title?: string;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (values: PositionGroupFormValues) => void;
}

export const PositionGroupFormModal: React.FC<PositionGroupFormModalProps> = ({
  open,
  initialName,
  title = '新建分组',
  loading,
  onCancel,
  onSubmit,
}) => {
  const [form] = Form.useForm<PositionGroupFormValues>();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ name: initialName ?? '' });
  }, [open, form, initialName]);

  return (
    <Modal
      title={title}
      open={open}
      confirmLoading={loading}
      onCancel={onCancel}
      onOk={() => form.validateFields().then(onSubmit)}
      destroyOnClose
      width={480}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="分组名称" rules={[{ required: true, message: '请输入分组名称' }]}>
          <Input placeholder="输入分组名称" maxLength={32} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
};

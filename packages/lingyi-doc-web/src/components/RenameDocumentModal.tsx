import React, { useEffect } from 'react';
import { Form, Input, Modal } from 'antd';

interface RenameDocumentModalProps {
  open: boolean;
  initialTitle: string;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (title: string) => Promise<void>;
}

export const RenameDocumentModal: React.FC<RenameDocumentModalProps> = ({
  open,
  initialTitle,
  loading,
  onCancel,
  onSubmit,
}) => {
  const [form] = Form.useForm<{ title: string }>();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ title: initialTitle || '未命名文档' });
  }, [open, initialTitle, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    const title = values.title.trim();
    if (!title || title === initialTitle.trim()) {
      onCancel();
      return;
    }
    await onSubmit(title);
    form.resetFields();
  };

  return (
    <Modal
      title="重命名"
      open={open}
      onCancel={() => { form.resetFields(); onCancel(); }}
      onOk={() => { void handleOk(); }}
      confirmLoading={loading}
      okText="确定"
      cancelText="取消"
      destroyOnClose
      centered
    >
      <Form form={form} layout="vertical" requiredMark={false} style={{ marginTop: 8 }}>
        <Form.Item
          name="title"
          label="文档名称"
          rules={[
            { required: true, message: '请输入文档名称' },
            { max: 200, message: '名称不能超过 200 个字符' },
            { whitespace: true, message: '请输入文档名称' },
          ]}
        >
          <Input placeholder="未命名文档" maxLength={200} autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  );
};

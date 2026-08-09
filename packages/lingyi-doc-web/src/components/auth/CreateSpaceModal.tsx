import React, { useState } from 'react';
import { Form, Input, Modal } from 'antd';

interface CreateSpaceModalProps {
  open: boolean;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (name: string) => Promise<void>;
}

export const CreateSpaceModal: React.FC<CreateSpaceModalProps> = ({
  open,
  loading,
  onCancel,
  onSubmit,
}) => {
  const [form] = Form.useForm<{ name: string }>();

  const handleOk = async () => {
    const values = await form.validateFields();
    await onSubmit(values.name.trim());
    form.resetFields();
  };

  return (
    <Modal
      title="创建新空间"
      open={open}
      onCancel={() => { form.resetFields(); onCancel(); }}
      onOk={() => { void handleOk(); }}
      confirmLoading={loading}
      okText="创建"
      cancelText="取消"
      destroyOnClose
    >
      <p style={{ margin: '0 0 16px', color: '#8f959e', fontSize: 14 }}>
        填写企业名称，创建后你将成为该空间的超级管理员。
      </p>
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="name"
          label="企业名称"
          rules={[
            { required: true, message: '请输入企业名称' },
            { max: 128, message: '名称不能超过 128 个字符' },
            { whitespace: true, message: '请输入企业名称' },
          ]}
        >
          <Input placeholder="例如：xxx科技有限公司" maxLength={128} autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  );
};

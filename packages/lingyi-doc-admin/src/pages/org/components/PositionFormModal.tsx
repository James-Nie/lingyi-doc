import React, { useEffect } from 'react';
import { Form, Input, Modal, Select } from 'antd';
import type { PositionGroupNode } from '../../../types/org';
import { POSITION_AVATARS } from '../utils';

export interface PositionFormValues {
  name: string;
  groupId: string;
  avatarKey: string;
}

interface PositionFormModalProps {
  open: boolean;
  groups: PositionGroupNode[];
  defaultGroupId?: string;
  initialValues?: Partial<PositionFormValues>;
  title?: string;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (values: PositionFormValues) => void;
}

export const PositionFormModal: React.FC<PositionFormModalProps> = ({
  open,
  groups,
  defaultGroupId,
  initialValues,
  title = '新建职位',
  loading,
  onCancel,
  onSubmit,
}) => {
  const [form] = Form.useForm<PositionFormValues>();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: initialValues?.name ?? '',
      groupId: initialValues?.groupId ?? defaultGroupId ?? groups[0]?.id ?? '',
      avatarKey: initialValues?.avatarKey ?? 'avatar_0',
    });
  }, [open, defaultGroupId, groups, form, initialValues]);

  return (
    <Modal
      title={title}
      open={open}
      confirmLoading={loading}
      onCancel={onCancel}
      onOk={() => form.validateFields().then(onSubmit)}
      destroyOnClose
      width={520}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入职位名称' }]}>
          <Input placeholder="输入职位名称" maxLength={32} showCount />
        </Form.Item>
        <Form.Item name="avatarKey" label="职位头像" rules={[{ required: true }]}>
          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue, setFieldValue }) => (
              <div className="org-position-avatar-grid">
                {POSITION_AVATARS.map(a => {
                  const selected = getFieldValue('avatarKey') === a.key;
                  return (
                    <button
                      key={a.key}
                      type="button"
                      className={`org-position-avatar-item${selected ? ' selected' : ''}`}
                      onClick={() => setFieldValue('avatarKey', a.key)}
                    >
                      <span>{a.emoji}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </Form.Item>
        </Form.Item>
        <Form.Item name="groupId" label="所属分组" rules={[{ required: true, message: '请选择所属分组' }]}>
          <Select
            placeholder="选择所属分组"
            options={groups.map(g => ({ value: g.id, label: g.name }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

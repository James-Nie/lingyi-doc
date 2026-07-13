import React, { useEffect } from 'react';
import { Checkbox, Form, Input, Modal } from 'antd';
import type { TenantRoleNode } from '../../../types/org';
import { TENANT_ROLE_PERMISSION_OPTIONS } from '../utils';

export interface RoleFormValues {
  name: string;
  description?: string;
  permissions: string[];
}

interface RoleFormModalProps {
  open: boolean;
  title?: string;
  initial?: Partial<RoleFormValues>;
  isSystem?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (values: RoleFormValues) => void;
}

export const RoleFormModal: React.FC<RoleFormModalProps> = ({
  open,
  title = '新建角色',
  initial,
  isSystem = false,
  loading,
  onCancel,
  onSubmit,
}) => {
  const [form] = Form.useForm<RoleFormValues>();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: initial?.name ?? '',
      description: initial?.description ?? '',
      permissions: initial?.permissions ?? [],
    });
  }, [open, initial, form]);

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
        <Form.Item name="name" label="角色名称" rules={[{ required: true, message: '请输入角色名称' }]}>
          <Input placeholder="输入角色名称" maxLength={32} disabled={isSystem} />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input.TextArea placeholder="输入角色描述" maxLength={200} rows={3} showCount />
        </Form.Item>
        <Form.Item name="permissions" label="权限">
          <Checkbox.Group style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {TENANT_ROLE_PERMISSION_OPTIONS.map(option => (
              <Checkbox key={option.code} value={option.code}>{option.label}</Checkbox>
            ))}
          </Checkbox.Group>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export function roleToFormValues(role: TenantRoleNode): RoleFormValues {
  return {
    name: role.name,
    description: role.description ?? '',
    permissions: role.permissions ?? [],
  };
}

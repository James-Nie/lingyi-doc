import React, { useEffect } from 'react';
import { Form, Input, Modal, Select } from 'antd';
import type { OrganizationNode, TenantMember } from '../../../types/org';
import { collectOrgIds, findOrgNode, isRootOrg, orgToTreeSelectOptions, TENANT_SPACE_ORG_NAME } from '../utils';

export interface OrgFormValues {
  name: string;
  parentId?: string | null;
  leaderUserId?: string | null;
}

interface OrgFormModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  orgs: OrganizationNode[];
  members: TenantMember[];
  excludeOrgId?: string;
  initial?: { name?: string; parentId?: string | null; leaderUserId?: string | null };
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (values: OrgFormValues) => void;
}

export const OrgFormModal: React.FC<OrgFormModalProps> = ({
  open,
  mode,
  orgs,
  members,
  excludeOrgId,
  initial,
  loading,
  onCancel,
  onSubmit,
}) => {
  const [form] = Form.useForm<OrgFormValues>();

  const excludeIds = React.useMemo(() => {
    if (!excludeOrgId) return undefined;
    const node = findOrgNode(orgs, excludeOrgId);
    if (!node) return new Set([excludeOrgId]);
    return new Set(collectOrgIds(node, true));
  }, [excludeOrgId, orgs]);

  const editingOrg = excludeOrgId ? findOrgNode(orgs, excludeOrgId) : null;
  const editingRootOrg = editingOrg ? isRootOrg(editingOrg) : false;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: editingRootOrg ? TENANT_SPACE_ORG_NAME : (initial?.name ?? ''),
      parentId: initial?.parentId ?? (orgs[0]?.id ?? null),
      leaderUserId: initial?.leaderUserId ?? null,
    });
  }, [open, initial, orgs, form, editingRootOrg]);

  return (
    <Modal
      title={mode === 'create' ? '新建部门' : '编辑部门'}
      open={open}
      confirmLoading={loading}
      onCancel={onCancel}
      onOk={() => form.validateFields().then(onSubmit)}
      destroyOnClose
      width={480}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入部门名称' }]}>
          <Input placeholder="输入部门名称" maxLength={64} disabled={editingRootOrg} />
        </Form.Item>
        <Form.Item name="parentId" label="所属部门">
          <Select
            allowClear
            placeholder="选择上级部门"
            disabled={editingRootOrg}
            options={orgToTreeSelectOptions(orgs, 0, excludeIds)}
          />
        </Form.Item>
        <Form.Item name="leaderUserId" label="部门负责人">
          <Select
            allowClear
            showSearch
            placeholder="选择负责人"
            optionFilterProp="label"
            options={members.map(m => ({ value: m.userId, label: m.displayName }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

import React, { useEffect } from 'react';
import { Alert, Checkbox, Form, Input, Modal, Select } from 'antd';
import type { OrganizationNode, PositionGroupNode } from '../../../types/org';
import { flattenPositions, orgToTreeSelectOptions } from '../utils';

export interface AddMemberFormValues {
  displayName: string;
  username: string;
  contact: string;
  password: string;
  orgId?: string | null;
  positionId?: string | null;
  gender?: number | null;
  employeeId?: string | null;
}

interface AddMemberModalProps {
  open: boolean;
  orgs: OrganizationNode[];
  positionGroups: PositionGroupNode[];
  defaultOrgId?: string | null;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (values: AddMemberFormValues, continueNext: boolean) => void;
}

export const AddMemberModal: React.FC<AddMemberModalProps> = ({
  open,
  orgs,
  positionGroups,
  defaultOrgId,
  loading,
  onCancel,
  onSubmit,
}) => {
  const [form] = Form.useForm<AddMemberFormValues>();
  const [continueNext, setContinueNext] = React.useState(false);
  const positions = flattenPositions(positionGroups);

  useEffect(() => {
    if (!open) return;
    setContinueNext(false);
    form.setFieldsValue({
      displayName: '',
      username: '',
      contact: '',
      password: '',
      orgId: defaultOrgId ?? orgs[0]?.id ?? null,
      positionId: null,
      gender: null,
      employeeId: '',
    });
  }, [open, defaultOrgId, orgs, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    onSubmit(values, continueNext);
    if (continueNext) {
      form.setFieldsValue({
        displayName: '',
        username: '',
        contact: '',
        password: '',
        employeeId: '',
        gender: null,
      });
    }
  };

  return (
    <Modal
      title="单个添加"
      open={open}
      confirmLoading={loading}
      onCancel={onCancel}
      onOk={() => void handleOk()}
      destroyOnClose
      width={720}
      footer={(_, { OkBtn, CancelBtn }) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Checkbox checked={continueNext} onChange={e => setContinueNext(e.target.checked)}>
            继续添加下一条
          </Checkbox>
          <div>
            <CancelBtn />
            <OkBtn />
          </div>
        </div>
      )}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16, background: '#fff7f0', border: '1px solid #ffd8bf' }}
        message="Tips：添加成员帐号，成员通过用户名和初始密码登录系统，修改初始密码后进入组织"
      />
      <Form form={form} layout="vertical">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item name="displayName" label="姓名" rules={[{ required: true, message: '请输入真实姓名' }]}>
            <Input placeholder="输入真实姓名" />
          </Form.Item>
          <Form.Item name="username" label="登录用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="输入用户名（支持英文、数字和特殊符号）" />
          </Form.Item>
          <Form.Item name="contact" label="邮箱或手机号" rules={[{ required: true, message: '请输入邮箱或手机号' }]}>
            <Input placeholder="输入邮箱地址或手机号" />
          </Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, min: 6, message: '密码至少 6 位' }]}>
            <Input.Password placeholder="输入初始密码" />
          </Form.Item>
          <Form.Item name="orgId" label="所属部门">
            <Select allowClear placeholder="选择部门" options={orgToTreeSelectOptions(orgs)} />
          </Form.Item>
          <Form.Item name="positionId" label="职位">
            <Select
              allowClear
              placeholder="选择所属职位"
              options={positions.map(p => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>
          <Form.Item name="gender" label="性别">
            <Select
              allowClear
              placeholder="选择性别"
              options={[
                { value: 1, label: '男' },
                { value: 2, label: '女' },
              ]}
            />
          </Form.Item>
          <Form.Item name="employeeId" label="工号">
            <Input placeholder="输入工号（支持英文、数字和特殊符号）" />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
};

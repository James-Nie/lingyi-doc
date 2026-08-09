import React, { useEffect, useState } from 'react';
import { Alert, Checkbox, Form, Input, Modal, Select, Space, Typography, message } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { listRoles, addMember, updateMember } from '../../../api/org';
import type { OrganizationNode, PositionGroupNode, TenantMember, TenantRoleNode } from '../../../types/org';
import { flattenPositions, orgToTreeSelectOptions } from '../utils';

export type MemberFormMode = 'create' | 'edit';

export interface MemberFormValues {
  // create only
  displayName?: string;
  email?: string;
  phone?: string;
  password?: string;
  // shared
  orgId?: string | null;
  positionId?: string | null;
  gender?: number | null;
  employeeId?: string | null;
  // edit only
  status?: number;
  roleId?: string | null;
}

export interface AddMemberResult {
  displayName: string;
  email: string;
  phone: string | null;
  password: string;
  isNew: boolean;
}

interface MemberFormModalProps {
  open: boolean;
  mode: MemberFormMode;
  tenantId: string;
  orgs: OrganizationNode[];
  positionGroups: PositionGroupNode[];
  /** 仅 edit 模式需要：被编辑的成员 */
  member?: TenantMember | null;
  /** 仅 create 模式：默认选中的部门 */
  defaultOrgId?: string | null;
  onCancel: () => void;
  /** 成功保存后回调（create 时携带账号结果，edit 时不带） */
  onSaved: (result?: AddMemberResult) => void;
}

export const MemberFormModal: React.FC<MemberFormModalProps> = ({
  open,
  mode,
  tenantId,
  orgs,
  positionGroups,
  member,
  defaultOrgId,
  onCancel,
  onSaved,
}) => {
  const [form] = Form.useForm<MemberFormValues>();
  const [loading, setLoading] = useState(false);
  const [continueNext, setContinueNext] = useState(false);
  const [roles, setRoles] = useState<TenantRoleNode[]>([]);
  const [result, setResult] = useState<AddMemberResult | null>(null);
  const positions = flattenPositions(positionGroups);
  const isCreate = mode === 'create';

  // 加载角色列表（仅编辑模式需要）
  useEffect(() => {
    if (open && mode === 'edit') {
      listRoles(tenantId).then(setRoles).catch(() => {});
    }
  }, [open, mode, tenantId]);

  // 初始化 / 重置表单
  useEffect(() => {
    if (!open) return;
    setContinueNext(false);
    setResult(null);
    if (mode === 'create') {
      form.setFieldsValue({
        displayName: '',
        email: '',
        phone: '',
        password: '',
        orgId: defaultOrgId ?? orgs[0]?.id ?? null,
        positionId: null,
        gender: null,
        employeeId: '',
      });
    } else if (mode === 'edit' && member) {
      form.setFieldsValue({
        orgId: member.orgId ?? undefined,
        positionId: member.positionId ?? undefined,
        employeeId: member.employeeId ?? '',
        gender: member.gender ?? undefined,
        status: member.status,
        roleId: member.roleId ?? undefined,
      });
    }
  }, [open, mode, member, defaultOrgId, orgs, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    setLoading(true);
    try {
      if (mode === 'create') {
        const created = await addMember(tenantId, {
          displayName: values.displayName!,
          email: values.email!,
          phone: values.phone || undefined,
          password: values.password!,
          orgId: values.orgId ?? null,
          positionId: values.positionId ?? null,
          gender: values.gender ?? null,
          employeeId: values.employeeId || null,
        });
        message.success('成员已添加');
        const addResult: AddMemberResult = {
          displayName: created.displayName,
          email: created.email,
          phone: created.phone,
          password: values.password!,
          isNew: created.isNew,
        };
        setResult(addResult);
        onSaved(addResult);
        if (continueNext) {
          // 继续添加：清空表单字段，保留部门默认值；不关闭弹窗
          form.setFieldsValue({
            displayName: '',
            email: '',
            phone: '',
            password: '',
            employeeId: '',
            gender: null,
          });
        }
      } else {
        if (!member) return;
        await updateMember(tenantId, member.userId, {
          orgId: values.orgId ?? null,
          positionId: values.positionId ?? null,
          employeeId: values.employeeId || null,
          gender: values.gender ?? null,
          status: values.status,
          roleId: values.roleId ?? null,
        });
        message.success('成员信息已更新');
        onSaved();
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : (isCreate ? '添加失败' : '更新失败'));
    } finally {
      setLoading(false);
    }
  };

  const copyAccountInfo = () => {
    if (!result) return;
    const lines = [
      `姓名：${result.displayName}`,
      `登录邮箱：${result.email}`,
      result.phone ? `手机号：${result.phone}` : '',
      ...(result.isNew ? [`初始密码：${result.password}`] : []),
      '登录地址：零一文档主站（/login）',
      ...(result.isNew ? ['首次登录后请修改密码'] : []),
    ].filter(Boolean);
    void navigator.clipboard.writeText(lines.join('\n'));
  };

  const closeResult = () => {
    setResult(null);
    if (!continueNext) {
      onCancel();
    }
  };

  const title = isCreate ? '添加成员' : '编辑成员';

  return (
    <>
      <Modal
        title={title}
        open={open && !result}
        confirmLoading={loading}
        onCancel={onCancel}
        onOk={() => void handleOk()}
        destroyOnClose
        width={720}
        footer={isCreate ? (_, { OkBtn, CancelBtn }) => (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Checkbox checked={continueNext} onChange={e => setContinueNext(e.target.checked)}>
              继续添加下一条
            </Checkbox>
            <div>
              <CancelBtn />
              <OkBtn />
            </div>
          </div>
        ) : undefined}
      >
        {isCreate && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16, background: '#fff7f0', border: '1px solid #ffd8bf' }}
            message="用于创建新成员账号（邮箱/手机号已在系统注册时将无法创建，请改用「邀请已有用户」）。成员将使用「邮箱」和初始密码登录零一文档主站（/login），首次登录后需修改密码。"
          />
        )}
        <Form form={form} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            {isCreate && (
              <>
                <Form.Item name="displayName" label="姓名" rules={[{ required: true, message: '请输入真实姓名' }]}>
                  <Input placeholder="输入真实姓名" />
                </Form.Item>
                <Form.Item
                  name="email"
                  label="邮箱"
                  rules={[
                    { required: true, message: '请输入邮箱' },
                    { type: 'email', message: '邮箱格式不正确' },
                  ]}
                >
                  <Input placeholder="输入邮箱地址，作为登录账号" />
                </Form.Item>
                <Form.Item
                  name="phone"
                  label="手机号"
                  rules={[{ pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确' }]}
                >
                  <Input placeholder="输入手机号（可选）" />
                </Form.Item>
                <Form.Item
                  name="password"
                  label="初始密码"
                  rules={[{ required: true, message: '请输入初始密码' }]}
                >
                  <Input.Password placeholder="输入初始密码（至少 8 位，含字母和数字）" />
                </Form.Item>
              </>
            )}
            <Form.Item name="orgId" label="所属部门">
              <Select allowClear placeholder="选择部门" options={orgToTreeSelectOptions(orgs)} />
            </Form.Item>
            <Form.Item name="positionId" label="职位">
              <Select
                allowClear
                placeholder="选择职位"
                options={positions.map(p => ({ value: p.id, label: p.name }))}
              />
            </Form.Item>
            <Form.Item name="employeeId" label="工号">
              <Input placeholder="输入工号" />
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
            {!isCreate && (
              <>
                <Form.Item name="status" label="状态">
                  <Select
                    options={[
                      { value: 1, label: '正常' },
                      { value: 0, label: '已禁用' },
                    ]}
                  />
                </Form.Item>
                <Form.Item name="roleId" label="角色">
                  <Select
                    allowClear
                    placeholder="选择角色"
                    options={roles.map(r => ({ value: r.id, label: r.name }))}
                  />
                </Form.Item>
              </>
            )}
          </div>
        </Form>
      </Modal>

      <Modal
        title="成员添加成功"
        open={Boolean(result)}
        onOk={closeResult}
        onCancel={closeResult}
        cancelButtonProps={{ style: { display: 'none' } }}
        okText="知道了"
      >
        {result && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Typography.Text>
              <strong>{result.displayName}</strong> {result.isNew ? '已创建并加入组织' : '已加入组织'}
            </Typography.Text>
            <Typography.Text type="secondary">
              登录邮箱：<Typography.Text copyable>{result.email}</Typography.Text>
            </Typography.Text>
            {result.phone && (
              <Typography.Text type="secondary">
                手机号：<Typography.Text copyable>{result.phone}</Typography.Text>
              </Typography.Text>
            )}
            {result.isNew ? (
              <>
                <Typography.Text type="secondary">
                  初始密码：<Typography.Text copyable>{result.password}</Typography.Text>
                </Typography.Text>
                <Alert
                  type="warning"
                  showIcon
                  message="请提醒成员首次登录后修改密码，或复制下方账号信息发送给成员。"
                />
              </>
            ) : (
              <Alert
                type="info"
                showIcon
                message="该成员已存在，本次未重置其密码，可直接使用原有密码登录零一文档主站（/login）。如需重置密码请先联系该成员确认。"
              />
            )}
            <Typography.Link onClick={copyAccountInfo}>
              <CopyOutlined /> 复制账号信息
            </Typography.Link>
          </Space>
        )}
      </Modal>
    </>
  );
};

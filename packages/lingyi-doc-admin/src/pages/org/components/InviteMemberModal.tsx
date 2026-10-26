import React, { useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Modal, Select, Space, Tag, TreeSelect, Typography, message } from 'antd';
import { SearchOutlined, UserAddOutlined } from '@ant-design/icons';
import type { OrganizationNode, PositionGroupNode, SearchUserResult } from '../../../types/org';
import { searchUsers, inviteMember } from '../../../api/org';
import { flattenPositions, orgToTreeSelectOptions } from '../utils';

interface InviteMemberModalProps {
  open: boolean;
  tenantId: string;
  orgs: OrganizationNode[];
  positionGroups: PositionGroupNode[];
  defaultOrgId?: string | null;
  loading?: boolean;
  onCancel: () => void;
  onInvited: () => void;
}

interface InviteFormValues {
  orgId?: string | null;
  positionId?: string | null;
  tenantRole?: number;
}

/** 邀请已在系统注册的用户加入当前组织 */
export const InviteMemberModal: React.FC<InviteMemberModalProps> = ({
  open,
  tenantId,
  orgs,
  positionGroups,
  defaultOrgId,
  loading,
  onCancel,
  onInvited,
}) => {
  const [searching, setSearching] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<SearchUserResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<SearchUserResult | null>(null);
  const [inviting, setInviting] = useState(false);
  const [form] = Form.useForm<InviteFormValues>();
  const positions = flattenPositions(positionGroups);

  useEffect(() => {
    if (!open) {
      setKeyword('');
      setResults([]);
      setSearched(false);
      setSelected(null);
      form.resetFields();
    }
  }, [open, form]);

  const handleSearch = async () => {
    const raw = keyword.trim();
    if (!raw) {
      message.warning('请输入手机号或邮箱');
      return;
    }
    setSearching(true);
    try {
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
      const data = await searchUsers(tenantId, isEmail ? undefined : raw, isEmail ? raw : undefined);
      setResults(data.users);
      setSearched(true);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '搜索失败');
    } finally {
      setSearching(false);
    }
  };

  const openInviteForm = (user: SearchUserResult) => {
    setSelected(user);
    form.setFieldsValue({
      orgId: defaultOrgId ?? orgs[0]?.id ?? null,
      positionId: null,
      tenantRole: 3,
    });
  };

  const handleInvite = async (values: InviteFormValues) => {
    if (!selected) return;
    setInviting(true);
    try {
      await inviteMember(tenantId, {
        userId: selected.id,
        orgId: values.orgId ?? null,
        positionId: values.positionId ?? null,
        tenantRole: values.tenantRole ?? 3,
      });
      message.success(`已向 ${selected.displayName} 发送邀请，待对方确认`);
      setSelected(null);
      onInvited();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '邀请失败');
    } finally {
      setInviting(false);
    }
  };

  return (
    <Modal
      title={selected ? '邀请确认' : '邀请已有用户'}
      open={open}
      onCancel={selected ? () => setSelected(null) : onCancel}
      footer={
        selected ? (
          <>
            <Button onClick={() => setSelected(null)}>上一步</Button>
            <Button type="primary" loading={inviting} onClick={() => void form.submit()}>
              发送邀请
            </Button>
          </>
        ) : null
      }
      destroyOnHidden
      width={620}
    >
      {!selected ? (
        <>
          <Alert
            type="info"
            showIcon
            message="邀请已在系统注册的用户加入当前组织，对方登录后需确认接受。"
            style={{ marginBottom: 16 }}
          />
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="输入手机号或邮箱搜索已注册用户"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onPressEnter={() => void handleSearch()}
            />
            <Button type="primary" loading={searching} onClick={() => void handleSearch()}>
              搜索
            </Button>
          </div>

          {searched && (
            results.length === 0 ? (
              <Typography.Text type="secondary">未找到已注册用户，请确认手机号或邮箱是否正确</Typography.Text>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {results.map(u => (
                  <div
                    key={u.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px', border: '1px solid #e5e6eb', borderRadius: 8,
                    }}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%', background: '#1677ff',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, flexShrink: 0,
                    }}>
                      {(u.displayName || '?').slice(0, 1).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: '#1f2329' }}>{u.displayName}</div>
                      <div style={{ fontSize: 12, color: '#8f959e' }}>
                        {u.phone ? `${u.phone} · ` : ''}{u.email}
                      </div>
                    </div>
                    {u.isMember ? (
                      <Tag color="default">已是成员</Tag>
                    ) : (
                      <Button type="primary" ghost size="small" icon={<UserAddOutlined />} onClick={() => openInviteForm(u)}>
                        邀请
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%', background: '#1677ff',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
            }}>
              {(selected.displayName || '?').slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#1f2329' }}>{selected.displayName}</div>
              <div style={{ fontSize: 12, color: '#8f959e' }}>
                {selected.phone ? `${selected.phone} · ` : ''}{selected.email}
              </div>
            </div>
          </div>

          <Form form={form} layout="vertical" onFinish={handleInvite} requiredMark={false}>
            <Form.Item name="orgId" label="所属部门">
              <TreeSelect
                allowClear
                placeholder="选择部门"
                treeData={orgToTreeSelectOptions(orgs)}
                treeDefaultExpandAll={false}
              />
            </Form.Item>
            <Form.Item name="positionId" label="职位">
              <Select
                allowClear
                placeholder="选择所属职位"
                options={positions.map(p => ({ value: p.id, label: p.name }))}
              />
            </Form.Item>
            <Form.Item name="tenantRole" label="组织角色" initialValue={3}>
              <Select
                options={[
                  { value: 3, label: '成员' },
                  { value: 2, label: '管理员' },
                ]}
              />
            </Form.Item>
          </Form>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert type="warning" showIcon message="对方登录零一文档后需在「待确认的邀请」中接受，方可加入本组织。" />
          </Space>
        </div>
      )}
    </Modal>
  );
};
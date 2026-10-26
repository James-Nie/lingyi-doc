import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Drawer,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { authStore } from '../../stores/authStore';
import { tenantStore } from '../../stores/tenantStore';
import { groupApi, roleApi, type AdminGroupItem, type AdminRoleItem } from '../../api/adminConsole';
import { listAdmins, type AdminUserItem } from '../../api/admins';
import { listOrganizations } from '../../api/org';
import type { OrganizationNode } from '../../types/org';
import { formatDateTime, scopeTypeLabel } from '../../utils/format';

interface OrgOption {
  value: string;
  label: string;
}

/** 把部门树拍平为带缩进的下拉选项 */
function flattenOrgTree(nodes: OrganizationNode[], depth = 0, acc: OrgOption[] = []): OrgOption[] {
  for (const node of nodes) {
    acc.push({ value: node.id, label: `${'　'.repeat(depth)}${node.name}` });
    if (node.children?.length) flattenOrgTree(node.children, depth + 1, acc);
  }
  return acc;
}

/**
 * 管理组（P0-3）：成员 + 角色 + 管理范围。
 *
 * 对标飞书/钉钉「管理组」，解决「只能给管理员一个全局角色」的问题：
 * 现在可以把「张三、李四」放进「华东区运营」组，授予「运营」角色，
 * 管理范围限定为「华东大区」及其子部门。
 */
export const AdminGroupsPage: React.FC = () => {
  const [groups, setGroups] = useState<AdminGroupItem[]>([]);
  const [roles, setRoles] = useState<AdminRoleItem[]>([]);
  const [admins, setAdmins] = useState<AdminUserItem[]>([]);
  const [orgOptions, setOrgOptions] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm] = Form.useForm<{ code: string; name: string; description?: string; scopeType: 'all' | 'org' }>();

  const [current, setCurrent] = useState<AdminGroupItem | null>(null);
  const [orgs, setOrgs] = useState<Array<{ orgId: string; includeChildren: boolean }>>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const tenantId = tenantStore.getState().tenantId;
  const canWrite = authStore.hasPermission('admin_group:write');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [groupRes, roleRes, adminRes] = await Promise.all([
        groupApi.list(),
        roleApi.list(),
        listAdmins(1, 200),
      ]);
      setGroups(groupRes.items);
      setRoles(roleRes.items);
      setAdmins(adminRes.items);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!tenantId) return;
    void (async () => {
      try {
        const tree = await listOrganizations(tenantId);
        setOrgOptions(flattenOrgTree(tree));
      } catch {
        setOrgOptions([]);
      }
    })();
  }, [tenantId]);

  /** 用服务端返回的完整管理组数据填充抽屉表单（含成员 ID，避免覆盖式保存误清空） */
  const syncDrawer = (group: AdminGroupItem) => {
    setCurrent(group);
    setOrgs(group.orgs.map((o) => ({ orgId: o.id, includeChildren: o.includeChildren })));
    setRoleIds(group.roles.map((r) => r.id));
    setMemberIds(group.memberIds ?? []);
  };

  const openDetail = async (group: AdminGroupItem) => {
    try {
      const detail = await groupApi.detail(group.id);
      syncDrawer(detail);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载详情失败');
    }
  };

  const submitCreate = async () => {
    const values = await createForm.validateFields();
    setCreating(true);
    try {
      await groupApi.create({
        code: values.code,
        name: values.name,
        description: values.description ?? null,
        scopeType: values.scopeType,
      });
      message.success('管理组已创建');
      setCreateOpen(false);
      createForm.resetFields();
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const saveRoles = async () => {
    if (!current) return;
    setSaving(true);
    try {
      await groupApi.setRoles(current.id, roleIds);
      message.success('角色已保存');
      await openDetail(current);
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const saveOrgs = async () => {
    if (!current) return;
    setSaving(true);
    try {
      const res = await groupApi.setOrgs(current.id, orgs);
      message.success(
        `管理范围已保存${res.invalidRejected.length ? `，${res.invalidRejected.length} 个部门无效被跳过` : ''}`,
      );
      await openDetail(current);
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const saveMembers = async () => {
    if (!current) return;
    // 从后端详情无法直接拿到成员列表（列表接口不含成员），因此仅在用户实际操作过选择框时提交
    setSaving(true);
    try {
      const res = await groupApi.setMembers(current.id, memberIds);
      message.success(
        `成员已保存（${res.memberCount} 人）${res.invalidRejected.length ? `，${res.invalidRejected.length} 个非管理员账号被跳过` : ''}`,
      );
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const remove = (group: AdminGroupItem) => {
    Modal.confirm({
      title: '确认删除管理组',
      content: `将删除管理组「${group.name}」，其 ${group.memberCount} 名成员会立即失去该组带来的权限。若该组是唯一的超级管理员来源，删除会被拒绝。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await groupApi.remove(group.id);
          message.success('管理组已删除');
          void load();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  };

  const columns: TableColumnsType<AdminGroupItem> = [
    {
      title: '管理组',
      dataIndex: 'name',
      width: 220,
      render: (name: string, record) => (
        <Space direction="vertical" size={0}>
          <Space>
            <TeamOutlined style={{ color: '#1677ff' }} />
            <a onClick={() => void openDetail(record)}>{name}</a>
            {record.isSystem && <Tag color="blue">系统</Tag>}
          </Space>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>{record.code}</span>
        </Space>
      ),
    },
    { title: '描述', dataIndex: 'description', ellipsis: true, render: (v: string | null) => v || '—' },
    {
      title: '管理范围',
      dataIndex: 'scopeType',
      width: 220,
      render: (type: 'all' | 'org', record) =>
        type === 'all' ? (
          <Tag color="red">全平台</Tag>
        ) : (
          <Space wrap size={4}>
            <Tag color="gold">{scopeTypeLabel(type)}</Tag>
            {record.orgs.slice(0, 2).map((o) => <Tag key={o.id}>{o.name}</Tag>)}
            {record.orgs.length > 2 && <Tag>+{record.orgs.length - 2}</Tag>}
            {!record.orgs.length && <span style={{ color: '#8c8c8c', fontSize: 12 }}>未指定部门</span>}
          </Space>
        ),
    },
    {
      title: '角色',
      dataIndex: 'roles',
      width: 200,
      render: (rs: AdminGroupItem['roles']) =>
        rs.length ? <Space wrap size={4}>{rs.map((r) => <Tag key={r.id} color="blue">{r.name}</Tag>)}</Space> : <Tag>未分配</Tag>,
    },
    {
      title: '成员',
      dataIndex: 'memberCount',
      width: 80,
      align: 'center',
      render: (n: number) => <Tag>{n}</Tag>,
    },
    {
      title: '操作',
      width: 140,
      fixed: 'right',
      render: (_: unknown, record) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => void openDetail(record)}>配置</Button>
          <Tooltip title={record.isSystem ? '系统管理组不可删除' : ''}>
            <Button
              type="link"
              size="small"
              danger
              disabled={!canWrite || record.isSystem}
              onClick={() => remove(record)}
            >
              删除
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="什么是管理组"
        description="管理组 = 一批管理员 + 一组角色 + 一个管理范围。它让「部门管理员」这类诉求成为可能：只给某人某部门的权限，而不是全平台。对应等保三级「最小权限与权限分离」要求。"
      />
      <Card
        title="管理组"
        extra={
          canWrite && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建管理组
            </Button>
          )
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={groups}
          columns={columns}
          pagination={false}
          scroll={{ x: 1100 }}
          locale={{ emptyText: '暂无管理组' }}
        />
      </Card>

      <Modal
        title="新建管理组"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void submitCreate()}
        confirmLoading={creating}
        okText="创建"
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" initialValues={{ scopeType: 'org' }}>
          <Form.Item
            label="管理组标识"
            name="code"
            rules={[
              { required: true, message: '请输入标识' },
              { pattern: /^[a-z][a-z0-9_]{2,49}$/, message: '3~50 位小写字母/数字/下划线，字母开头' },
            ]}
            extra="用于程序判断，创建后不可修改"
          >
            <Input placeholder="例如 east_china_ops" />
          </Form.Item>
          <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
            <Input maxLength={100} placeholder="例如 华东区运营" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} maxLength={200} showCount />
          </Form.Item>
          <Form.Item
            label="管理范围"
            name="scopeType"
            extra="选「按部门」后需在配置页指定具体部门；「全平台」等价于不受部门限制。"
          >
            <Radio.Group>
              <Radio.Button value="org">按部门</Radio.Button>
              <Radio.Button value="all">全平台</Radio.Button>
            </Radio.Group>
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={current ? `配置管理组 · ${current.name}` : '配置管理组'}
        width={560}
        open={!!current}
        onClose={() => setCurrent(null)}
        destroyOnHidden
      >
        {current && (
          <>
            <Alert
              type={current.scopeType === 'all' ? 'warning' : 'info'}
              showIcon
              style={{ marginBottom: 16 }}
              message={current.scopeType === 'all' ? '该组为全平台范围' : '该组按部门范围'}
              description={
                current.scopeType === 'all'
                  ? '成员将能访问平台内全部数据，请谨慎添加成员。'
                  : '成员只能看到管理范围内部门的文档与数据。'
              }
            />

            <Typography.Title level={5}>管理范围（部门）</Typography.Title>
            <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
              勾选「含子部门」表示该部门及其所有下级部门都在范围内。
            </Typography.Paragraph>
            <Space direction="vertical" style={{ width: '100%' }}>
              {orgs.map((o, idx) => (
                <Space key={`${o.orgId}-${idx}`} style={{ width: '100%' }} align="center">
                  <Select
                    showSearch
                    style={{ width: 300 }}
                    value={o.orgId}
                    optionFilterProp="label"
                    options={orgOptions}
                    onChange={(value) =>
                      setOrgs((prev) => prev.map((x, i) => (i === idx ? { ...x, orgId: value } : x)))
                    }
                  />
                  <Switch
                    checkedChildren="含子部门"
                    unCheckedChildren="仅本级"
                    checked={o.includeChildren}
                    onChange={(checked) =>
                      setOrgs((prev) => prev.map((x, i) => (i === idx ? { ...x, includeChildren: checked } : x)))
                    }
                  />
                  <Button
                    type="link"
                    danger
                    onClick={() => setOrgs((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    移除
                  </Button>
                </Space>
              ))}
              <Button
                type="dashed"
                block
                onClick={() => setOrgs((prev) => [...prev, { orgId: '', includeChildren: true }])}
              >
                + 添加部门
              </Button>
              <Button
                type="primary"
                disabled={!canWrite || saving}
                loading={saving}
                onClick={() => void saveOrgs()}
              >
                保存管理范围
              </Button>
            </Space>

            <Typography.Title level={5} style={{ marginTop: 24 }}>角色</Typography.Title>
            <Select
              mode="multiple"
              style={{ width: '100%' }}
              placeholder="选择该组携带的角色"
              value={roleIds}
              onChange={setRoleIds}
              optionFilterProp="label"
              options={roles.map((r) => ({ value: r.id, label: r.name }))}
            />
            <Button
              type="primary"
              style={{ marginTop: 12 }}
              disabled={!canWrite || saving}
              loading={saving}
              onClick={() => void saveRoles()}
            >
              保存角色
            </Button>

            <Typography.Title level={5} style={{ marginTop: 24 }}>成员</Typography.Title>
            <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
              只能添加已是「管理员」的账号；普通 C 端用户需先在「管理员管理」中添加。
              为安全起见，此处需重新勾选完整成员名单后保存（覆盖式写入）。
            </Typography.Paragraph>
            <Select
              mode="multiple"
              style={{ width: '100%' }}
              placeholder={`当前 ${current.memberCount} 人，重新勾选以覆盖`}
              value={memberIds}
              onChange={setMemberIds}
              optionFilterProp="label"
              options={admins.map((a) => ({ value: a.id, label: `${a.displayName}（${a.email}）` }))}
            />
            <Button
              type="primary"
              danger
              style={{ marginTop: 12 }}
              disabled={!canWrite || saving}
              loading={saving}
              onClick={() => void saveMembers()}
            >
              覆盖保存成员
            </Button>

            <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 24 }}>
              创建于 {formatDateTime(current.createdAt)} · 最近更新 {formatDateTime(current.updatedAt)}
            </Typography.Paragraph>
          </>
        )}
      </Drawer>
    </div>
  );
};

export default AdminGroupsPage;

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Divider,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { PlusOutlined, SafetyOutlined } from '@ant-design/icons';
import { authStore } from '../../stores/authStore';
import { roleApi, type AdminRoleItem, type PermissionGroup, type PermissionItem } from '../../api/adminConsole';

/** 业务分组 + 已剔除高危项后的可勾选权限点 */
type SelectablePermissionGroup = PermissionGroup & { selectable: PermissionItem[] };

/**
 * 角色与权限（P0-3）。
 *
 * 等保三级 8.1.4.2 d)「授予管理用户所需的最小权限，实现管理用户的权限分离」：
 * - 系统角色（超管/运营/客服/审计员）权限点不可改，只能改名称与描述
 * - 自定义角色可自由勾选权限点，但高危权限（彻底删除文档、审计清理、管理员写入等）
 *   不对自定义角色开放，后端会剔除并回显被拒项
 */
export const RolesPage: React.FC = () => {
  const [roles, setRoles] = useState<AdminRoleItem[]>([]);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminRoleItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<{ code: string; name: string; description?: string; permissions: string[] }>();
  const [rejected, setRejected] = useState<string[]>([]);

  const canWrite = authStore.hasPermission('admin_user:write');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [roleRes, permRes] = await Promise.all([roleApi.list(), roleApi.permissions()]);
      setRoles(roleRes.items);
      setGroups(permRes.groups);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setRejected([]);
    form.resetFields();
    form.setFieldsValue({ permissions: [] });
    setOpen(true);
  };

  const openEdit = (role: AdminRoleItem) => {
    setEditing(role);
    setRejected([]);
    form.setFieldsValue({
      code: role.code,
      name: role.name,
      description: role.description ?? undefined,
      permissions: role.permissions,
    });
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        const res = await roleApi.update(editing.id, {
          name: values.name,
          description: values.description ?? null,
          // 系统角色不允许改权限点，后端会拒绝，因此这里不下发
          permissionCodes: editing.isSystem ? undefined : values.permissions,
        });
        setRejected(res.rejectedSuperAdminOnly);
        message.success('角色已更新');
      } else {
        const res = await roleApi.create({
          code: values.code,
          name: values.name,
          description: values.description ?? null,
          permissionCodes: values.permissions ?? [],
        });
        setRejected(res.rejectedSuperAdminOnly);
        message.success('角色已创建');
      }
      setOpen(false);
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const remove = (role: AdminRoleItem) => {
    Modal.confirm({
      title: '确认删除角色',
      content: `将删除自定义角色「${role.name}」。若仍有管理员或管理组引用该角色，删除会被拒绝。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await roleApi.remove(role.id);
          message.success('角色已删除');
          void load();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  };

  const groupedPermissions: SelectablePermissionGroup[] = useMemo(
    () => groups.map((g) => ({
      ...g,
      selectable: g.items.filter((i) => !i.superAdminOnly),
    })).filter((g) => g.selectable.length > 0),
    [groups],
  );

  const columns: TableColumnsType<AdminRoleItem> = [
    {
      title: '角色',
      dataIndex: 'name',
      width: 200,
      render: (name: string, record) => (
        <Space direction="vertical" size={0}>
          <Space>
            {record.isSystem && <SafetyOutlined style={{ color: '#1677ff' }} />}
            <span>{name}</span>
            {record.isSystem ? <Tag color="blue">系统</Tag> : <Tag>自定义</Tag>}
          </Space>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>{record.code}</span>
        </Space>
      ),
    },
    { title: '描述', dataIndex: 'description', ellipsis: true, render: (v: string | null) => v || '—' },
    {
      title: '权限点数',
      dataIndex: 'permissions',
      width: 100,
      render: (perms: string[]) => <Tag>{perms.length}</Tag>,
    },
    {
      title: '引用情况',
      width: 180,
      render: (_: unknown, record) => (
        <Typography.Text style={{ fontSize: 12 }}>
          {record.userCount} 名管理员直接持有 · {record.groupCount} 个管理组使用
        </Typography.Text>
      ),
    },
    {
      title: '操作',
      width: 160,
      fixed: 'right',
      render: (_: unknown, record) => (
        <Space size={0}>
          <Button type="link" size="small" disabled={!canWrite} onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Tooltip title={record.isSystem ? '系统角色不可删除' : ''}>
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
        message="权限分级说明"
        description="系统角色由产品预置，权限点固定；如需「只让某人管某个部门」这类需求，请创建自定义角色后，在「管理组」中把角色与部门范围绑给成员。"
      />
      <Card
        title="角色与权限"
        extra={
          canWrite && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建角色
            </Button>
          )
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={roles}
          columns={columns}
          pagination={false}
          scroll={{ x: 900 }}
        />
      </Card>

      <Modal
        title={editing ? `编辑角色 · ${editing.name}` : '新建角色'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void submit()}
        confirmLoading={saving}
        okText="保存"
        width={720}
        destroyOnHidden
      >
        {rejected.length > 0 && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="部分高危权限未被授予"
            description={`以下权限仅超级管理员可持有，已自动剔除：${rejected.join('、')}`}
          />
        )}
        <Form form={form} layout="vertical">
          <Form.Item
            label="角色标识"
            name="code"
            rules={[
              { required: true, message: '请输入角色标识' },
              { pattern: /^[a-z][a-z0-9_]{2,49}$/, message: '3~50 位小写字母/数字/下划线，字母开头' },
            ]}
            extra={editing ? '角色标识创建后不可修改' : '用于程序判断，创建后不可修改'}
          >
            <Input disabled={!!editing} placeholder="例如 dept_manager" />
          </Form.Item>
          <Form.Item label="角色名称" name="name" rules={[{ required: true, message: '请输入角色名称' }]}>
            <Input maxLength={100} placeholder="例如 部门管理员" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} maxLength={200} showCount />
          </Form.Item>

          <Divider titlePlacement="start" plain>权限点</Divider>
          {editing?.isSystem && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="系统角色的权限点不可修改"
              description="如需调整权限组合，请新建自定义角色。"
            />
          )}
          <Form.Item name="permissions" noStyle>
            <PermissionPicker groups={groupedPermissions} disabled={!!editing?.isSystem} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

/** 分组权限勾选器（受控组件，适配 antd Form.Item） */
const PermissionPicker: React.FC<{
  value?: string[];
  onChange?: (v: string[]) => void;
  groups: SelectablePermissionGroup[];
  disabled?: boolean;
}> = ({ value = [], onChange, groups, disabled }) => {
  const toggle = (code: string, checked: boolean) => {
    const next = checked ? [...value, code] : value.filter((c) => c !== code);
    onChange?.(next);
  };
  const toggleGroup = (codes: string[], checked: boolean) => {
    const set = new Set(value);
    codes.forEach((c) => (checked ? set.add(c) : set.delete(c)));
    onChange?.([...set]);
  };

  return (
    <div>
      {groups.map((g) => {
        const codes = g.selectable.map((i) => i.code);
        const allChecked = codes.every((c) => value.includes(c));
        const someChecked = codes.some((c) => value.includes(c));
        return (
          <Card key={g.group} size="small" style={{ marginBottom: 12 }}>
            <Checkbox
              disabled={disabled}
              checked={allChecked}
              indeterminate={!allChecked && someChecked}
              onChange={(e) => toggleGroup(codes, e.target.checked)}
            >
              <b>{g.label}</b>
            </Checkbox>
            <Divider style={{ margin: '8px 0' }} />
            <Space wrap>
              {g.selectable.map((item) => (
                <Checkbox
                  key={item.code}
                  disabled={disabled}
                  checked={value.includes(item.code)}
                  onChange={(e) => toggle(item.code, e.target.checked)}
                >
                  {item.name}
                </Checkbox>
              ))}
            </Space>
          </Card>
        );
      })}
    </div>
  );
};

export default RolesPage;

import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Modal, Select, Space, Table, Tag, message } from 'antd';
import type { TableColumnsType } from 'antd';
import { PlusOutlined, UserOutlined } from '@ant-design/icons';
import { authStore } from '../../stores/authStore';
import {
  type AdminUserItem,
  type SystemRole,
  assignAdminRole,
  listAdmins,
  listSystemRoles,
  removeAdmin,
  searchUsers,
  updateAdminRole,
} from '../../api/admins';

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'red',
  operator: 'blue',
  support: 'green',
  auditor: 'orange',
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: '超级管理员',
  operator: '运营',
  support: '客服',
  auditor: '审计员',
};

const AdminUsersPage: React.FC = () => {
  const [data, setData] = useState<AdminUserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [roles, setRoles] = useState<SystemRole[]>([]);

  // Assign modal state
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; email: string; displayName: string }>>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>();
  const [selectedRoleCode, setSelectedRoleCode] = useState<string | undefined>();
  const [searching, setSearching] = useState(false);

  const canWrite = authStore.hasPermission('admin_user:write');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [result, roleList] = await Promise.all([
        listAdmins(page, pageSize),
        listSystemRoles(),
      ]);
      setData(result.items);
      setTotal(result.total);
      setRoles(roleList);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleAssign = async () => {
    if (!selectedUserId || !selectedRoleCode) {
      message.warning('请选择用户和角色');
      return;
    }
    setAssignLoading(true);
    try {
      await assignAdminRole(selectedUserId, selectedRoleCode);
      message.success('管理员已添加');
      setAssignOpen(false);
      resetAssignModal();
      void loadData();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '添加失败');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleRemove = (item: AdminUserItem) => {
    Modal.confirm({
      title: '确认移除',
      content: `确定将「${item.displayName}」的管理员身份移除吗？移除后该用户将无法登录管理后台。`,
      okText: '移除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await removeAdmin(item.id);
          message.success('管理员已移除');
          void loadData();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '移除失败');
        }
      },
    });
  };

  const handleRoleChange = async (userId: string, roleCode: string) => {
    try {
      await updateAdminRole(userId, roleCode);
      message.success('角色已更新');
      void loadData();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新失败');
    }
  };

  const handleSearchUser = async (keyword: string) => {
    setSearchKeyword(keyword);
    if (!keyword.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const result = await searchUsers(keyword.trim(), 1, 20);
      // 排除已经是管理员的用户
      const adminIds = new Set(data.map((d) => d.id));
      setSearchResults(result.items.filter((u) => !adminIds.has(u.id)));
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const resetAssignModal = () => {
    setSearchKeyword('');
    setSearchResults([]);
    setSelectedUserId(undefined);
    setSelectedRoleCode(undefined);
  };

  const columns: TableColumnsType<AdminUserItem> = [
    {
      title: '姓名',
      dataIndex: 'displayName',
      render: (name: string) => (
        <Space>
          <UserOutlined />
          <span>{name}</span>
        </Space>
      ),
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (status: string) => (
        <Tag color={status === 'active' ? 'success' : 'default'}>
          {status === 'active' ? '正常' : '已禁用'}
        </Tag>
      ),
    },
    {
      title: '角色',
      dataIndex: 'roles',
      width: 200,
      render: (roles: Array<{ code: string; name: string }>, record: AdminUserItem) => {
        if (!roles.length) return <Tag>未分配</Tag>;
        const role = roles[0];
        return canWrite ? (
          <Select
            size="small"
            value={role.code}
            style={{ width: 140 }}
            options={roles.map((r) => ({
              value: r.code,
              label: ROLE_LABELS[r.code] ?? r.name,
            }))}
            onChange={(value) => void handleRoleChange(record.id, value)}
          />
        ) : (
          <Tag color={ROLE_COLORS[role.code] ?? 'default'}>
            {ROLE_LABELS[role.code] ?? role.name}
          </Tag>
        );
      },
    },
    {
      title: '操作',
      width: 100,
      render: (_: unknown, record: AdminUserItem) => (
        <Button
          type="link"
          size="small"
          danger
          disabled={!canWrite}
          onClick={() => handleRemove(record)}
        >
          移除
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Card
        title="管理员管理"
        extra={
          canWrite && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                resetAssignModal();
                setAssignOpen(true);
              }}
            >
              添加管理员
            </Button>
          )
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={data}
          columns={columns}
          locale={{ emptyText: '暂无管理员' }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
          scroll={{ x: 700 }}
        />
      </Card>

      <Modal
        title="添加管理员"
        open={assignOpen}
        onCancel={() => {
          setAssignOpen(false);
          resetAssignModal();
        }}
        onOk={handleAssign}
        confirmLoading={assignLoading}
        okText="添加"
        okButtonProps={{ disabled: !selectedUserId || !selectedRoleCode }}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>选择用户</div>
          <Select
            showSearch
            allowClear
            style={{ width: '100%' }}
            placeholder="输入邮箱或姓名搜索用户"
            value={selectedUserId}
            notFoundContent={searching ? '搜索中…' : searchKeyword ? '未找到匹配用户' : null}
            filterOption={false}
            onSearch={handleSearchUser}
            onChange={(value) => setSelectedUserId(value)}
            options={searchResults.map((u) => ({
              value: u.id,
              label: `${u.displayName}（${u.email}）`,
            }))}
          />
        </div>
        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>选择角色</div>
          <Select
            style={{ width: '100%' }}
            placeholder="请选择角色"
            value={selectedRoleCode}
            onChange={(value) => setSelectedRoleCode(value)}
            options={roles.map((r) => ({
              value: r.code,
              label: `${r.name}（${r.description ?? ''}）`,
            }))}
          />
        </div>
      </Modal>
    </div>
  );
};

export default AdminUsersPage;
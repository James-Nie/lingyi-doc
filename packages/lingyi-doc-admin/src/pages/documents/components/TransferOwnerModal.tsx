import React, { useEffect, useState } from 'react';
import { Alert, Modal, Select, Space, Tag } from 'antd';
import { adminFetch } from '../../../stores/authStore';

interface UserOption {
  id: string;
  displayName: string;
  email: string;
  masked?: boolean;
}

interface Props {
  open: boolean;
  docCount: number;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (targetOwnerId: string) => void | Promise<void>;
}

/**
 * 文档所有权转移弹窗。
 *
 * 目标所有者必须是状态正常的 C 端用户；服务端会二次校验（业务上不允许把文档
 * 交给已禁用账号，否则文档会变成无人可管的孤儿资产）。
 */
export const TransferOwnerModal: React.FC<Props> = ({ open, docCount, loading, onCancel, onConfirm }) => {
  const [keyword, setKeyword] = useState('');
  const [options, setOptions] = useState<UserOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [target, setTarget] = useState<string | undefined>();
  const [targetLabel, setTargetLabel] = useState<string>('');

  useEffect(() => {
    if (!open) {
      setKeyword('');
      setOptions([]);
      setTarget(undefined);
      setTargetLabel('');
    }
  }, [open]);

  const search = async (value: string) => {
    setKeyword(value);
    if (!value.trim()) {
      setOptions([]);
      return;
    }
    setSearching(true);
    try {
      const res = await adminFetch<{ items: UserOption[] }>(
        `/api/v1/admin/users?keyword=${encodeURIComponent(value.trim())}&status=active&page=1&pageSize=20`,
      );
      setOptions(res.items ?? []);
    } catch {
      setOptions([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <Modal
      title="转移文档所有权"
      open={open}
      onCancel={onCancel}
      onOk={() => target && void onConfirm(target)}
      confirmLoading={loading}
      okText="确认转移"
      okButtonProps={{ disabled: !target }}
      destroyOnHidden
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message={`将把 ${docCount} 个文档的所有者变更为目标用户`}
        description="转移后原所有者会失去管理权，文档内容与协作者关系保留。目标用户必须处于「正常」状态。"
      />
      <div style={{ marginBottom: 8, fontWeight: 500 }}>目标所有者</div>
      <Select
        showSearch
        allowClear
        style={{ width: '100%' }}
        placeholder="输入姓名 / 邮箱 / 手机号搜索用户"
        value={target}
        loading={searching}
        filterOption={false}
        onSearch={(v) => void search(v)}
        onChange={(value) => {
          setTarget(value);
          const hit = options.find((o) => o.id === value);
          setTargetLabel(hit ? `${hit.displayName}（${hit.email}）` : '');
        }}
        notFoundContent={searching ? '搜索中…' : keyword ? '未找到匹配用户' : null}
        options={options.map((u) => ({
          value: u.id,
          label: (
            <Space>
              <span>{u.displayName}</span>
              <Tag>{u.email}</Tag>
            </Space>
          ),
        }))}
      />
      {target && targetLabel && (
        <p style={{ marginTop: 12, color: '#595959' }}>
          将转移给：<b>{targetLabel}</b>
        </p>
      )}
    </Modal>
  );
};

export default TransferOwnerModal;

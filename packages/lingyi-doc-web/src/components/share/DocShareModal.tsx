import React, { useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  DatePicker,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import {
  buildShareLink,
  DOC_SHARE_COLLABORATOR_OPTIONS,
  DOC_SHARE_PERMISSION_LABELS,
  DOC_SHARE_PERMISSION_OPTIONS,
  DocumentShareApi,
  type DocShareAssignablePermission,
  type DocShareCollaborator,
  type DocShareConfig,
  type DocShareJoinRequest,
  type DocSharePermissionLevel,
} from '../../api/documentShare';

interface DocShareModalProps {
  open: boolean;
  docId: string;
  tenantId: string | null;
  onClose: () => void;
  onToast?: (msg: string) => void;
}

type ShareTab = 'members' | 'link';

function toAssignable(level: DocSharePermissionLevel): DocShareAssignablePermission {
  if (level === 'comment' || level === 'edit' || level === 'read') return level;
  return 'edit'; // 历史 manage 降为可编辑
}

function toDayjs(value: string | null | undefined): Dayjs | null {
  if (!value) return null;
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed : null;
}

const permissionSelectOptions = DOC_SHARE_PERMISSION_OPTIONS.map(opt => ({
  value: opt.value,
  label: opt.label,
}));

const collaboratorSelectOptions = DOC_SHARE_COLLABORATOR_OPTIONS.map(opt => ({
  value: opt.value,
  label: opt.label,
}));

export const DocShareModal: React.FC<DocShareModalProps> = ({
  open,
  docId,
  onClose,
  onToast,
}) => {
  const [activeTab, setActiveTab] = useState<ShareTab>('members');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<DocShareConfig | null>(null);
  const [collaborators, setCollaborators] = useState<DocShareCollaborator[]>([]);
  const [joinRequests, setJoinRequests] = useState<DocShareJoinRequest[]>([]);
  const [permissionLevel, setPermissionLevel] = useState<DocShareAssignablePermission>('read');
  const [memberPermissionLevel, setMemberPermissionLevel] = useState<DocShareAssignablePermission>('read');
  const [expireTime, setExpireTime] = useState<Dayjs | null>(null);
  const [memberExpireTime, setMemberExpireTime] = useState<Dayjs | null>(null);
  const [password, setPassword] = useState('');
  const [clearPassword, setClearPassword] = useState(false);

  const [searchQ, setSearchQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchHits, setSearchHits] = useState<Array<{
    userId: string;
    displayName: string;
    email: string;
    phone: string | null;
  }>>([]);
  const [addRole, setAddRole] = useState<DocShareAssignablePermission>('read');
  const [addingUserId, setAddingUserId] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const [shareRes, memberRes] = await Promise.all([
        DocumentShareApi.getConfig(docId),
        DocumentShareApi.listCollaborators(docId),
      ]);
      setConfig(shareRes);
      setCollaborators(memberRes.items);
      setPermissionLevel(toAssignable(shareRes.permissionLevel));
      setMemberPermissionLevel(toAssignable(shareRes.memberPermissionLevel));
      setExpireTime(toDayjs(shareRes.expireTime));
      setMemberExpireTime(toDayjs(shareRes.memberExpireTime));
      setPassword('');
      setClearPassword(false);
      try {
        const requestRes = await DocumentShareApi.listJoinRequests(docId);
        setJoinRequests(requestRes.items);
      } catch {
        setJoinRequests([]);
      }
    } catch {
      setConfig(null);
      setCollaborators([]);
      setJoinRequests([]);
      onToast?.('加载分享配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setActiveTab('members');
    setSearchQ('');
    setSearchHits([]);
    setAddRole('read');
    void reload();
  }, [open, docId]);

  useEffect(() => {
    if (!open || activeTab !== 'members') return;
    const q = searchQ.trim();
    if (q.length < 2) {
      setSearchHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setSearching(true);
      void DocumentShareApi.searchUsersForCollaborator(docId, q)
        .then(res => setSearchHits(res.items))
        .catch(() => setSearchHits([]))
        .finally(() => setSearching(false));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [open, activeTab, searchQ, docId]);

  const handleSaveLink = async () => {
    setSaving(true);
    try {
      const res = await DocumentShareApi.upsert(docId, {
        permissionLevel,
        expireTime: expireTime ? expireTime.toISOString() : null,
        password: password || undefined,
        clearPassword: clearPassword || (config?.hasPassword && !password ? false : clearPassword),
      });
      setConfig(res);
      setPassword('');
      onToast?.('邀请链接已更新');
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMemberShare = async () => {
    setSaving(true);
    try {
      const res = await DocumentShareApi.upsertMemberShare(docId, {
        permissionLevel: memberPermissionLevel,
        expireTime: memberExpireTime ? memberExpireTime.toISOString() : null,
      });
      setConfig(res);
      onToast?.('成员分享已更新');
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleCloseShare = async () => {
    setSaving(true);
    try {
      await DocumentShareApi.close(docId);
      await reload();
      onToast?.('邀请链接已关闭');
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : '关闭失败');
    } finally {
      setSaving(false);
    }
  };

  const handleCloseMemberShare = async () => {
    setSaving(true);
    try {
      await DocumentShareApi.closeMemberShare(docId);
      await reload();
      onToast?.('成员分享已关闭');
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : '关闭失败');
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async (url: string | null | undefined, emptyMsg: string) => {
    const link = buildShareLink(url ?? null);
    if (!link) {
      onToast?.(emptyMsg);
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      onToast?.('链接已复制');
    } catch {
      onToast?.('复制失败，请手动复制');
    }
  };

  const handleAddCollaborator = async (userId: string) => {
    setAddingUserId(userId);
    try {
      await DocumentShareApi.addCollaborator(docId, {
        userId,
        permissionLevel: addRole,
      });
      setSearchQ('');
      setSearchHits([]);
      await reload();
      onToast?.('已添加成员');
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : '添加失败');
    } finally {
      setAddingUserId(null);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      await DocumentShareApi.removeCollaborator(docId, userId);
      await reload();
      onToast?.('已移除成员');
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : '移除失败');
    }
  };

  const handleApproveRequest = async (requestId: string) => {
    try {
      await DocumentShareApi.approveJoinRequest(docId, requestId);
      await reload();
      onToast?.('已通过申请');
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : '审核失败');
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      await DocumentShareApi.rejectJoinRequest(docId, requestId);
      await reload();
      onToast?.('已拒绝申请');
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : '操作失败');
    }
  };

  const shareLink = buildShareLink(config?.shareUrl ?? null);
  const memberShareLink = buildShareLink(config?.memberShareUrl ?? null);
  const docUrl = buildShareLink(config?.docUrl ?? null);
  const isLinkActive = config?.status === 'active';
  const isMemberShareActive = config?.memberShareStatus === 'active';

  const footer = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, width: '100%' }}>
      {activeTab === 'members' && isMemberShareActive && (
        <Button danger disabled={saving} onClick={() => void handleCloseMemberShare()} style={{ marginRight: 'auto' }}>
          关闭成员分享
        </Button>
      )}
      {activeTab === 'link' && isLinkActive && (
        <Button danger disabled={saving} onClick={() => void handleCloseShare()} style={{ marginRight: 'auto' }}>
          关闭邀请链接
        </Button>
      )}
      <Button onClick={onClose}>关闭</Button>
      {activeTab === 'members' ? (
        <Button type="primary" loading={saving} disabled={loading} onClick={() => void handleSaveMemberShare()}>
          {isMemberShareActive ? '更新成员分享' : '开启成员分享'}
        </Button>
      ) : (
        <Button type="primary" loading={saving} disabled={loading} onClick={() => void handleSaveLink()}>
          {isLinkActive ? '更新设置' : '开启邀请链接'}
        </Button>
      )}
    </div>
  );

  return (
    <Modal
      open={open}
      title={
        <Space size={8} wrap>
          <span>分享文档</span>
          {isMemberShareActive && <Tag color="blue">成员分享已开启</Tag>}
          {isLinkActive && <Tag>邀请链接已开启</Tag>}
        </Space>
      }
      onCancel={onClose}
      footer={footer}
      width={560}
      destroyOnHidden
      styles={{ body: { maxHeight: '65vh', overflow: 'auto', paddingTop: 8 } }}
    >
      <Tabs
        activeKey={activeTab}
        onChange={key => setActiveTab(key as ShareTab)}
        items={[
          { key: 'members', label: '指定成员' },
          { key: 'link', label: '邀请链接' },
        ]}
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin />
        </div>
      ) : activeTab === 'members' ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {docUrl && (
            <Field label="文档链接（拥有者与已通过成员）">
              <Space.Compact style={{ width: '100%' }}>
                <Input readOnly value={docUrl} />
                <Button onClick={() => void copyLink(config?.docUrl, '暂无文档链接')}>复制</Button>
              </Space.Compact>
            </Field>
          )}

          <Field label="搜索添加成员">
            <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
              <Input
                allowClear
                value={searchQ}
                placeholder="按名称、手机号或邮箱搜索"
                onChange={e => setSearchQ(e.target.value)}
                style={{ flex: 1 }}
              />
              <Select
                value={addRole}
                options={collaboratorSelectOptions}
                onChange={setAddRole}
                style={{ width: 120 }}
              />
            </Space.Compact>
            {(searching || searchQ.trim().length >= 2) && (
              <div
                style={{
                  maxHeight: 180,
                  overflow: 'auto',
                  border: '1px solid #f0f0f0',
                  borderRadius: 8,
                }}
              >
                {searching ? (
                  <div style={{ padding: 16, textAlign: 'center' }}><Spin size="small" /></div>
                ) : searchHits.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未找到用户" style={{ margin: '12px 0' }} />
                ) : (
                  searchHits.map(user => {
                    const name = user.displayName || user.phone || user.email;
                    const sub = [user.phone, user.email].filter(Boolean).join(' · ');
                    return (
                      <div
                        key={user.userId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 12px',
                          borderBottom: '1px solid #f5f5f5',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Typography.Text>{name}</Typography.Text>
                          {sub && (
                            <div>
                              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{sub}</Typography.Text>
                            </div>
                          )}
                        </div>
                        <Button
                          type="primary"
                          size="small"
                          loading={addingUserId === user.userId}
                          onClick={() => void handleAddCollaborator(user.userId)}
                        >
                          添加
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </Field>

          <Field label="通过链接申请时的默认权限">
            <Select
              value={memberPermissionLevel}
              options={collaboratorSelectOptions}
              onChange={setMemberPermissionLevel}
              style={{ width: '100%' }}
            />
          </Field>

          <Field label="申请链接过期时间">
            <DatePicker
              showTime
              allowClear
              value={memberExpireTime}
              onChange={setMemberExpireTime}
              placeholder="留空表示永久有效"
              style={{ width: '100%' }}
              disabledDate={current => !!current && current.endOf('day').isBefore(dayjs())}
            />
          </Field>

          {memberShareLink && isMemberShareActive && (
            <Field label="成员申请链接（需审核）">
              <Space.Compact style={{ width: '100%' }}>
                <Input readOnly value={memberShareLink} />
                <Button onClick={() => void copyLink(config?.memberShareUrl, '请先开启成员分享')}>复制</Button>
              </Space.Compact>
              <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0', fontSize: 12 }}>
                也可让对方打开链接申请加入；审核通过后可访问文档。
              </Typography.Paragraph>
            </Field>
          )}

          {joinRequests.length > 0 && (
            <Field label="待审核申请">
              {joinRequests.map(req => (
                <div
                  key={req.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 0',
                    borderBottom: '1px solid #f0f0f0',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Typography.Text>
                      {req.applicantName || req.applicantEmail || req.applicantId}
                    </Typography.Text>
                    {req.message && (
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{req.message}</Typography.Text>
                      </div>
                    )}
                  </div>
                  <Button type="primary" size="small" onClick={() => void handleApproveRequest(req.id)}>
                    通过
                  </Button>
                  <Button size="small" onClick={() => void handleRejectRequest(req.id)}>
                    拒绝
                  </Button>
                </div>
              ))}
            </Field>
          )}

          <Field label="已加入成员">
            {collaborators.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无协作者" />
            ) : (
              collaborators.map(member => (
                <div
                  key={member.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 0',
                    borderBottom: '1px solid #f0f0f0',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Typography.Text>
                      {member.displayName || member.email || member.userId}
                    </Typography.Text>
                  </div>
                  <Tag>{DOC_SHARE_PERMISSION_LABELS[member.permissionLevel]}</Tag>
                  <Button
                    type="link"
                    danger
                    size="small"
                    onClick={() => void handleRemoveMember(member.userId)}
                  >
                    移除
                  </Button>
                </div>
              ))
            )}
          </Field>
        </Space>
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Field label="链接权限">
            <Select
              value={permissionLevel}
              options={permissionSelectOptions}
              onChange={setPermissionLevel}
              style={{ width: '100%' }}
            />
          </Field>

          <Field label="过期时间">
            <DatePicker
              showTime
              allowClear
              value={expireTime}
              onChange={setExpireTime}
              placeholder="留空表示永久有效"
              style={{ width: '100%' }}
              disabledDate={current => !!current && current.endOf('day').isBefore(dayjs())}
            />
          </Field>

          <Field label="访问密码">
            <Input.Password
              value={password}
              placeholder={config?.hasPassword ? '留空则保持原密码' : '可选，留空表示无密码'}
              onChange={e => setPassword(e.target.value)}
              allowClear
            />
            {config?.hasPassword && (
              <Checkbox
                checked={clearPassword}
                onChange={e => setClearPassword(e.target.checked)}
                style={{ marginTop: 8 }}
              >
                清除密码
              </Checkbox>
            )}
          </Field>

          {shareLink && isLinkActive && (
            <Field label="邀请链接">
              <Space.Compact style={{ width: '100%' }}>
                <Input readOnly value={shareLink} />
                <Button onClick={() => void copyLink(config?.shareUrl, '请先开启邀请链接')}>复制</Button>
              </Space.Compact>
            </Field>
          )}
        </Space>
      )}
    </Modal>
  );
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>
        {label}
      </Typography.Text>
      {children}
    </div>
  );
}

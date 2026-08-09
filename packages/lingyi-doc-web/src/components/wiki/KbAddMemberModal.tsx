import React, { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Empty, Input, Modal, Select, Tabs, message } from 'antd';
import {
  LinkOutlined,
  SearchOutlined,
  TeamOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import {
  KnowledgeBaseApi,
  type KbMember,
  type KbMemberRole,
} from '../../api/knowledgeBase';
import {
  TenantApi,
  type OrganizationNode,
  type TenantMemberItem,
} from '../../api/tenant';
import { getAvatarColor, getAvatarText } from '../../utils/formatDate';

export type AssignableKbRole = Exclude<KbMemberRole, 'owner'>;

type AddMode = 'invite' | 'search' | 'team';

interface KbAddMemberModalProps {
  open: boolean;
  kbId: string;
  kbName: string;
  /** 个人空间为 null */
  tenantId: string | null;
  defaultRole: AssignableKbRole;
  existingMembers: KbMember[];
  onClose: () => void;
  onAdded: () => void;
}

const ROLE_OPTIONS: { value: AssignableKbRole; label: string }[] = [
  { value: 'admin', label: '管理员' },
  { value: 'editor', label: '可编辑' },
  { value: 'viewer', label: '可阅读' },
];

const ROLE_HINT: Record<AssignableKbRole, string> = {
  admin: '管理员',
  editor: '可编辑',
  viewer: '可阅读',
};

function collectOrgIds(node: OrganizationNode, includeSelf = true): string[] {
  const ids: string[] = includeSelf ? [node.id] : [];
  for (const child of node.children ?? []) {
    ids.push(...collectOrgIds(child, true));
  }
  return ids;
}

function flattenOrgs(nodes: OrganizationNode[], depth = 0): Array<OrganizationNode & { depth: number }> {
  const out: Array<OrganizationNode & { depth: number }> = [];
  for (const node of nodes) {
    out.push({ ...node, depth });
    if (node.children?.length) {
      out.push(...flattenOrgs(node.children, depth + 1));
    }
  }
  return out;
}

export const KbAddMemberModal: React.FC<KbAddMemberModalProps> = ({
  open,
  kbId,
  kbName,
  tenantId,
  defaultRole,
  existingMembers,
  onClose,
  onAdded,
}) => {
  const isPersonal = !tenantId;
  const modes = useMemo(() => {
    const items: { key: AddMode; label: string; icon: React.ReactNode }[] = [
      { key: 'invite', label: '邀请添加', icon: <LinkOutlined /> },
    ];
    if (isPersonal) {
      items.push({ key: 'search', label: '搜索添加', icon: <SearchOutlined /> });
    } else {
      items.push({ key: 'team', label: '按团队添加', icon: <TeamOutlined /> });
    }
    return items;
  }, [isPersonal]);

  const [mode, setMode] = useState<AddMode>('invite');
  const [role, setRole] = useState<AssignableKbRole>(defaultRole);
  const [submitting, setSubmitting] = useState(false);

  // invite
  const [inviteLink, setInviteLink] = useState('');
  const [loadingInvite, setLoadingInvite] = useState(false);

  // search (personal)
  const [searchQ, setSearchQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchHits, setSearchHits] = useState<Array<{
    userId: string;
    displayName: string;
    email: string;
    phone: string | null;
  }>>([]);
  const [pickedSearchIds, setPickedSearchIds] = useState<string[]>([]);

  // team
  const [tenantMembers, setTenantMembers] = useState<TenantMemberItem[]>([]);
  const [orgs, setOrgs] = useState<OrganizationNode[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [pickedOrgIds, setPickedOrgIds] = useState<string[]>([]);
  const [pickedUserIds, setPickedUserIds] = useState<string[]>([]);
  const [teamKeyword, setTeamKeyword] = useState('');

  const existingIds = useMemo(
    () => new Set(existingMembers.map(m => m.userId)),
    [existingMembers],
  );

  useEffect(() => {
    if (!open) return;
    setMode('invite');
    setRole(defaultRole);
    setInviteLink('');
    setSearchQ('');
    setSearchHits([]);
    setPickedSearchIds([]);
    setPickedOrgIds([]);
    setPickedUserIds([]);
    setTeamKeyword('');
  }, [open, defaultRole]);

  useEffect(() => {
    if (!open || mode !== 'invite') return;
    setLoadingInvite(true);
    void KnowledgeBaseApi.ensureInviteLink(kbId, role)
      .then((res) => {
        setInviteLink(`${window.location.origin}${res.invitePath}`);
      })
      .catch((err) => {
        setInviteLink('');
        message.error(err instanceof Error ? err.message : '生成邀请链接失败');
      })
      .finally(() => setLoadingInvite(false));
  }, [open, mode, kbId, role]);

  useEffect(() => {
    if (!open || !tenantId || mode !== 'team') return;
    setLoadingTeam(true);
    void Promise.all([
      TenantApi.listMembers(tenantId),
      TenantApi.listOrganizations(tenantId),
    ])
      .then(([membersRes, orgsRes]) => {
        setTenantMembers(membersRes.items.filter(m => (m.status ?? 1) === 1));
        setOrgs(orgsRes.items);
      })
      .catch(() => {
        setTenantMembers([]);
        setOrgs([]);
        message.error('加载团队成员失败');
      })
      .finally(() => setLoadingTeam(false));
  }, [open, tenantId, mode]);

  useEffect(() => {
    if (!open || mode !== 'search') return;
    const q = searchQ.trim();
    if (q.length < 2) {
      setSearchHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setSearching(true);
      void KnowledgeBaseApi.searchUsersForAdd(kbId, q)
        .then(res => setSearchHits(res.items))
        .catch(() => setSearchHits([]))
        .finally(() => setSearching(false));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [open, mode, searchQ, kbId]);

  const flatOrgs = useMemo(() => flattenOrgs(orgs), [orgs]);

  const availableTenantMembers = useMemo(
    () => tenantMembers.filter(m => !existingIds.has(m.userId)),
    [tenantMembers, existingIds],
  );

  const filteredTenantMembers = useMemo(() => {
    const q = teamKeyword.trim().toLowerCase();
    if (!q) return availableTenantMembers;
    return availableTenantMembers.filter(m =>
      (m.displayName || '').toLowerCase().includes(q)
      || (m.email || '').toLowerCase().includes(q)
      || (m.phone || '').toLowerCase().includes(q),
    );
  }, [availableTenantMembers, teamKeyword]);

  const toggleId = (list: string[], id: string) => (
    list.includes(id) ? list.filter(x => x !== id) : [...list, id]
  );

  const resolveOrgUserIds = (orgId: string): string[] => {
    const node = flatOrgs.find(o => o.id === orgId);
    if (!node) return [];
    const orgIds = new Set(collectOrgIds(node));
    return availableTenantMembers
      .filter(m => m.orgId && orgIds.has(m.orgId))
      .map(m => m.userId);
  };

  const onToggleOrg = (orgId: string) => {
    const memberIds = resolveOrgUserIds(orgId);
    setPickedOrgIds(prev => toggleId(prev, orgId));
    setPickedUserIds(prev => {
      const set = new Set(prev);
      const allSelected = memberIds.length > 0 && memberIds.every(id => set.has(id));
      if (allSelected) {
        memberIds.forEach(id => set.delete(id));
      } else {
        memberIds.forEach(id => set.add(id));
      }
      return [...set];
    });
  };

  const copyInviteLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      message.success('邀请链接已复制');
    } catch {
      message.info(inviteLink);
    }
  };

  const submit = async () => {
    if (mode === 'invite') {
      await copyInviteLink();
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'search') {
        if (pickedSearchIds.length === 0) {
          message.warning('请选择要添加的用户');
          return;
        }
        await KnowledgeBaseApi.addMembers(kbId, { userIds: pickedSearchIds, role });
        message.success(`已添加 ${pickedSearchIds.length} 人`);
        onAdded();
        onClose();
        return;
      }

      if (mode === 'team') {
        if (pickedUserIds.length === 0) {
          message.warning('请选择部门或成员');
          return;
        }
        await KnowledgeBaseApi.addMembers(kbId, { userIds: pickedUserIds, role });
        message.success(`已添加 ${pickedUserIds.length} 人`);
        onAdded();
        onClose();
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : '添加失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="添加成员"
      onCancel={onClose}
      width={560}
      destroyOnHidden
      footer={(
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onClose}>取消</Button>
          <Button
            type="primary"
            loading={submitting || (mode === 'invite' && loadingInvite)}
            disabled={mode === 'invite' && !inviteLink}
            onClick={() => void submit()}
          >
            {mode === 'invite' ? '复制邀请链接' : '确定添加'}
          </Button>
        </div>
      )}
    >
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 13, color: '#646a73' }}>成员权限</span>
        <Select
          value={role}
          style={{ width: 140 }}
          options={ROLE_OPTIONS}
          onChange={v => setRole(v)}
        />
        <span style={{ fontSize: 12, color: '#8f959e' }}>添加到「{kbName}」</span>
      </div>

      <Tabs
        activeKey={mode}
        onChange={key => setMode(key as AddMode)}
        items={modes.map(m => ({
          key: m.key,
          label: (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {m.icon}
              {m.label}
            </span>
          ),
        }))}
      />

      {mode === 'invite' && (
        <div>
          <div style={{ fontSize: 13, color: '#646a73', marginBottom: 12, lineHeight: 1.6 }}>
            复制下方链接发送给成员。对方打开后登录，点击「确认加入」即可成为「{ROLE_HINT[role]}」。
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 12px', background: '#f7f8fa', borderRadius: 8,
          }}>
            <LinkOutlined style={{ color: '#3370ff' }} />
            <span style={{
              flex: 1, fontSize: 12, color: '#646a73', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {loadingInvite ? '生成中…' : (inviteLink || '暂无邀请链接')}
            </span>
            <Button size="small" type="link" disabled={!inviteLink} onClick={() => void copyInviteLink()}>
              复制
            </Button>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: '#8f959e', display: 'flex', alignItems: 'center', gap: 6 }}>
            <UserAddOutlined />
            切换上方权限后，链接权限会同步更新
          </div>
        </div>
      )}

      {mode === 'search' && (
        <div>
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#8f959e' }} />}
            placeholder="按名称或手机号搜索"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
          <div style={{ marginTop: 12, maxHeight: 280, overflow: 'auto' }}>
            {searching ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#8f959e', fontSize: 13 }}>搜索中…</div>
            ) : searchQ.trim().length < 2 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="输入至少 2 个字符搜索" />
            ) : searchHits.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未找到用户" />
            ) : (
              searchHits.map(user => {
                const name = user.displayName || user.phone || user.email;
                const checked = pickedSearchIds.includes(user.userId);
                const sub = [user.phone, user.email].filter(Boolean).join(' · ');
                return (
                  <label
                    key={user.userId}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 8px', cursor: 'pointer', borderRadius: 6,
                      background: checked ? '#f0f4ff' : 'transparent',
                    }}
                  >
                    <Checkbox
                      checked={checked}
                      onChange={() => setPickedSearchIds(prev => toggleId(prev, user.userId))}
                    />
                    <span style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: getAvatarColor(name), color: '#fff', fontSize: 12, fontWeight: 600,
                    }}>
                      {getAvatarText(name)}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#1f2329' }}>{name}</div>
                      {sub && <div style={{ fontSize: 12, color: '#8f959e' }}>{sub}</div>}
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}

      {mode === 'team' && (
        <div>
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#8f959e' }} />}
            placeholder="搜索成员"
            value={teamKeyword}
            onChange={e => setTeamKeyword(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          {loadingTeam ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#8f959e' }}>加载中…</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxHeight: 320 }}>
              <div style={{ border: '1px solid #e8e9eb', borderRadius: 8, overflow: 'auto', maxHeight: 320 }}>
                <div style={{ padding: '8px 12px', fontSize: 12, color: '#8f959e', background: '#fafafa' }}>
                  部门 / 团队
                </div>
                {flatOrgs.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无组织" style={{ margin: '24px 0' }} />
                ) : flatOrgs.map(org => (
                  <label
                    key={org.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', paddingLeft: 12 + org.depth * 14, cursor: 'pointer',
                    }}
                  >
                    <Checkbox
                      checked={pickedOrgIds.includes(org.id)}
                      onChange={() => onToggleOrg(org.id)}
                    />
                    <TeamOutlined style={{ color: '#8f959e' }} />
                    <span style={{ fontSize: 13 }}>{org.name}</span>
                  </label>
                ))}
              </div>
              <div style={{ border: '1px solid #e8e9eb', borderRadius: 8, overflow: 'auto', maxHeight: 320 }}>
                <div style={{ padding: '8px 12px', fontSize: 12, color: '#8f959e', background: '#fafafa' }}>
                  成员（已选 {pickedUserIds.length}）
                </div>
                {filteredTenantMembers.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可添加成员" style={{ margin: '24px 0' }} />
                ) : filteredTenantMembers.map(user => {
                  const name = user.displayName || user.email;
                  return (
                    <label
                      key={user.userId}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px', cursor: 'pointer',
                      }}
                    >
                      <Checkbox
                        checked={pickedUserIds.includes(user.userId)}
                        onChange={() => setPickedUserIds(prev => toggleId(prev, user.userId))}
                      />
                      <span style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: getAvatarColor(name), color: '#fff', fontSize: 11, fontWeight: 600,
                      }}>
                        {getAvatarText(name)}
                      </span>
                      <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {name}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

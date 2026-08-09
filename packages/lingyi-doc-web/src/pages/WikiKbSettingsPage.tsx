import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Input, Modal, Radio, Select, Spin, Tag, message } from 'antd';
import {
  ArrowLeftOutlined,
  BookOutlined,
  BarChartOutlined,
  CloseOutlined,
  FolderOutlined,
  QuestionCircleOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { KnowledgeBaseApi, canManageKnowledgeBase, type KbMember, type KbMemberRole } from '../api/knowledgeBase';
import { authStore } from '../stores/authStore';
import { knowledgeBaseStore, type KnowledgeBase } from '../stores/knowledgeBaseStore';
import { appPath } from '../utils/appPaths';
import { getAvatarColor, getAvatarText } from '../utils/formatDate';
import { KbAddMemberModal, type AssignableKbRole } from '../components/wiki/KbAddMemberModal';

type SettingsSection = 'info' | 'permission' | 'security' | 'more' | 'stats' | 'directory';

const EMOJI_OPTIONS = ['📘', '📚', '📖', '🗂️', '💡', '🧠', '📝', '✨'];

const ROLE_LABEL: Record<KbMemberRole, string> = {
  owner: '可管理',
  admin: '可管理',
  editor: '可编辑',
  viewer: '可查看',
};

function parseSection(raw: string | null): SettingsSection {
  if (raw === 'permission' || raw === 'security' || raw === 'more' || raw === 'stats' || raw === 'directory') {
    return raw;
  }
  return 'info';
}

function isVipPlan(plan: string | undefined): boolean {
  return plan === 'vip' || plan === 'trial';
}

export const WikiKbSettingsPage: React.FC = () => {
  const { kbId = '' } = useParams<{ kbId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const section = parseSection(searchParams.get('section'));
  const membership = useSyncExternalStore(authStore.subscribe, () => authStore.getState().membershipSummary);
  const vip = isVipPlan(membership?.plan);
  const session = useSyncExternalStore(authStore.subscribe, () => authStore.getState().session);
  const tenantId = session?.currentIdentityType === 'tenant' ? session.currentTenantId : null;

  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    if (!kbId) return;
    setLoading(true);
    setForbidden(false);
    try {
      // 强制走详情接口拿最新 myRole，避免缓存导致越权进设置
      const detail = await KnowledgeBaseApi.get(kbId);
      const mapped = await knowledgeBaseStore.ensureKb(kbId);
      const item = mapped
        ? { ...mapped, myRole: detail.myRole ?? mapped.myRole }
        : null;
      if (item && !canManageKnowledgeBase(item.myRole)) {
        setForbidden(true);
        setKb(null);
        return;
      }
      setKb(item);
    } catch {
      setKb(null);
    } finally {
      setLoading(false);
    }
  }, [kbId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSelect = (next: SettingsSection) => {
    setSearchParams({ section: next }, { replace: true });
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#f5f6f7' }}>
        <Spin />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div style={{ padding: 48, textAlign: 'center', background: '#f5f6f7', height: '100%' }}>
        <div style={{ marginBottom: 12, color: '#8f959e' }}>无权管理该知识库设置</div>
        <Button type="primary" onClick={() => navigate(appPath.wikiSpace(kbId))} style={{ marginRight: 8 }}>
          进入知识库
        </Button>
        <Button onClick={() => navigate(appPath.wiki)}>返回列表</Button>
      </div>
    );
  }

  if (!kb) {
    return (
      <div style={{ padding: 48, textAlign: 'center', background: '#f5f6f7', height: '100%' }}>
        <div style={{ marginBottom: 12, color: '#8f959e' }}>知识库不存在或无权访问</div>
        <Button onClick={() => navigate(appPath.wiki)}>返回知识库列表</Button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f5f6f7', overflow: 'hidden' }}>
      <div style={{
        height: 52,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 20px',
        background: '#fff',
        borderBottom: '1px solid #dee0e3',
      }}>
        <button
          type="button"
          onClick={() => navigate(appPath.wiki)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: '#646a73', fontSize: 13, padding: 0,
          }}
        >
          <ArrowLeftOutlined />
          返回
        </button>
        <span style={{ width: 1, height: 16, background: '#dee0e3' }} />
        <span style={{ fontSize: 18 }}>{kb.emoji || '📘'}</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2329' }}>{kb.name}</span>
        <span style={{ fontSize: 13, color: '#8f959e' }}>· 知识库管理</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <aside style={{
          width: 240,
          flexShrink: 0,
          background: '#fff',
          borderRight: '1px solid #dee0e3',
          overflow: 'auto',
          padding: '16px 12px',
        }}>
          <SidebarGroup title="设置">
            <SidebarItem
              active={section === 'info'}
              icon={<BookOutlined />}
              label="知识库信息"
              onClick={() => onSelect('info')}
            />
            <SidebarItem
              active={section === 'permission'}
              icon={<TeamOutlined />}
              label="权限"
              onClick={() => onSelect('permission')}
            />
            <SidebarItem
              active={section === 'security'}
              icon={<SafetyCertificateOutlined />}
              label="安全设置"
              vip
              onClick={() => onSelect('security')}
            />
            <SidebarItem
              active={section === 'more'}
              icon={<SettingOutlined />}
              label="更多设置"
              onClick={() => onSelect('more')}
            />
          </SidebarGroup>
          <SidebarGroup title="高级功能">
            <SidebarItem
              active={section === 'stats'}
              icon={<BarChartOutlined />}
              label="统计"
              vip
              onClick={() => onSelect('stats')}
            />
            <SidebarItem
              active={section === 'directory'}
              icon={<FolderOutlined />}
              label="目录管理"
              onClick={() => onSelect('directory')}
            />
          </SidebarGroup>
        </aside>

        <main style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '24px 28px 48px' }}>
          <div style={{
            maxWidth: 880,
            background: '#fff',
            borderRadius: 8,
            border: '1px solid #e8e9eb',
            padding: '24px 28px',
            minHeight: 480,
          }}>
            {section === 'info' && (
              <KbInfoSection
                kb={kb}
                onSaved={(next) => setKb(next)}
              />
            )}
            {section === 'permission' && (
              <KbPermissionSection
                kb={kb}
                vip={vip}
                tenantId={tenantId}
                onSaved={(next) => setKb(next)}
              />
            )}
            {section === 'security' && (
              <VipStubSection title="安全设置" vip={vip} description="文档水印、访问审计等安全能力需开通会员后使用。" />
            )}
            {section === 'more' && (
              <MoreSettingsSection
                kb={kb}
                onDeleted={() => navigate(appPath.wiki)}
              />
            )}
            {section === 'stats' && (
              <VipStubSection title="统计" vip={vip} description="访问量、协作活跃度等统计能力需开通会员后使用。" />
            )}
            {section === 'directory' && (
              <div>
                <h2 style={titleStyle}>目录管理</h2>
                <p style={{ color: '#8f959e', fontSize: 13, marginTop: 12 }}>
                  可在知识库空间侧栏中拖拽整理目录。点击下方按钮进入空间。
                </p>
                <Button type="primary" style={{ marginTop: 16 }} onClick={() => navigate(appPath.wikiSpace(kb.id))}>
                  打开知识库空间
                </Button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
  color: '#1f2329',
};

function SidebarGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ padding: '4px 10px 8px', fontSize: 12, color: '#8f959e', fontWeight: 500 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</div>
    </div>
  );
}

function SidebarItem({
  active,
  icon,
  label,
  vip,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  vip?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        height: 36,
        padding: '0 10px',
        border: 'none',
        borderRadius: 6,
        background: active ? '#f0f1f2' : 'transparent',
        color: '#1f2329',
        fontSize: 13,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={{ color: active ? '#3370ff' : '#646a73', display: 'inline-flex' }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {vip && <Tag style={{ margin: 0, fontSize: 11, lineHeight: '18px' }} color="orange">会员</Tag>}
    </button>
  );
}

function VipStubSection({
  title,
  vip,
  description,
}: {
  title: string;
  vip: boolean;
  description: string;
}) {
  return (
    <div>
      <h2 style={titleStyle}>{title}</h2>
      {!vip ? (
        <div style={{
          marginTop: 20,
          padding: 20,
          background: '#fff7e6',
          border: '1px solid #ffd591',
          borderRadius: 8,
          color: '#ad6800',
          fontSize: 13,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>会员功能</div>
          <div>{description}</div>
        </div>
      ) : (
        <p style={{ marginTop: 16, color: '#8f959e', fontSize: 13 }}>功能即将开放，敬请期待。</p>
      )}
    </div>
  );
}

function KbInfoSection({
  kb,
  onSaved,
}: {
  kb: KnowledgeBase;
  onSaved: (kb: KnowledgeBase) => void;
}) {
  const [name, setName] = useState(kb.name);
  const [description, setDescription] = useState(kb.description || '');
  const [emoji, setEmoji] = useState(kb.emoji || '📘');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(kb.name);
    setDescription(kb.description || '');
    setEmoji(kb.emoji || '📘');
  }, [kb]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      message.warning('请填写知识库名称');
      return;
    }
    setSaving(true);
    try {
      const next = await knowledgeBaseStore.update(kb.id, {
        name: trimmed,
        description: description.trim(),
        emoji,
      });
      onSaved(next);
      message.success('已保存');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 style={titleStyle}>知识库信息</h2>

      <div style={{ marginTop: 24 }}>
        <div style={labelStyle}>
          <span style={{ color: '#f54a45' }}>*</span> 图标和名称
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setEmojiOpen(v => !v)}
              style={{
                width: 40, height: 40, borderRadius: 8, border: '1px solid #dee0e3',
                background: '#fff', fontSize: 22, cursor: 'pointer',
              }}
            >
              {emoji}
            </button>
            {emojiOpen && (
              <div style={{
                position: 'absolute', top: 46, left: 0, zIndex: 10,
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6,
                padding: 8, background: '#fff', border: '1px solid #dee0e3',
                borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              }}>
                {EMOJI_OPTIONS.map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => { setEmoji(item); setEmojiOpen(false); }}
                    style={{
                      width: 36, height: 36, border: 'none', borderRadius: 6,
                      background: item === emoji ? '#e8f3ff' : 'transparent',
                      cursor: 'pointer', fontSize: 20,
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Input
            value={name}
            maxLength={80}
            onChange={e => setName(e.target.value)}
            style={{ flex: 1 }}
          />
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={labelStyle}>简介</div>
          <span style={{ fontSize: 12, color: '#8f959e' }}>{description.length} / 255</span>
        </div>
        <Input.TextArea
          value={description}
          maxLength={255}
          rows={5}
          placeholder="如：产品设计与研发"
          onChange={e => setDescription(e.target.value)}
        />
      </div>

      <div style={{ marginTop: 28 }}>
        <Button type="primary" loading={saving} onClick={() => void save()}>
          保存
        </Button>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#1f2329',
  marginBottom: 8,
  fontWeight: 500,
};

function KbPermissionSection({
  kb,
  vip,
  tenantId,
  onSaved,
}: {
  kb: KnowledgeBase;
  vip: boolean;
  tenantId: string | null;
  onSaved: (kb: KnowledgeBase) => void;
}) {
  type RoleTab = 'admin' | 'editor' | 'viewer';

  const [visibility, setVisibility] = useState(kb.visibility);
  const [members, setMembers] = useState<KbMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [roleTab, setRoleTab] = useState<RoleTab>('admin');
  const [addOpen, setAddOpen] = useState(false);

  const reloadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await KnowledgeBaseApi.listMembers(kb.id);
      setMembers(res.items);
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [kb.id]);

  useEffect(() => {
    setVisibility(kb.visibility);
    void reloadMembers();
  }, [kb, reloadMembers]);

  const tabDefaultRole: AssignableKbRole = roleTab === 'admin' ? 'admin' : roleTab;

  const tabMembers = useMemo(() => {
    const byRole = members.filter((m) => {
      if (roleTab === 'admin') return m.role === 'owner' || m.role === 'admin';
      return m.role === roleTab;
    });
    const q = filter.trim().toLowerCase();
    if (!q) return byRole;
    return byRole.filter(m =>
      (m.displayName || '').toLowerCase().includes(q)
      || (m.email || '').toLowerCase().includes(q)
      || m.userId.toLowerCase().includes(q),
    );
  }, [filter, members, roleTab]);

  const saveVisibility = async (next: 'members' | 'organization') => {
    if (next === visibility) return;
    try {
      const updated = await knowledgeBaseStore.update(kb.id, { visibility: next });
      setVisibility(updated.visibility);
      onSaved(updated);
      message.success('已更新公开性');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新失败');
    }
  };

  const roleTabs: { key: RoleTab; label: string }[] = [
    { key: 'admin', label: '管理员' },
    { key: 'editor', label: '可编辑的成员' },
    { key: 'viewer', label: '可阅读的成员' },
  ];

  return (
    <div>
      <h2 style={titleStyle}>权限</h2>

      <section style={{ marginTop: 28 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>公开性</h3>
        <Radio.Group
          value={visibility}
          onChange={(e) => { void saveVisibility(e.target.value); }}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <Radio value="members">仅协作者可访问</Radio>
          <Radio value="organization" disabled={!tenantId}>
            {tenantId ? '当前企业内公开可见' : '企业内公开（需切换到企业空间）'}
          </Radio>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.75 }}>
            <Radio value="__public" disabled>
              互联网所有人可访问
            </Radio>
            <Tag color="orange" style={{ margin: 0 }}>会员</Tag>
            {!vip && <span style={{ fontSize: 12, color: '#8f959e' }}>升级会员后可用</span>}
          </div>
        </Radio.Group>
      </section>

      <section style={{ marginTop: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>角色与权限</h3>
          <QuestionCircleOutlined style={{ color: '#bbbfc4', fontSize: 14 }} title="不同角色可管理、编辑或阅读知识库内容" />
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 16,
          borderBottom: '1px solid #e8e9eb',
        }}>
          <div style={{ display: 'flex', gap: 24 }}>
            {roleTabs.map(tab => {
              const active = roleTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setRoleTab(tab.key)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: '0 0 10px',
                    cursor: 'pointer',
                    fontSize: 14,
                    color: active ? '#1f2329' : '#646a73',
                    fontWeight: active ? 600 : 400,
                    borderBottom: active ? '2px solid #3370ff' : '2px solid transparent',
                    marginBottom: -1,
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <Input
            allowClear
            size="middle"
            placeholder="搜索已有用户"
            prefix={<SearchOutlined style={{ color: '#8f959e' }} />}
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ width: 200, marginBottom: 8 }}
          />
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 14,
          marginBottom: 8,
        }}>
          <span style={{ fontSize: 13, color: '#8f959e' }}>页面默认权限：可编辑</span>
          <Button type="default" style={{ color: '#3370ff', borderColor: '#3370ff' }} onClick={() => setAddOpen(true)}>
            + 添加成员
          </Button>
        </div>

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}><Spin size="small" /></div>
        ) : tabMembers.length === 0 ? (
          <div style={{
            padding: '48px 24px',
            textAlign: 'center',
            color: '#8f959e',
          }}>
            <div style={{
              width: 88, height: 88, margin: '0 auto 16px', borderRadius: 16,
              background: 'linear-gradient(160deg, #eef3ff 0%, #f5f7fa 100%)',
              border: '1px solid #e6ebf5',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 20px rgba(51, 112, 255, 0.08)',
            }}>
              <UserOutlined style={{ fontSize: 36, color: '#a8b3c7' }} />
            </div>
            <div style={{ fontSize: 14 }}>尚未添加成员</div>
          </div>
        ) : (
          <div style={{ border: '1px solid #e8e9eb', borderRadius: 8, overflow: 'hidden', marginTop: 8 }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 140px 80px',
              gap: 8,
              padding: '10px 14px',
              background: '#fafafa',
              fontSize: 12,
              color: '#8f959e',
              borderBottom: '1px solid #e8e9eb',
            }}>
              <span>用户</span>
              <span>权限</span>
              <span>操作</span>
            </div>
            {tabMembers.map(member => {
              const name = member.displayName || member.email || member.userId;
              return (
                <div
                  key={member.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 140px 80px',
                    gap: 8,
                    padding: '12px 14px',
                    borderBottom: '1px solid #f0f0f0',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: getAvatarColor(name), color: '#fff', fontSize: 12, fontWeight: 600,
                    }}>
                      {getAvatarText(name)}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, color: '#1f2329', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {name}
                      </div>
                      {member.email && (
                        <div style={{ fontSize: 12, color: '#8f959e' }}>{member.email}</div>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: '#646a73' }}>
                    {member.role === 'owner' ? '所有者' : ROLE_LABEL[member.role]}
                  </div>
                  <div>
                    {member.role !== 'owner' ? (
                      <button
                        type="button"
                        onClick={() => {
                          void KnowledgeBaseApi.removeMember(kb.id, member.userId)
                            .then(() => reloadMembers())
                            .then(() => message.success('已移除'))
                            .catch(err => message.error(err instanceof Error ? err.message : '移除失败'));
                        }}
                        style={{
                          border: 'none', background: 'transparent', color: '#f54a45',
                          cursor: 'pointer', fontSize: 12, padding: 0,
                        }}
                      >
                        移除
                      </button>
                    ) : (
                      <span style={{ color: '#bbbfc4', fontSize: 12 }}>—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <KbAddMemberModal
        open={addOpen}
        kbId={kb.id}
        kbName={kb.name}
        tenantId={tenantId}
        defaultRole={tabDefaultRole}
        existingMembers={members}
        onClose={() => setAddOpen(false)}
        onAdded={() => { void reloadMembers(); }}
      />
    </div>
  );
}

function generateConfirmCode(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function MoreSettingsSection({
  kb,
  onDeleted,
}: {
  kb: KnowledgeBase;
  onDeleted: () => void;
}) {
  const kbRevision = useSyncExternalStore(knowledgeBaseStore.subscribe, knowledgeBaseStore.getRevision);
  const otherKbs = useMemo(() => {
    void kbRevision;
    return knowledgeBaseStore.list().filter(item => item.id !== kb.id);
  }, [kb.id, kbRevision]);

  const [transferTargetId, setTransferTargetId] = useState<string | undefined>();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmCode, setConfirmCode] = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const openDeleteModal = () => {
    setConfirmCode(generateConfirmCode());
    setConfirmInput('');
    setConfirmTouched(false);
    setDeleteOpen(true);
  };

  const confirmMismatch = confirmTouched && confirmInput.trim() !== confirmCode;
  const canConfirmDelete = confirmInput.trim() === confirmCode;

  return (
    <div>
      <h2 style={titleStyle}>更多设置</h2>

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SettingsActionCard
          title="导出知识库"
          description={(
            <>
              可将知识库内容批量导出
              <button
                type="button"
                onClick={() => message.info('帮助文档即将开放')}
                style={{
                  marginLeft: 4, border: 'none', background: 'transparent',
                  color: '#3370ff', cursor: 'pointer', padding: 0, fontSize: 13,
                }}
              >
                查看帮助文档
              </button>
            </>
          )}
          action={(
            <Button onClick={() => message.info('导出功能开发中')}>导出</Button>
          )}
        />

        <SettingsActionCard
          title="转移知识库"
          description="可以将知识库转移到其他知识小组"
          body={(
            <Select
              allowClear
              placeholder="选择一个你有权限的知识小组"
              style={{ width: '100%', maxWidth: 360, marginTop: 12 }}
              value={transferTargetId}
              onChange={setTransferTargetId}
              options={otherKbs.map(item => ({
                value: item.id,
                label: `${item.emoji || '📘'} ${item.name}`,
              }))}
              notFoundContent={otherKbs.length === 0 ? '暂无其他知识库可转移' : undefined}
            />
          )}
          action={(
            <Button
              disabled={!transferTargetId}
              onClick={() => message.info('转移功能开发中')}
            >
              转移
            </Button>
          )}
        />

        <SettingsActionCard
          title="删除知识库"
          description="将这个知识库彻底删除，知识库下的所有数据将会删除"
          action={(
            <Button danger onClick={openDeleteModal}>删除</Button>
          )}
        />
      </div>

      <Modal
        open={deleteOpen}
        title="删除知识库"
        footer={null}
        centered
        width={480}
        destroyOnHidden
        onCancel={() => setDeleteOpen(false)}
        closeIcon={<CloseOutlined style={{ color: '#8f959e' }} />}
      >
        <div style={{
          marginTop: 4,
          padding: '12px 14px',
          background: '#fffbe6',
          border: '1px solid #ffe58f',
          borderRadius: 6,
          fontSize: 13,
          color: '#595959',
          lineHeight: 1.6,
        }}>
          正在删除知识库
          {' '}
          <span style={{ color: '#f54a45', fontWeight: 600 }}>{kb.name}</span>
          ，该操作不可逆，一旦操作成功，知识库下的所有内容将会删除。请输入下面内容再次确认操作。
        </div>

        <div style={{ marginTop: 20, fontSize: 13, color: '#1f2329' }}>
          请在下方输入框中输入 &quot;{confirmCode}&quot; 以确认操作
        </div>
        <Input
          allowClear
          value={confirmInput}
          status={confirmMismatch ? 'error' : undefined}
          placeholder={confirmCode}
          onChange={(e) => {
            setConfirmInput(e.target.value);
            setConfirmTouched(true);
          }}
          style={{ marginTop: 10 }}
        />
        {confirmMismatch && (
          <div style={{ marginTop: 6, color: '#f54a45', fontSize: 12 }}>请按提示输入</div>
        )}

        <Button
          danger
          block
          loading={deleting}
          disabled={!canConfirmDelete}
          style={{ marginTop: 24, height: 40 }}
          onClick={() => {
            if (!canConfirmDelete) {
              setConfirmTouched(true);
              return;
            }
            setDeleting(true);
            void knowledgeBaseStore.remove(kb.id)
              .then(() => {
                message.success('已删除知识库');
                setDeleteOpen(false);
                onDeleted();
              })
              .catch(err => message.error(err instanceof Error ? err.message : '删除失败'))
              .finally(() => setDeleting(false));
          }}
        >
          确定删除 {kb.name}
        </Button>
      </Modal>
    </div>
  );
}

function SettingsActionCard({
  title,
  description,
  body,
  action,
}: {
  title: string;
  description: React.ReactNode;
  body?: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      padding: '18px 20px',
      background: '#fafafa',
      borderRadius: 8,
      border: '1px solid #f0f0f0',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2329' }}>{title}</div>
        <div style={{ marginTop: 6, fontSize: 13, color: '#8f959e', lineHeight: 1.5 }}>
          {description}
        </div>
        {body}
      </div>
      <div style={{ flexShrink: 0, paddingTop: 2 }}>{action}</div>
    </div>
  );
}

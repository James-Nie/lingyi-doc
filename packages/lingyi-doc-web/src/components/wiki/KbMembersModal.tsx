import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { KnowledgeBaseApi, type KbMember, type KbMemberRole } from '../../api/knowledgeBase';
import { TenantApi, type TenantMemberItem } from '../../api/tenant';

interface KbMembersModalProps {
  open: boolean;
  kbId: string;
  tenantId: string | null;
  onClose: () => void;
  onToast?: (msg: string) => void;
}

const ROLE_OPTIONS: { value: KbMemberRole; label: string }[] = [
  { value: 'admin', label: '管理员' },
  { value: 'editor', label: '编辑者' },
  { value: 'viewer', label: '查看者' },
];

export const KbMembersModal: React.FC<KbMembersModalProps> = ({
  open,
  kbId,
  tenantId,
  onClose,
  onToast,
}) => {
  const [members, setMembers] = useState<KbMember[]>([]);
  const [tenantMembers, setTenantMembers] = useState<TenantMemberItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<KbMemberRole>('viewer');
  const [submitting, setSubmitting] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const res = await KnowledgeBaseApi.listMembers(kbId);
      setMembers(res.items);
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setSelectedUserId('');
    setSelectedRole('viewer');
    void reload();
    if (tenantId) {
      TenantApi.listMembers(tenantId)
        .then(res => setTenantMembers(res.items))
        .catch(() => setTenantMembers([]));
    } else {
      setTenantMembers([]);
    }
  }, [open, kbId, tenantId]);

  const availableUsers = useMemo(() => {
    const existing = new Set(members.map(m => m.userId));
    return tenantMembers.filter(user => !existing.has(user.userId));
  }, [members, tenantMembers]);

  if (!open) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 12000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="成员管理"
        onMouseDown={e => e.stopPropagation()}
        style={{
          width: 520, maxWidth: '100%', maxHeight: '80vh', background: '#fff',
          borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee', fontSize: 16, fontWeight: 600 }}>
          成员管理
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 20px' }}>
          {loading ? (
            <div style={{ padding: 16, color: '#8f959e', textAlign: 'center' }}>加载中…</div>
          ) : members.length === 0 ? (
            <div style={{ padding: 16, color: '#8f959e', textAlign: 'center' }}>暂无成员</div>
          ) : members.map(member => (
            <div
              key={member.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
                borderBottom: '1px solid #f0f0f0',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#1f2329' }}>{member.displayName || member.email || member.userId}</div>
                {member.email && member.displayName && (
                  <div style={{ fontSize: 12, color: '#8f959e' }}>{member.email}</div>
                )}
              </div>
              <span style={{ fontSize: 12, color: '#646a73' }}>{roleLabel(member.role)}</span>
              {member.role !== 'owner' && (
                <button
                  type="button"
                  onClick={() => {
                    void KnowledgeBaseApi.removeMember(kbId, member.userId)
                      .then(() => reload())
                      .then(() => onToast?.('已移除成员'))
                      .catch(err => onToast?.(`移除失败: ${(err as Error).message}`));
                  }}
                  style={{
                    border: 'none', background: 'transparent', color: '#f54a45',
                    cursor: 'pointer', fontSize: 12,
                  }}
                >
                  移除
                </button>
              )}
            </div>
          ))}
        </div>

        {availableUsers.length > 0 && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid #eee' }}>
            <div style={{ fontSize: 13, color: '#646a73', marginBottom: 8 }}>添加成员</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={selectedUserId}
                onChange={e => setSelectedUserId(e.target.value)}
                style={{ flex: 1, height: 32, borderRadius: 6, border: '1px solid #dee0e3', padding: '0 8px' }}
              >
                <option value="">选择成员</option>
                {availableUsers.map(user => (
                  <option key={user.userId} value={user.userId}>
                    {user.displayName || user.email}
                  </option>
                ))}
              </select>
              <select
                value={selectedRole}
                onChange={e => setSelectedRole(e.target.value as KbMemberRole)}
                style={{ width: 100, height: 32, borderRadius: 6, border: '1px solid #dee0e3' }}
              >
                {ROLE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedUserId || submitting}
                onClick={() => {
                  setSubmitting(true);
                  void KnowledgeBaseApi.addMember(kbId, { userId: selectedUserId, role: selectedRole })
                    .then(() => reload())
                    .then(() => {
                      setSelectedUserId('');
                      onToast?.('成员已添加');
                    })
                    .catch(err => onToast?.(`添加失败: ${(err as Error).message}`))
                    .finally(() => setSubmitting(false));
                }}
                style={{
                  height: 32, padding: '0 12px', borderRadius: 6, border: 'none',
                  background: '#3370ff', color: '#fff', cursor: 'pointer', fontSize: 13,
                }}
              >
                添加
              </button>
            </div>
          </div>
        )}

        <div style={{ padding: '12px 20px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{
            height: 32, padding: '0 16px', borderRadius: 6, border: '1px solid #dee0e3',
            background: '#fff', cursor: 'pointer', fontSize: 13,
          }}>
            关闭
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

function roleLabel(role: KbMemberRole): string {
  const map: Record<KbMemberRole, string> = {
    owner: '所有者',
    admin: '管理员',
    editor: '编辑者',
    viewer: '查看者',
  };
  return map[role] ?? role;
}

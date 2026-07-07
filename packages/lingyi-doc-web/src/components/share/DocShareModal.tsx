import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  buildShareLink,
  DOC_SHARE_COLLABORATOR_OPTIONS,
  DOC_SHARE_PERMISSION_LABELS,
  DOC_SHARE_PERMISSION_OPTIONS,
  DocumentShareApi,
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
  const [permissionLevel, setPermissionLevel] = useState<DocSharePermissionLevel>('read');
  const [memberPermissionLevel, setMemberPermissionLevel] = useState<DocSharePermissionLevel>('read');
  const [expireTime, setExpireTime] = useState('');
  const [memberExpireTime, setMemberExpireTime] = useState('');
  const [password, setPassword] = useState('');
  const [clearPassword, setClearPassword] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const [shareRes, memberRes, requestRes] = await Promise.all([
        DocumentShareApi.getConfig(docId),
        DocumentShareApi.listCollaborators(docId),
        DocumentShareApi.listJoinRequests(docId),
      ]);
      setConfig(shareRes);
      setCollaborators(memberRes.items);
      setJoinRequests(requestRes.items);
      setPermissionLevel(shareRes.permissionLevel);
      setMemberPermissionLevel(shareRes.memberPermissionLevel);
      setExpireTime(shareRes.expireTime ? shareRes.expireTime.slice(0, 16) : '');
      setMemberExpireTime(shareRes.memberExpireTime ? shareRes.memberExpireTime.slice(0, 16) : '');
      setPassword('');
      setClearPassword(false);
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
    void reload();
  }, [open, docId]);

  const handleSaveLink = async () => {
    setSaving(true);
    try {
      const res = await DocumentShareApi.upsert(docId, {
        permissionLevel,
        expireTime: expireTime ? new Date(expireTime).toISOString() : null,
        password: password || undefined,
        clearPassword: clearPassword || (config?.hasPassword && !password ? false : clearPassword),
      });
      setConfig(res);
      setPassword('');
      onToast?.('链接分享已更新');
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
        expireTime: memberExpireTime ? new Date(memberExpireTime).toISOString() : null,
      });
      setConfig(res);
      onToast?.('成员分享链接已更新');
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
      onToast?.('链接分享已关闭');
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

  if (!open) return null;

  const shareLink = buildShareLink(config?.shareUrl ?? null);
  const memberShareLink = buildShareLink(config?.memberShareUrl ?? null);
  const docUrl = buildShareLink(config?.docUrl ?? null);
  const isLinkActive = config?.status === 'active';
  const isMemberShareActive = config?.memberShareStatus === 'active';

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
        aria-label="分享文档"
        onMouseDown={e => e.stopPropagation()}
        style={{
          width: 560, maxWidth: '100%', maxHeight: '85vh', background: '#fff', borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0,0,0,0.18)', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>分享文档</div>
          {isMemberShareActive && (
            <span style={{ fontSize: 12, color: '#3370ff', background: '#e8f0fe', padding: '2px 8px', borderRadius: 4 }}>
              成员分享已开启
            </span>
          )}
          {isLinkActive && (
            <span style={{ fontSize: 12, color: '#646a73', background: '#f5f6f7', padding: '2px 8px', borderRadius: 4 }}>
              公开链接已开启
            </span>
          )}
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #eee', padding: '0 20px' }}>
          {([
            { key: 'members' as const, label: '指定成员' },
            { key: 'link' as const, label: '公开链接' },
          ]).map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '10px 12px', border: 'none', background: 'transparent', cursor: 'pointer',
                fontSize: 14, color: activeTab === tab.key ? '#3370ff' : '#646a73',
                fontWeight: activeTab === tab.key ? 500 : 400, position: 'relative',
              }}
            >
              {tab.label}
              {activeTab === tab.key && (
                <span style={{
                  position: 'absolute', left: 12, right: 12, bottom: 0, height: 2,
                  background: '#3370ff', borderRadius: 1,
                }} />
              )}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '16px 20px' }}>
          {loading ? (
            <div style={{ color: '#8f959e', textAlign: 'center', padding: 24 }}>加载中…</div>
          ) : activeTab === 'members' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {docUrl && (
                <Field label="文档链接（拥有者与已通过成员）">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input readOnly value={docUrl} style={{ ...inputStyle, flex: 1 }} />
                    <button type="button" onClick={() => void copyLink(config?.docUrl, '暂无文档链接')} style={secondaryBtnStyle}>
                      复制
                    </button>
                  </div>
                </Field>
              )}

              <Field label="成员权限">
                <select
                  value={memberPermissionLevel}
                  onChange={e => setMemberPermissionLevel(e.target.value as DocSharePermissionLevel)}
                  style={inputStyle}
                >
                  {DOC_SHARE_COLLABORATOR_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="邀请链接过期时间">
                <input
                  type="datetime-local"
                  value={memberExpireTime}
                  onChange={e => setMemberExpireTime(e.target.value)}
                  style={inputStyle}
                />
                <div style={{ fontSize: 12, color: '#8f959e', marginTop: 4 }}>留空表示永久有效</div>
              </Field>

              {memberShareLink && isMemberShareActive && (
                <Field label="成员邀请链接（需申请 + 审核）">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input readOnly value={memberShareLink} style={{ ...inputStyle, flex: 1 }} />
                    <button
                      type="button"
                      onClick={() => void copyLink(config?.memberShareUrl, '请先开启成员分享')}
                      style={secondaryBtnStyle}
                    >
                      复制
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: '#8f959e', marginTop: 4, lineHeight: 1.5 }}>
                    被分享者打开链接后需申请加入，你审核通过后对方可通过文档链接访问。
                  </div>
                </Field>
              )}

              {joinRequests.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, color: '#646a73', marginBottom: 8 }}>待审核申请</div>
                  {joinRequests.map(req => (
                    <div
                      key={req.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0',
                        borderBottom: '1px solid #f0f0f0',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, color: '#1f2329' }}>
                          {req.applicantName || req.applicantEmail || req.applicantId}
                        </div>
                        {req.message && (
                          <div style={{ fontSize: 12, color: '#8f959e', marginTop: 2 }}>{req.message}</div>
                        )}
                      </div>
                      <button type="button" onClick={() => void handleApproveRequest(req.id)} style={primaryBtnStyle}>
                        通过
                      </button>
                      <button type="button" onClick={() => void handleRejectRequest(req.id)} style={secondaryBtnStyle}>
                        拒绝
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <div style={{ fontSize: 13, color: '#646a73', marginBottom: 8 }}>已加入成员</div>
                {collaborators.length === 0 ? (
                  <div style={{ color: '#8f959e', fontSize: 13 }}>暂无协作者</div>
                ) : collaborators.map(member => (
                  <div
                    key={member.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
                      borderBottom: '1px solid #f0f0f0',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: '#1f2329' }}>
                        {member.displayName || member.email || member.userId}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: '#646a73' }}>
                      {DOC_SHARE_PERMISSION_LABELS[member.permissionLevel]}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleRemoveMember(member.userId)}
                      style={{
                        border: 'none', background: 'transparent', color: '#f54a45',
                        cursor: 'pointer', fontSize: 12,
                      }}
                    >
                      移除
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="链接权限">
                <select
                  value={permissionLevel}
                  onChange={e => setPermissionLevel(e.target.value as DocSharePermissionLevel)}
                  style={inputStyle}
                >
                  {DOC_SHARE_PERMISSION_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="过期时间">
                <input
                  type="datetime-local"
                  value={expireTime}
                  onChange={e => setExpireTime(e.target.value)}
                  style={inputStyle}
                />
                <div style={{ fontSize: 12, color: '#8f959e', marginTop: 4 }}>留空表示永久有效</div>
              </Field>

              <Field label="访问密码">
                <input
                  type="password"
                  value={password}
                  placeholder={config?.hasPassword ? '留空则保持原密码' : '可选，留空表示无密码'}
                  onChange={e => setPassword(e.target.value)}
                  style={inputStyle}
                />
                {config?.hasPassword && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 13, color: '#646a73' }}>
                    <input
                      type="checkbox"
                      checked={clearPassword}
                      onChange={e => setClearPassword(e.target.checked)}
                    />
                    清除密码
                  </label>
                )}
              </Field>

              {shareLink && isLinkActive && (
                <Field label="公开分享链接">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input readOnly value={shareLink} style={{ ...inputStyle, flex: 1 }} />
                    <button type="button" onClick={() => void copyLink(config?.shareUrl, '请先开启链接分享')} style={secondaryBtnStyle}>
                      复制
                    </button>
                  </div>
                </Field>
              )}
            </div>
          )}
        </div>

        <div style={{
          padding: '12px 20px', borderTop: '1px solid #eee',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          {activeTab === 'members' && isMemberShareActive && (
            <button type="button" disabled={saving} onClick={() => void handleCloseMemberShare()} style={dangerBtnStyle}>
              关闭成员分享
            </button>
          )}
          {activeTab === 'link' && isLinkActive && (
            <button type="button" disabled={saving} onClick={() => void handleCloseShare()} style={dangerBtnStyle}>
              关闭链接
            </button>
          )}
          <button type="button" onClick={onClose} style={secondaryBtnStyle}>关闭</button>
          {activeTab === 'members' ? (
            <button type="button" disabled={saving || loading} onClick={() => void handleSaveMemberShare()} style={primaryBtnStyle}>
              {saving ? '保存中…' : isMemberShareActive ? '更新成员分享' : '开启成员分享'}
            </button>
          ) : (
            <button type="button" disabled={saving || loading} onClick={() => void handleSaveLink()} style={primaryBtnStyle}>
              {saving ? '保存中…' : isLinkActive ? '更新设置' : '开启链接分享'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: '#646a73', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  border: '1px solid #dee0e3',
  borderRadius: 6,
  fontSize: 14,
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  border: 'none',
  borderRadius: 6,
  background: '#3370ff',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 14,
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  border: '1px solid #dee0e3',
  borderRadius: 6,
  background: '#fff',
  cursor: 'pointer',
  fontSize: 14,
};

const dangerBtnStyle: React.CSSProperties = {
  ...secondaryBtnStyle,
  marginRight: 'auto',
  color: '#d83931',
  borderColor: '#fde2e0',
};

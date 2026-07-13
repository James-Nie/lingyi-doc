import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BaseView } from '@lingyi-doc/core';
import {
  DocumentShareApi,
  type DocShareCollaborator,
  type DocShareConfig,
} from '../../api/documentShare';
import {
  buildFormShareLink,
  FORM_SHARE_SCOPE_OPTIONS,
  type FormShareLinkScope,
} from '../../utils/formShareLink';

const VIEWPORT_PAD = 8;
const PANEL_WIDTH = 420;

export interface FormSharePanelProps {
  docId: string;
  sheetId: string;
  formView: BaseView;
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  onConfigChange: (patch: Partial<BaseView['config']>) => void;
  onToast?: (msg: string) => void;
}

export const FormSharePanel: React.FC<FormSharePanelProps> = ({
  docId,
  sheetId,
  formView,
  anchorRef,
  open,
  onClose,
  onConfigChange,
  onToast,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [portalStyle, setPortalStyle] = useState<{ top: number; left: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shareConfig, setShareConfig] = useState<DocShareConfig | null>(null);
  const [collaborators, setCollaborators] = useState<DocShareCollaborator[]>([]);
  const [inviteQuery, setInviteQuery] = useState('');

  const enabled = !!formView.config.formShareEnabled;
  const linkScope: FormShareLinkScope = formView.config.formShareLinkScope ?? 'internet';

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, collabRes] = await Promise.all([
        DocumentShareApi.getConfig(docId),
        DocumentShareApi.listCollaborators(docId),
      ]);
      setShareConfig(configRes);
      setCollaborators(collabRes.items);
    } catch {
      setShareConfig(null);
      setCollaborators([]);
      onToast?.('加载分享配置失败');
    } finally {
      setLoading(false);
    }
  }, [docId, onToast]);

  useEffect(() => {
    if (!open) return;
    void reload();
  }, [open, reload]);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !panelRef.current) {
      setPortalStyle(null);
      return;
    }
    const anchor = anchorRef.current.getBoundingClientRect();
    const panel = panelRef.current;
    const panelWidth = panel.offsetWidth || PANEL_WIDTH;
    const panelHeight = panel.offsetHeight;

    let left = anchor.right - panelWidth;
    if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;
    if (left + panelWidth > window.innerWidth - VIEWPORT_PAD) {
      left = window.innerWidth - VIEWPORT_PAD - panelWidth;
    }

    let top = anchor.bottom + 8;
    if (top + panelHeight > window.innerHeight - VIEWPORT_PAD) {
      top = Math.max(VIEWPORT_PAD, anchor.top - panelHeight - 8);
    }

    setPortalStyle({ top, left });
  }, [open, anchorRef, enabled, loading, collaborators.length]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, anchorRef]);

  const persistFormConfig = useCallback((patch: Partial<BaseView['config']>) => {
    onConfigChange(patch);
  }, [onConfigChange]);

  const handleToggle = async (next: boolean) => {
    setSaving(true);
    try {
      if (next) {
        const res = await DocumentShareApi.upsert(docId, { permissionLevel: 'read' });
        setShareConfig(res);
        persistFormConfig({ formShareEnabled: true, formShareLinkScope: linkScope });
        onToast?.('表单分享已开启');
      } else {
        await DocumentShareApi.close(docId);
        persistFormConfig({ formShareEnabled: false });
        await reload();
        onToast?.('表单分享已关闭');
      }
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : '操作失败');
    } finally {
      setSaving(false);
    }
  };

  const handleScopeChange = async (scope: FormShareLinkScope) => {
    persistFormConfig({ formShareLinkScope: scope });
    if (!enabled) return;
    setSaving(true);
    try {
      if (scope === 'collaborators') {
        await DocumentShareApi.close(docId);
        await DocumentShareApi.upsertMemberShare(docId, { permissionLevel: 'read' });
      } else {
        await DocumentShareApi.closeMemberShare(docId).catch(() => undefined);
        await DocumentShareApi.upsert(docId, { permissionLevel: 'read' });
      }
      await reload();
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : '更新权限失败');
    } finally {
      setSaving(false);
    }
  };

  const shareUrl = linkScope === 'collaborators'
    ? shareConfig?.memberShareUrl
    : shareConfig?.shareUrl;
  const formLink = enabled
    ? buildFormShareLink(shareUrl, { sheetId, viewId: formView.viewId })
    : null;

  const copyLink = async () => {
    if (!formLink) {
      onToast?.('请先开启表单分享');
      return;
    }
    try {
      await navigator.clipboard.writeText(formLink);
      onToast?.('链接已复制');
    } catch {
      onToast?.('复制失败，请手动复制');
    }
  };

  const filteredCollaborators = inviteQuery.trim()
    ? collaborators.filter(c => {
      const q = inviteQuery.trim().toLowerCase();
      return (c.displayName || '').toLowerCase().includes(q)
        || (c.email || '').toLowerCase().includes(q)
        || c.userId.toLowerCase().includes(q);
    })
    : collaborators;

  if (!open) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="表单分享"
      style={{
        position: 'fixed',
        top: portalStyle?.top ?? 0,
        left: portalStyle?.left ?? 0,
        width: PANEL_WIDTH,
        maxWidth: `calc(100vw - ${VIEWPORT_PAD * 2}px)`,
        background: '#fff',
        borderRadius: 10,
        border: '1px solid #dee0e3',
        boxShadow: '0 8px 28px rgba(31, 35, 41, 0.14)',
        zIndex: 12000,
        overflow: 'hidden',
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid #eef0f3' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ToggleSwitch
            checked={enabled}
            disabled={saving || loading}
            onChange={v => void handleToggle(v)}
          />
          <span style={{ fontSize: 15, fontWeight: 500, color: '#1f2329' }}>
            {enabled ? '已开启表单分享' : '开启表单分享'}
          </span>
          <InfoIcon />
        </div>
      </div>

      {enabled && (
        <>
          <div style={{
            margin: '12px 18px 0',
            padding: '10px 12px',
            background: '#e8f3ff',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            fontSize: 13,
            lineHeight: '20px',
            color: '#1f2329',
          }}>
            <InfoIcon color="#3370ff" size={16} />
            <span style={{ flex: 1 }}>
              填写者将可见表单引用的数据，请注意信息安全
            </span>
            <button
              type="button"
              style={{ border: 'none', background: 'none', color: '#3370ff', cursor: 'pointer', fontSize: 13, padding: 0, flexShrink: 0 }}
              onClick={() => onToast?.('详情说明开发中')}
            >
              了解详情
            </button>
          </div>

          <div style={{ padding: '16px 18px' }}>
            <SectionHeader
              title="链接分享"
              action={(
                <button
                  type="button"
                  onClick={() => onToast?.('设置表单默认值开发中')}
                  style={{
                    border: 'none', background: 'none', color: '#3370ff', cursor: 'pointer',
                    fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0,
                  }}
                >
                  <LinkIcon /> 设置表单默认值
                </button>
              )}
            />

            <div style={{
              display: 'flex', alignItems: 'center', gap: 0,
              border: '1px solid #dee0e3', borderRadius: 8, overflow: 'hidden', marginBottom: 10,
            }}>
              <input
                readOnly
                value={loading ? '加载中…' : (formLink ?? '开启分享后生成链接')}
                style={{
                  flex: 1, border: 'none', padding: '10px 12px', fontSize: 13,
                  color: '#646a73', background: '#fff', outline: 'none', minWidth: 0,
                }}
              />
              <button
                type="button"
                disabled={!formLink || saving}
                onClick={() => void copyLink()}
                style={{
                  border: 'none', borderLeft: '1px solid #dee0e3', background: '#fff',
                  padding: '10px 14px', fontSize: 13, color: '#3370ff', cursor: formLink ? 'pointer' : 'default',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                复制链接
              </button>
            </div>

            <select
              value={linkScope}
              disabled={saving}
              onChange={e => void handleScopeChange(e.target.value as FormShareLinkScope)}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                border: '1px solid #dee0e3', borderRadius: 8, fontSize: 13, color: '#1f2329',
                background: '#fff', appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238f959e' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 12px center',
              }}
            >
              {FORM_SHARE_SCOPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div style={{ padding: '0 18px 18px' }}>
            <SectionHeader title="邀请填写者" />
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              border: '1px solid #dee0e3', borderRadius: 8, padding: '4px 4px 4px 12px', marginBottom: 10,
            }}>
              <input
                value={inviteQuery}
                onChange={e => setInviteQuery(e.target.value)}
                placeholder="搜索用户、群组、部门或用户组"
                style={{
                  flex: 1, border: 'none', outline: 'none', fontSize: 13,
                  color: '#1f2329', background: 'transparent', minWidth: 0,
                }}
              />
              <button
                type="button"
                title="添加填写者"
                onClick={() => onToast?.('邀请填写者开发中')}
                style={{
                  width: 28, height: 28, borderRadius: 6, border: 'none',
                  background: '#f5f6f7', color: '#646a73', cursor: 'pointer',
                  fontSize: 18, lineHeight: 1, flexShrink: 0,
                }}
              >
                +
              </button>
            </div>

            {filteredCollaborators.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredCollaborators.map(member => (
                  <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={member.displayName || member.email || member.userId} />
                    <span style={{ flex: 1, fontSize: 13, color: '#1f2329', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {member.displayName || member.email || member.userId}
                    </span>
                    <ChevronRight />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#8f959e', padding: '4px 0' }}>
                {inviteQuery.trim() ? '未找到匹配成员' : '暂无已邀请填写者'}
              </div>
            )}
          </div>
        </>
      )}
    </div>,
    document.body,
  );
};

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <span style={{ fontSize: 14, fontWeight: 500, color: '#1f2329' }}>{title}</span>
      {action}
    </div>
  );
}

function ToggleSwitch({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ position: 'relative', display: 'inline-flex', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
      />
      <span style={{
        width: 40, height: 22, borderRadius: 11, background: checked ? '#3370ff' : '#c9cdd4',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute', top: 2, left: checked ? 20 : 2, width: 18, height: 18,
          borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        }} />
      </span>
    </label>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <span style={{
      width: 32, height: 32, borderRadius: '50%', background: '#e8f0fe', color: '#3370ff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 500, flexShrink: 0,
    }}>
      {initial}
    </span>
  );
}

function InfoIcon({ color = '#8f959e', size = 14 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
      <path d="M12 10v6M12 7h.01" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M10 14a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5l-1 1" stroke="#3370ff" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 10a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5l1-1" stroke="#3370ff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M9 6l6 6-6 6" stroke="#bbb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

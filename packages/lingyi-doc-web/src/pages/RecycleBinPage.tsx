import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DocumentManager } from '@lingyi-doc/core';
import type { RecycleBinItem } from '@lingyi-doc/core';
import { getDocTypeMeta } from '../utils/docTypeMeta';
import { PageTopBar } from '../components/layout/topBar';
import { confirmPermanentDelete } from '../utils/appDialog';
const TEXT = '#1f2329';
const MUTED = '#8f959e';
const BORDER = '#dee0e3';
const SELECT_BG = '#e8f0fe';
const HOVER_BG = '#f5f6f7';

type RowAction = 'restore' | 'permanentDelete';

export const RecycleBinPage: React.FC = () => {
  const [items, setItems] = useState<RecycleBinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const showStub = useCallback((name: string) => {
    setToast(`${name}功能开发中`);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await DocumentManager.listRecycleBin();
      setItems(list);
      setSelected(prev => {
        const next = new Set<string>();
        for (const id of prev) {
          if (list.some(i => i.id === id)) next.add(id);
        }
        return next;
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const allSelected = items.length > 0 && selected.size === items.length;
  const someSelected = selected.size > 0 && !allSelected;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const selectedItems = useMemo(
    () => items.filter(i => selected.has(i.id)),
    [items, selected],
  );

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map(i => i.id)));
  };

  const runBatch = async (action: RowAction, ids: string[]) => {
    if (ids.length === 0) return;
    if (action === 'permanentDelete') {
      const confirmed = await confirmPermanentDelete(ids.length);
      if (!confirmed) return;
    }

    setBusy(true);
    try {
      for (const id of ids) {
        if (action === 'restore') await DocumentManager.restore(id);
        else await DocumentManager.permanentDelete(id);
      }
      setToast(action === 'restore' ? '已恢复' : '已彻底删除');
      setMenuId(null);
      setMenuAnchor(null);
      await loadItems();
    } catch (err) {
      setToast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleRowAction = (action: RowAction, id: string) => {
    setMenuId(null);
    setMenuAnchor(null);
    void runBatch(action, [id]);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: '#fff' }}>
      <PageTopBar
        title="回收站"
        subtitle="删除的内容将保留 30 天，之后自动彻底删除"
        onStub={showStub}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 32px 96px' }}>
        {loading ? (
          <div style={{ padding: 24, color: MUTED, fontSize: 14 }}>加载中…</div>
        ) : error ? (
          <div style={{ padding: 24, color: '#d93025', fontSize: 14 }}>{error}</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: MUTED, fontSize: 14 }}>回收站为空</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}`, color: MUTED, fontSize: 13 }}>
                <th style={{ width: 44, padding: '10px 8px', fontWeight: 500, textAlign: 'left' }}>
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                </th>
                <th style={{ padding: '10px 12px', fontWeight: 500, textAlign: 'left' }}>名称</th>
                <th style={{ width: 160, padding: '10px 12px', fontWeight: 500, textAlign: 'left' }}>操作者</th>
                <th style={{ width: 120, padding: '10px 12px', fontWeight: 500, textAlign: 'left' }}>剩余时间</th>
                <th style={{ width: 48 }} />
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const isSelected = selected.has(item.id);
                const isHovered = hoveredId === item.id || menuId === item.id;
                const bg = isSelected ? SELECT_BG : isHovered ? HOVER_BG : 'transparent';
                const meta = getDocTypeMeta(item.docType);

                return (
                  <tr
                    key={item.id}
                    style={{ borderBottom: `1px solid ${BORDER}`, background: bg }}
                    onMouseEnter={() => setHoveredId(item.id)}
                    onMouseLeave={() => { if (menuId !== item.id) setHoveredId(null); }}
                  >
                    <td style={{ padding: '12px 8px', verticalAlign: 'middle' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(item.id)}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ padding: '12px', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span style={{
                          width: 28, height: 28, borderRadius: 6, background: meta.bg, flexShrink: 0,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, color: meta.color, fontWeight: 600,
                        }}>
                          {meta.icon}
                        </span>
                        <span style={{
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          fontSize: 14, color: TEXT,
                        }}>
                          {item.title || '未命名文档'}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px', fontSize: 14, color: TEXT, verticalAlign: 'middle' }}>
                      {item.operatorName}
                    </td>
                    <td style={{ padding: '12px', fontSize: 14, color: TEXT, verticalAlign: 'middle' }}>
                      {item.daysRemaining} 天
                    </td>
                    <td style={{ padding: '8px', verticalAlign: 'middle', position: 'relative' }}>
                      {(isHovered || menuId === item.id) && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={e => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setMenuId(item.id);
                            setMenuAnchor(rect);
                          }}
                          style={{
                            width: 28, height: 28, border: 'none', borderRadius: 4,
                            background: 'transparent', cursor: 'pointer', color: MUTED, fontSize: 16,
                          }}
                        >
                          ···
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selected.size > 0 && (
        <div style={{
          position: 'fixed', left: 'var(--app-sidebar-width, 220px)', right: 0, bottom: 0, zIndex: 50,
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 32px', background: '#fff',
          borderTop: `1px solid ${BORDER}`,
          boxShadow: '0 -2px 12px rgba(0,0,0,0.06)',
        }}>
          <span style={{ fontSize: 13, color: MUTED, marginRight: 8 }}>
            已选 {selected.size} 项
          </span>
          <ActionButton
            variant="primary"
            disabled={busy}
            onClick={() => void runBatch('restore', selectedItems.map(i => i.id))}
          >
            恢复
          </ActionButton>
          <ActionButton
            variant="danger"
            disabled={busy}
            onClick={() => void runBatch('permanentDelete', selectedItems.map(i => i.id))}
          >
            彻底删除
          </ActionButton>
        </div>
      )}

      {menuId && menuAnchor && (
        <RowContextMenu
          anchor={menuAnchor}
          busy={busy}
          onClose={() => { setMenuId(null); setMenuAnchor(null); setHoveredId(null); }}
          onRestore={() => handleRowAction('restore', menuId)}
          onPermanentDelete={() => handleRowAction('permanentDelete', menuId)}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 18px', background: '#1f2329', color: '#fff',
          borderRadius: 8, fontSize: 13, zIndex: 200,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
};

function ActionButton({
  children,
  variant,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  variant: 'primary' | 'danger';
  disabled?: boolean;
  onClick: () => void;
}) {
  const isPrimary = variant === 'primary';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '6px 16px', borderRadius: 6, fontSize: 14, cursor: disabled ? 'default' : 'pointer',
        border: `1px solid ${isPrimary ? '#3370ff' : '#f54a45'}`,
        background: '#fff',
        color: isPrimary ? '#3370ff' : '#f54a45',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

function RowContextMenu({
  anchor,
  busy,
  onClose,
  onRestore,
  onPermanentDelete,
}: {
  anchor: DOMRect;
  busy: boolean;
  onClose: () => void;
  onRestore: () => void;
  onPermanentDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: anchor.right - 160,
        top: anchor.bottom + 4,
        minWidth: 160,
        background: '#fff',
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        boxShadow: '0 6px 24px rgba(31,35,41,0.12)',
        padding: '6px 0',
        zIndex: 100,
      }}
    >
      <MenuItem icon={<RestoreIcon />} disabled={busy} onClick={onRestore}>恢复</MenuItem>
      <MenuItem icon={<DeleteIcon />} disabled={busy} danger onClick={onPermanentDelete}>彻底删除</MenuItem>
    </div>
  );
}

function MenuItem({
  children,
  icon,
  disabled,
  danger,
  onClick,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 14px', border: 'none', background: 'transparent',
        fontSize: 14, color: danger ? '#f54a45' : TEXT,
        cursor: disabled ? 'default' : 'pointer', textAlign: 'left',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = HOVER_BG; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {icon}
      {children}
    </button>
  );
}

function RestoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  );
}

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Typography } from 'antd';
import { TOP_BAR_HOVER, TOP_BAR_ICON } from './styles';
import type { NotificationGroup, NotificationItem } from './notifications/types';
import { fetchInvitationNotifications, INVITATION_TYPE } from './notifications';

/** 注册一个通知源 */
interface Notifier {
  type: string;
  label: string;
  fetcher: () => Promise<NotificationItem[]>;
}

/** 默认注册的通知源 */
const NOTIFIERS: Notifier[] = [
  { type: INVITATION_TYPE, label: '待确认的邀请', fetcher: fetchInvitationNotifications },
];

/** 通知项渲染（主题色由各通知源自行定义在 icon 中） */
const NotificationItemRow: React.FC<{ item: NotificationItem; processingId: string | null; onActionStart: (id: string) => void; onActionEnd: (id: string) => void }> = ({
  item,
  processingId,
  onActionStart,
  onActionEnd,
}) => {
  const handleAction = async (action: NotificationItem['actions'][number]) => {
    onActionStart(item.id);
    try {
      await action.onClick();
    } finally {
      onActionEnd(item.id);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        background: '#fff7f0',
        borderRadius: 8,
        border: '1px solid #ffd8bf',
      }}
    >
      {item.icon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography.Text strong style={{ fontSize: 13 }}>{item.title}</Typography.Text>
        {item.description && (
          <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
            {item.description}
          </Typography.Text>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {item.actions.map(action => (
          <Button
            key={action.key}
            type={action.type}
            danger={action.danger}
            size="small"
            icon={action.icon}
            loading={processingId === item.id && action.key === 'accept'}
            onClick={() => { void handleAction(action); }}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
};

export const NotificationBell: React.FC = () => {
  const [groups, setGroups] = useState<NotificationGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        NOTIFIERS.map(async (n) => {
          const items = await n.fetcher();
          return { type: n.type, label: n.label, items } satisfies NotificationGroup;
        }),
      );
      setGroups(results.filter(g => g.items.length > 0));
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始加载 & 定时轮询
  useEffect(() => {
    void fetchAll();
    timerRef.current = setInterval(() => { void fetchAll(); }, 60_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchAll]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const badgeCount = groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div ref={popoverRef} style={{ position: 'relative' }}>
      <button
        type="button"
        title="通知"
        onClick={() => { setOpen(v => !v); if (!open) void fetchAll(); }}
        style={{
          width: 32,
          height: 32,
          border: 'none',
          borderRadius: 6,
          background: open ? TOP_BAR_HOVER : 'transparent',
          cursor: 'pointer',
          color: TOP_BAR_ICON,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          padding: 0,
          position: 'relative',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = TOP_BAR_HOVER; }}
        onMouseLeave={e => {
          e.currentTarget.style.background = open ? TOP_BAR_HOVER : 'transparent';
        }}
      >
        <Badge count={badgeCount} size="small" offset={[2, -2]}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </Badge>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 8,
            width: 380,
            maxHeight: 420,
            overflowY: 'auto',
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            border: '1px solid #ebebeb',
            zIndex: 1050,
            padding: 12,
          }}
        >
          {loading && groups.length === 0 && (
            <div style={{ padding: '16px 0', textAlign: 'center', color: '#8f959e', fontSize: 13 }}>
              加载中...
            </div>
          )}

          {!loading && groups.length === 0 && (
            <div style={{ padding: '16px 0', textAlign: 'center', color: '#8f959e', fontSize: 13 }}>
              暂无待处理通知
            </div>
          )}

          {groups.map(group => (
            <div key={group.type} style={{ marginBottom: groups.length > 1 ? 16 : 0 }}>
              <div style={{ marginBottom: 10, fontSize: 14, fontWeight: 600, color: '#1f2329' }}>
                {group.label}
                <span style={{ fontSize: 12, color: '#8f959e', marginLeft: 6 }}>
                  ({group.items.length} 条)
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.items.map(item => (
                  <NotificationItemRow
                    key={item.id}
                    item={item}
                    processingId={processingId}
                    onActionStart={(id) => setProcessingId(id)}
                    onActionEnd={() => setProcessingId(null)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
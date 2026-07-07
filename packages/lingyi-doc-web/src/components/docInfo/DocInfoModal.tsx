import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Spin } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { fetchDocumentInfo, type DocumentInfo } from '../../api/documentInfo';
import { formatCreatedAt, formatLastVisited, formatRelativeModified, getAvatarColor, getAvatarText } from '../../utils/formatDate';

type DocInfoTab = 'info' | 'visits' | 'operations' | 'privacy';

const SIDEBAR_ITEMS: Array<{ key: DocInfoTab; label: string; icon: React.ReactNode }> = [
  {
    key: 'info',
    label: '信息与数据',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    ),
  },
  {
    key: 'visits',
    label: '访问记录',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    key: 'operations',
    label: '操作记录',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M12 18v-6M9 15h6" />
      </svg>
    ),
  },
];

const OPERATION_FILTERS: Array<{ key: 'all' | 'share' | 'duplicate' | 'download' | 'permission'; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'share', label: '分享授权' },
  { key: 'duplicate', label: '创建副本' },
  { key: 'download', label: '下载' },
  { key: 'permission', label: '权限设置变更' },
];

interface DocInfoModalProps {
  open: boolean;
  docId: string | null;
  onClose: () => void;
}

function UserBadge({ user }: { user: { displayName: string } }) {
  const name = user.displayName || '未知用户';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <span style={{
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: getAvatarColor(name),
        color: '#fff',
        fontSize: 11,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        {getAvatarText(name)}
      </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
    </span>
  );
}

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: '#f5f6f7',
      borderRadius: 8,
      padding: '12px 14px',
      minHeight: 68,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: 8,
    }}>
      <div style={{ fontSize: 12, color: '#8f959e' }}>{label}</div>
      <div style={{ fontSize: 14, color: '#1f2329', minWidth: 0 }}>{children}</div>
    </div>
  );
}

function StatCard({ label, value, extra }: { label: string; value: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div style={{
      background: '#f5f6f7',
      borderRadius: 8,
      padding: '16px 14px',
      minHeight: 92,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: 10,
    }}>
      <div style={{ fontSize: 12, color: '#8f959e' }}>{label}</div>
      <div style={{ fontSize: 28, lineHeight: 1.1, fontWeight: 600, color: '#1f2329' }}>{value}</div>
      {extra}
    </div>
  );
}

const DocInfoOverviewPanel: React.FC<{ info: DocumentInfo }> = ({ info }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
    <section>
      <div style={{ fontSize: 13, color: '#8f959e', marginBottom: 12 }}>概览</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <InfoField label="所有者"><UserBadge user={info.overview.owner} /></InfoField>
        <InfoField label="创建者"><UserBadge user={info.overview.creator} /></InfoField>
        <InfoField label="创建时间">{formatCreatedAt(info.overview.createdAt)}</InfoField>
        <InfoField label="最近修改">{formatCreatedAt(info.overview.updatedAt)}</InfoField>
      </div>
    </section>

    <section>
      <div style={{ fontSize: 13, color: '#8f959e', marginBottom: 12 }}>文档统计</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <InfoField label="总字数">{info.documentStats.wordCount}</InfoField>
        <InfoField label="总字符数">{info.documentStats.charCount}</InfoField>
        <InfoField label="大小">{info.documentStats.sizeLabel}</InfoField>
      </div>
    </section>

    <section>
      <div style={{ fontSize: 13, color: '#8f959e', marginBottom: 12 }}>互动统计</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <StatCard label="访问人数" value={info.interaction.visitorCount} />
        <StatCard
          label="访问次数"
          value={info.interaction.visitCount}
          extra={info.interaction.todayNewVisits > 0 ? (
            <div style={{ fontSize: 12, color: '#34a853' }}>↑ 今日新增 {info.interaction.todayNewVisits}</div>
          ) : undefined}
        />
        <StatCard label="点赞总数" value={info.interaction.likeCount} />
        <StatCard label="评论总数" value={info.interaction.commentCount} />
      </div>
    </section>
  </div>
);

const DocInfoVisitsPanel: React.FC<{ info: DocumentInfo }> = ({ info }) => (
  <div>
    <div style={{ fontSize: 14, color: '#1f2329', marginBottom: 16 }}>
      文档访问人数：{info.interaction.visitorCount}
    </div>
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 120px',
      gap: 12,
      padding: '10px 0',
      borderBottom: '1px solid #f0f0f0',
      fontSize: 12,
      color: '#8f959e',
    }}>
      <span>访问者</span>
      <span style={{ textAlign: 'right' }}>最近访问时间</span>
    </div>
    {info.visitRecords.length === 0 ? (
      <div style={{ padding: '48px 0', textAlign: 'center', color: '#8f959e', fontSize: 13 }}>暂无访问记录</div>
    ) : info.visitRecords.map(record => (
      <div
        key={record.visitorId ?? record.displayName}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 120px',
          gap: 12,
          padding: '14px 0',
          borderBottom: '1px solid #f5f6f7',
          alignItems: 'center',
        }}
      >
        <UserBadge user={record} />
        <span style={{ textAlign: 'right', fontSize: 13, color: '#646a73' }}>
          {formatLastVisited(record.lastVisitedAt).startsWith('今天')
            ? '今天'
            : formatLastVisited(record.lastVisitedAt)}
        </span>
      </div>
    ))}
    <div style={{
      marginTop: 24,
      paddingTop: 16,
      borderTop: '1px solid #f0f0f0',
      textAlign: 'center',
      fontSize: 12,
      color: '#c9cdd4',
    }}>
      访问记录数据从 {info.visitStatsSince} 开始统计
    </div>
    <div style={{ marginTop: 16, fontSize: 12, color: '#8f959e', lineHeight: '20px' }}>
      访问记录中不会显示已关闭访问记录的用户。
      <button type="button" style={{ border: 'none', background: 'none', color: '#3370ff', cursor: 'pointer', padding: 0, marginLeft: 4 }}>
        了解详情
      </button>
    </div>
  </div>
);

const DocInfoOperationsPanel: React.FC<{ info: DocumentInfo }> = ({ info }) => {
  const [filter, setFilter] = useState<'all' | 'share' | 'duplicate' | 'download' | 'permission'>('all');
  const rows = useMemo(
    () => (filter === 'all'
      ? info.operationRecords
      : info.operationRecords.filter(row => row.category === filter)),
    [filter, info.operationRecords],
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 20, borderBottom: '1px solid #f0f0f0', marginBottom: 8 }}>
        {OPERATION_FILTERS.map(item => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            style={{
              border: 'none',
              background: 'none',
              padding: '0 0 10px',
              fontSize: 14,
              color: filter === item.key ? '#3370ff' : '#646a73',
              fontWeight: filter === item.key ? 600 : 400,
              cursor: 'pointer',
              borderBottom: filter === item.key ? '2px solid #3370ff' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: '#8f959e', fontSize: 13 }}>暂无操作记录</div>
      ) : rows.map(row => (
        <div key={row.id} style={{ display: 'flex', gap: 12, padding: '16px 0', borderBottom: '1px solid #f5f6f7' }}>
          <span style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: getAvatarColor(row.operatorName),
            color: '#fff',
            fontSize: 12,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            {getAvatarText(row.operatorName)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, color: '#1f2329', lineHeight: '22px' }}>
              <strong>{row.operatorName}</strong>
              {' '}
              {row.summary}
            </div>
          </div>
          <div style={{ fontSize: 13, color: '#8f959e', whiteSpace: 'nowrap' }}>
            {formatRelativeModified(row.createdAt)}
          </div>
        </div>
      ))}
      <div style={{ textAlign: 'center', padding: '24px 0', color: '#c9cdd4', fontSize: 13 }}>
        无更多操作记录
      </div>
    </div>
  );
};

const DocInfoPrivacyPanel: React.FC<{ info: DocumentInfo }> = ({ info }) => {
  const [showMyVisitRecord, setShowMyVisitRecord] = useState(info.privacy.showMyVisitRecord);
  const [showOthersVisitRecord, setShowOthersVisitRecord] = useState(info.privacy.showOthersVisitRecord);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PrivacyToggle
        title="允许其他人看到我的访问记录"
        description="关闭后，你的访问行为不会出现在其他协作者的访问记录列表中。"
        checked={showMyVisitRecord}
        onChange={setShowMyVisitRecord}
      />
      <PrivacyToggle
        title="查看其他访问者的记录"
        description="关闭后，你将无法查看此文档的访问记录列表。"
        checked={showOthersVisitRecord}
        onChange={setShowOthersVisitRecord}
      />
      <div style={{ fontSize: 12, color: '#8f959e', marginTop: 8 }}>
        隐私设置将在后续版本同步到服务端。
      </div>
    </div>
  );
};

function PrivacyToggle({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      padding: '16px 0',
      borderBottom: '1px solid #f5f6f7',
    }}>
      <div>
        <div style={{ fontSize: 14, color: '#1f2329', marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 12, color: '#8f959e', lineHeight: '20px' }}>{description}</div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
          width: 40,
          height: 22,
          borderRadius: 11,
          border: 'none',
          background: checked ? '#3370ff' : '#c9cdd4',
          position: 'relative',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute',
          top: 2,
          left: checked ? 20 : 2,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.15s ease',
        }} />
      </button>
    </div>
  );
}

export const DocInfoModal: React.FC<DocInfoModalProps> = ({ open, docId, onClose }) => {
  const [activeTab, setActiveTab] = useState<DocInfoTab>('info');
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<DocumentInfo | null>(null);

  useEffect(() => {
    if (!open || !docId) {
      setInfo(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchDocumentInfo(docId)
      .then(data => {
        if (!cancelled) setInfo(data);
      })
      .catch(() => {
        if (!cancelled) setInfo(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, docId]);

  useEffect(() => {
    if (open) setActiveTab('info');
  }, [open, docId]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      width={860}
      centered
      destroyOnHidden
      styles={{ body: { padding: 0 } }}
      style={{ borderRadius: 12, overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: 620, background: '#fff' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid #f0f0f0',
        }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1f2329' }}>文档信息</div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#646a73', padding: 4 }}
          >
            <CloseOutlined />
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <aside style={{
            width: 168,
            borderRight: '1px solid #f0f0f0',
            padding: '12px 8px',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{ flex: 1 }}>
              {SIDEBAR_ITEMS.map(item => {
                const active = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActiveTab(item.key)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      marginBottom: 4,
                      border: 'none',
                      borderRadius: 8,
                      background: active ? '#edf3ff' : 'transparent',
                      color: active ? '#3370ff' : '#646a73',
                      cursor: 'pointer',
                      fontSize: 14,
                      textAlign: 'left',
                    }}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('privacy')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                border: 'none',
                borderRadius: 8,
                background: activeTab === 'privacy' ? '#edf3ff' : 'transparent',
                color: activeTab === 'privacy' ? '#3370ff' : '#646a73',
                cursor: 'pointer',
                fontSize: 14,
                textAlign: 'left',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
              隐私设置
            </button>
          </aside>

          <main style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '20px 24px 24px' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
                <Spin />
              </div>
            ) : !info ? (
              <div style={{ paddingTop: 120, textAlign: 'center', color: '#8f959e' }}>无法加载文档信息</div>
            ) : (
              <>
                {activeTab === 'info' && <DocInfoOverviewPanel info={info} />}
                {activeTab === 'visits' && <DocInfoVisitsPanel info={info} />}
                {activeTab === 'operations' && <DocInfoOperationsPanel info={info} />}
                {activeTab === 'privacy' && <DocInfoPrivacyPanel info={info} />}
              </>
            )}
          </main>
        </div>
      </div>
    </Modal>
  );
};

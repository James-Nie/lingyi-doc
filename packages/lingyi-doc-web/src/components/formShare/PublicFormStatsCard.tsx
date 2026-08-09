import React from 'react';

const PRIMARY = '#3370ff';

export interface PublicFormStatsCardProps {
  title: string;
  submittedCount: number;
  requiredCount: number;
  submittedPeopleCount: number;
  pendingRequiredCount: number;
  onViewResults: () => void;
  onUrgeFill: () => void;
  onViewPendingRequired?: () => void;
}

export const PublicFormStatsCard: React.FC<PublicFormStatsCardProps> = ({
  title,
  submittedCount,
  requiredCount,
  submittedPeopleCount,
  pendingRequiredCount,
  onViewResults,
  onUrgeFill,
  onViewPendingRequired,
}) => {
  return (
    <div style={{
      width: '100%',
      maxWidth: 720,
      background: '#fff',
      borderRadius: 12,
      boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      padding: '28px 32px 20px',
    }}>
      <h2 style={{
        margin: '0 0 20px',
        fontSize: 20,
        fontWeight: 600,
        color: '#1f2329',
        lineHeight: '28px',
      }}>
        {title}
      </h2>

      <div style={{
        display: 'flex',
        alignItems: 'stretch',
        border: '1px solid #dee0e3',
        borderRadius: 10,
        padding: '20px 8px',
        marginBottom: 20,
      }}>
        <StatCell value={submittedCount} label="已提交份数" />
        <Divider />
        <StatCell value={requiredCount} label="必填人数" />
        <Divider />
        <StatCell value={submittedPeopleCount} label="已提交人数" />
        <Divider />
        <StatCell
          value={pendingRequiredCount}
          label="必填人未提交"
          accent
          clickable={!!onViewPendingRequired}
          onClick={onViewPendingRequired}
        />
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <button
          type="button"
          onClick={onViewResults}
          style={{
            border: 'none',
            background: 'none',
            color: PRIMARY,
            fontSize: 13,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: 0,
          }}
        >
          <GridIcon />
          查看收集结果
        </button>
        <button
          type="button"
          onClick={onUrgeFill}
          style={{
            height: 32,
            padding: '0 14px',
            borderRadius: 16,
            border: '1px solid #dee0e3',
            background: '#fff',
            color: '#1f2329',
            fontSize: 13,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <BellIcon />
          催填
        </button>
      </div>
    </div>
  );
};

function StatCell({
  value,
  label,
  accent,
  clickable,
  onClick,
}: {
  value: number;
  label: string;
  accent?: boolean;
  clickable?: boolean;
  onClick?: () => void;
}) {
  const color = accent ? PRIMARY : '#1f2329';
  const content = (
    <>
      <div style={{ fontSize: 28, fontWeight: 600, color, lineHeight: '36px' }}>{value}</div>
      <div style={{
        marginTop: 4,
        fontSize: 13,
        color: accent ? PRIMARY : '#8f959e',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
      }}>
        {label}
        {accent && <ChevronRight />}
      </div>
    </>
  );

  if (clickable) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          flex: 1,
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          textAlign: 'center',
          padding: '0 8px',
        }}
      >
        {content}
      </button>
    );
  }

  return (
    <div style={{ flex: 1, textAlign: 'center', padding: '0 8px' }}>
      {content}
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, background: '#e5e6eb', alignSelf: 'stretch' }} />;
}

function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="4" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="13" y="4" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="4" y="13" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="13" y="13" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

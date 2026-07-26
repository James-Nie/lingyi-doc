import React from 'react';
import type { AggregatedDataset, DashboardRankListConfig } from '@lingyi-doc/core-types';

interface RankListWidgetProps {
  dataset: AggregatedDataset | null;
  config: DashboardRankListConfig;
}

const BADGE_COLORS = ['#fa8c16', '#8c8c8c', '#d48806', '#bfbfbf'];

export const RankListWidget: React.FC<RankListWidgetProps> = ({ dataset, config }) => {
  const dimId = config.labelFieldId || dataset?.columns.find(c => c.role === 'dimension')?.id;
  const metricId = config.metricId || dataset?.columns.find(c => c.role === 'metric')?.id;
  const rows = [...(dataset?.rows || [])].sort(
    (a, b) => Number(b[metricId || ''] ?? 0) - Number(a[metricId || ''] ?? 0),
  );

  if (!dimId || !metricId || rows.length === 0) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#bfbfbf' }}>
        暂无数据
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '4px 8px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '48px 1fr 64px',
          gap: 8,
          fontSize: 12,
          color: '#8c8c8c',
          padding: '4px 0 8px',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <span>排名</span>
        <span>名称</span>
        <span style={{ textAlign: 'right' }}>数量</span>
      </div>
      {rows.map((row, i) => (
        <div
          key={`${row[dimId]}-${i}`}
          style={{
            display: 'grid',
            gridTemplateColumns: '48px 1fr 64px',
            gap: 8,
            alignItems: 'center',
            padding: '10px 0',
            borderBottom: '1px solid #fafafa',
            fontSize: 13,
          }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              background: i < 3 ? BADGE_COLORS[i] : 'transparent',
              color: i < 3 ? '#fff' : '#8c8c8c',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {i + 1}
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {String(row[dimId] ?? '')}
          </span>
          <span style={{ textAlign: 'right', fontWeight: 600, color: '#262626' }}>
            {Number(row[metricId] ?? 0)}
          </span>
        </div>
      ))}
    </div>
  );
};

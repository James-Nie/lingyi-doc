import React, { useMemo } from 'react';
import { Flex, Space } from 'antd';
import type { FreeTable, RecordRow } from '@lingyi-doc/core';
import { buildRecordHistoryDisplayRows } from '@lingyi-doc/core';

const FIELD_ICONS: Record<string, string> = {
  text: 'A≡', number: '123', select: '◉', multiSelect: '☑', date: '📅',
  datetime: '📅', boolean: '☑', user: '👤', attachment: '📎', link: '🔗',
  rating: '⚡', progress: '▓', email: '@', phone: '📞', currency: '¥', percent: '%',
  formula: 'ƒ', autoNumber: '#',
};

function getAvatarText(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.slice(0, 1).toUpperCase();
}

function HistoryValueTag({ tag }: { tag: { label: string; color: string } }) {
  return (
    <span style={{
      padding: '0 8px',
      borderRadius: 12,
      background: `${tag.color}22`,
      color: tag.color,
      fontSize: 12,
      lineHeight: '22px',
    }}>
      {tag.label}
    </span>
  );
}

interface RecordDetailHistoryPanelProps {
  table: FreeTable;
  record: RecordRow | undefined;
  revision?: number;
  style?: React.CSSProperties;
}

/** 详情抽屉：行变更历史列表 */
export const RecordDetailHistoryPanel: React.FC<RecordDetailHistoryPanelProps> = ({
  table,
  record,
  revision = 0,
  style,
}) => {
  const historyRows = useMemo(
    () => buildRecordHistoryDisplayRows(record, table.sheet.columnDefs),
    [record, table.sheet.columnDefs, revision],
  );

  return (
    <div style={style}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '72px 88px 72px 1fr',
        gap: 8,
        padding: '12px 0',
        fontSize: 12,
        color: '#8f959e',
        borderBottom: '1px solid #f0f0f0',
      }}>
        <span>时间</span>
        <span>操作人</span>
        <span>字段</span>
        <span>变更前 → 变更后</span>
      </div>
      {historyRows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#8f959e', fontSize: 13 }}>
          暂无历史记录
        </div>
      ) : historyRows.map(row => (
        <div
          key={row.key}
          style={{
            display: 'grid',
            gridTemplateColumns: '72px 88px 72px 1fr',
            gap: 8,
            padding: '14px 0',
            borderBottom: '1px solid #f5f6f7',
            fontSize: 13,
            alignItems: 'center',
          }}
        >
          <span style={{ color: '#646a73' }}>{row.timeLabel}</span>
          <Space size={6}>
            <span style={{
              width: 22, height: 22, borderRadius: '50%',
              background: '#7c6cff', color: '#fff',
              fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              {getAvatarText(row.operator)}
            </span>
            <span style={{ color: '#1f2329', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.operator}
            </span>
          </Space>
          <Space size={4}>
            {!row.isCreate && row.fieldType && (
              <span style={{ color: '#8f959e', fontSize: 12 }}>{FIELD_ICONS[row.fieldType] || '?'}</span>
            )}
            <span style={{ color: '#646a73', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.fieldName}
            </span>
          </Space>
          <div style={{ color: '#646a73', minWidth: 0 }}>
            {row.isCreate ? null : (
              <Flex align="center" gap={8} wrap="wrap">
                {row.beforeTag ? <HistoryValueTag tag={row.beforeTag} /> : <span>{row.before}</span>}
                <span style={{ color: '#c9cdd4' }}>→</span>
                {row.afterTag ? <HistoryValueTag tag={row.afterTag} /> : <span style={{ color: '#1f2329' }}>{row.after}</span>}
              </Flex>
            )}
          </div>
        </div>
      ))}
      {historyRows.length > 0 && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#c9cdd4', fontSize: 13 }}>
          已经到底了
        </div>
      )}
    </div>
  );
};

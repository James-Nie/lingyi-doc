import React, { useEffect, useMemo, useState } from 'react';
import { Button, Flex, Space, Typography } from 'antd';
import {
  CloseOutlined,
  DownOutlined,
  MoreOutlined,
  UpOutlined,
} from '@ant-design/icons';
import type { FreeTable } from '@lingyi-doc/core';
import { RecordDetailFormFields } from './RecordDetailFormFields';
import { RecordDetailHistoryPanel } from './RecordDetailHistoryPanel';

export type RecordDrawerTab = 'detail' | 'history';

interface RecordDetailDrawerProps {
  visible: boolean;
  rowIndex: number | null;
  table: FreeTable;
  initialTab?: RecordDrawerTab;
  onClose: () => void;
  onNavigate: (rowIndex: number) => void;
}

export const RecordDetailDrawer: React.FC<RecordDetailDrawerProps> = ({
  visible,
  rowIndex,
  table,
  initialTab = 'detail',
  onClose,
  onNavigate,
}) => {
  const sheet = table.sheet;
  const [activeTab, setActiveTab] = useState<RecordDrawerTab>(initialTab);
  const [fieldRevision, setFieldRevision] = useState(0);

  useEffect(() => {
    if (visible) setActiveTab(initialTab);
  }, [visible, initialTab, rowIndex]);

  const record = rowIndex !== null ? table.getRowRecord(rowIndex) : undefined;

  const title = useMemo(() => {
    if (rowIndex === null) return '未命名记录';
    return table.getRecordTitle(rowIndex);
  }, [rowIndex, table, fieldRevision]);

  const canPrev = rowIndex !== null && rowIndex > 0;
  const canNext = rowIndex !== null && rowIndex < sheet.rowCount - 1;

  if (!visible || rowIndex === null) return null;

  return (
    <div
      data-sheet-keep-selection
      style={{ position: 'absolute', inset: 0, zIndex: 1000, pointerEvents: 'none' }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: 480,
          maxWidth: '92%',
          background: '#fff',
          borderLeft: '1px solid #e8e8e8',
          boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          pointerEvents: 'auto',
        }}
      >
        <Flex align="center" justify="space-between" style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          <Space size={4}>
            <Button type="text" size="small" icon={<UpOutlined />} disabled={!canPrev} onClick={() => onNavigate(rowIndex - 1)} />
            <Button type="text" size="small" icon={<DownOutlined />} disabled={!canNext} onClick={() => onNavigate(rowIndex + 1)} />
          </Space>
          <Space size={4}>
            <Button type="text" size="small" icon={<MoreOutlined />} />
            <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} />
          </Space>
        </Flex>

        <div style={{ padding: '16px 20px 0', flexShrink: 0 }}>
          <Typography.Title level={4} style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
            {title}
          </Typography.Title>
          <div style={{ display: 'flex', gap: 24, marginTop: 16, borderBottom: '1px solid #f0f0f0' }}>
            {(['detail', 'history'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                style={{
                  border: 'none',
                  background: 'none',
                  padding: '0 0 10px',
                  fontSize: 14,
                  fontWeight: activeTab === tab ? 600 : 400,
                  color: activeTab === tab ? '#3370ff' : '#646a73',
                  cursor: 'pointer',
                  borderBottom: activeTab === tab ? '2px solid #3370ff' : '2px solid transparent',
                  marginBottom: -1,
                }}
              >
                {tab === 'detail' ? '详情' : '历史'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {activeTab === 'detail' ? (
            <RecordDetailFormFields
              table={table}
              rowIndex={rowIndex}
              resetKey={rowIndex}
              onFieldChange={() => setFieldRevision(v => v + 1)}
              style={{ padding: '16px 20px 20px' }}
            />
          ) : (
            <RecordDetailHistoryPanel
              table={table}
              record={record}
              revision={fieldRevision}
              style={{ padding: '0 20px 20px' }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

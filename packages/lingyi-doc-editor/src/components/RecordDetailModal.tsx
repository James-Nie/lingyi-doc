import React, { useMemo, useState } from 'react';
import { Button, Flex, Modal, Space, Tabs, Typography } from 'antd';
import {
  DownOutlined,
  MoreOutlined,
  UpOutlined,
} from '@ant-design/icons';
import type { FreeTable } from '@lingyi-doc/core';
import { RecordDetailFormFields } from './RecordDetailFormFields';
import { RecordDetailHistoryPanel } from './RecordDetailHistoryPanel';

interface RecordDetailModalProps {
  visible: boolean;
  rowIndex: number | null;
  table: FreeTable;
  onClose: () => void;
  onNavigate: (rowIndex: number) => void;
}

export const RecordDetailModal: React.FC<RecordDetailModalProps> = ({
  visible,
  rowIndex,
  table,
  onClose,
  onNavigate,
}) => {
  const sheet = table.sheet;
  const [fieldRevision, setFieldRevision] = useState(0);

  const record = rowIndex !== null ? table.getRowRecord(rowIndex) : undefined;

  const title = useMemo(() => {
    if (rowIndex === null) return '未命名记录';
    return table.getRecordTitle(rowIndex);
  }, [rowIndex, table, fieldRevision]);

  const canPrev = rowIndex !== null && rowIndex > 0;
  const canNext = rowIndex !== null && rowIndex < sheet.rowCount - 1;

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      width={560}
      centered
      destroyOnHidden
      closable={false}
      styles={{ body: { padding: 0 } }}
    >
      <div data-sheet-keep-selection>
        <Flex align="center" justify="space-between" style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <Space>
            <Button type="text" size="small" icon={<UpOutlined />} disabled={!canPrev} onClick={() => rowIndex !== null && onNavigate(rowIndex - 1)} />
            <Button type="text" size="small" icon={<DownOutlined />} disabled={!canNext} onClick={() => rowIndex !== null && onNavigate(rowIndex + 1)} />
            <Typography.Text strong style={{ fontSize: 16 }}>{title}</Typography.Text>
          </Space>
          <Space>
            <Button type="text" size="small" icon={<MoreOutlined />} />
            <Button type="text" size="small" onClick={onClose}>✕</Button>
          </Space>
        </Flex>

        {rowIndex !== null && (
          <Tabs
            defaultActiveKey="detail"
            items={[
              {
                key: 'detail',
                label: '详情',
                children: (
                  <RecordDetailFormFields
                    table={table}
                    rowIndex={rowIndex}
                    resetKey={rowIndex}
                    onFieldChange={() => setFieldRevision(v => v + 1)}
                    style={{ maxHeight: '60vh', overflow: 'auto', padding: '8px 20px 20px' }}
                  />
                ),
              },
              {
                key: 'history',
                label: '历史',
                children: rowIndex !== null ? (
                  <RecordDetailHistoryPanel
                    table={table}
                    record={record}
                    revision={fieldRevision}
                    style={{ maxHeight: '60vh', overflow: 'auto', padding: '8px 20px 20px' }}
                  />
                ) : null,
              },
            ]}
          />
        )}
      </div>
    </Modal>
  );
};

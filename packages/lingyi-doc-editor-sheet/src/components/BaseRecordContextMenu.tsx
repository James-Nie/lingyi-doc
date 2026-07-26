import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Flex, InputNumber, Menu, Typography } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  FilterOutlined,
  PlusOutlined,
  ProfileOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import { isBaseSheet } from '@lingyi-doc/core-types';
import { getCellText } from '@lingyi-doc/core-types';
import { BASE_SHEET_CONTEXT_MENU_Z_INDEX } from './base/baseAntdConfig';

export interface BaseRecordContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  rowIndex: number;
  colIndex: number;
  table: FreeTable;
  onClose: () => void;
  onInsertRowsAbove: (rowIndex: number, count: number) => void;
  onInsertRowsBelow: (rowIndex: number, count: number) => void;
  onViewDetail: (rowIndex: number) => void;
  onViewHistory: (rowIndex: number) => void;
  onAddChildRecord: (rowIndex: number) => void;
  onAddComment: (rowIndex: number, colIndex: number) => void;
  onFilterByCell: (rowIndex: number, colIndex: number) => void;
  onDeleteRecord: (rowIndex: number) => void;
  /** 当前勾选的记录行（模型行索引）；右键行在勾选集内且数量>1 时走批量删除 */
  selectedRowIndices?: number[];
  showRecordDetailActions?: boolean;
  commentsEnabled?: boolean;
}

function truncateText(text: string, max = 8): string {
  const trimmed = text.trim();
  if (!trimmed) return '空值';
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
}

const InsertRowMenuItem: React.FC<{
  direction: 'above' | 'below';
  onSubmit: (count: number) => void;
}> = ({ direction, onSubmit }) => {
  const [count, setCount] = useState(1);
  return (
    <Flex align="center" gap={8} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
      {direction === 'above' ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
      <span>{direction === 'above' ? '向上插入' : '向下插入'}</span>
      <InputNumber
        size="small"
        min={1}
        max={100}
        value={count}
        style={{ width: 52 }}
        onChange={value => setCount(Math.max(1, Math.min(100, value ?? 1)))}
      />
      <Typography.Text type="secondary">行</Typography.Text>
      <Typography.Link onClick={() => onSubmit(count)}>确定</Typography.Link>
    </Flex>
  );
};

export const BaseRecordContextMenu: React.FC<BaseRecordContextMenuProps> = ({
  visible, x, y, rowIndex, colIndex, table, onClose,
  onInsertRowsAbove, onInsertRowsBelow, onViewDetail, onViewHistory,
  onAddChildRecord, onAddComment, onFilterByCell, onDeleteRecord,
  selectedRowIndices = [],
  showRecordDetailActions = true,
  commentsEnabled = false,
}) => {
  const filterLabel = useMemo(() => {
    const sheet = table.sheet;
    const colDef = isBaseSheet(sheet) ? sheet.columnDefs[colIndex] : undefined;
    const cell = table.getCell(rowIndex, colIndex);
    const text = cell ? getCellText(cell.value) : '';
    return `按 ${truncateText(text || colDef?.name || '')} 筛选`;
  }, [table, rowIndex, colIndex]);

  const deleteCount = useMemo(() => {
    if (selectedRowIndices.length > 1 && selectedRowIndices.includes(rowIndex)) {
      return selectedRowIndices.length;
    }
    return 1;
  }, [selectedRowIndices, rowIndex]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [visible, onClose]);

  const position = useMemo(() => {
    const menuH = 360;
    const menuW = 260;
    const adjX = x + menuW > window.innerWidth ? x - menuW : x;
    const adjY = y + menuH > window.innerHeight ? y - menuH : y;
    return { left: Math.max(8, adjX), top: Math.max(8, adjY) };
  }, [x, y]);

  const run = (fn: () => void) => {
    fn();
    onClose();
  };

  const menuItems = useMemo((): MenuProps['items'] => {
    const items: NonNullable<MenuProps['items']> = [
      {
        key: 'insert-above',
        label: <InsertRowMenuItem direction="above" onSubmit={count => run(() => onInsertRowsAbove(rowIndex, count))} />,
      },
      {
        key: 'insert-below',
        label: <InsertRowMenuItem direction="below" onSubmit={count => run(() => onInsertRowsBelow(rowIndex, count))} />,
      },
    ];

    if (showRecordDetailActions) {
      items.push(
        { type: 'divider' },
        { key: 'view-detail', icon: <ProfileOutlined />, label: '查看详情', onClick: () => run(() => onViewDetail(rowIndex)) },
        { key: 'add-child', icon: <PlusOutlined />, label: '添加子记录', onClick: () => run(() => onAddChildRecord(rowIndex)) },
        { key: 'view-history', icon: <ClockCircleOutlined />, label: '查看记录历史', onClick: () => run(() => onViewHistory(rowIndex)) },
      );
    }

    if (commentsEnabled) {
      items.push({
        key: 'add-comment',
        label: '添加评论',
        onClick: () => run(() => onAddComment(rowIndex, colIndex)),
      });
    }

    items.push(
      { key: 'filter-by-cell', icon: <FilterOutlined />, label: filterLabel, onClick: () => run(() => onFilterByCell(rowIndex, colIndex)) },
      { type: 'divider' },
      {
        key: 'delete-record',
        icon: <DeleteOutlined />,
        label: deleteCount > 1 ? `删除 ${deleteCount} 条记录` : '删除记录',
        danger: true,
        onClick: () => run(() => onDeleteRecord(rowIndex)),
      },
    );

    return items;
  }, [
    showRecordDetailActions, commentsEnabled, filterLabel, deleteCount, rowIndex, colIndex,
    onInsertRowsAbove, onInsertRowsBelow, onViewDetail, onAddChildRecord,
    onViewHistory, onAddComment, onFilterByCell, onDeleteRecord,
  ]);

  if (!visible) return null;

  return createPortal(
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: BASE_SHEET_CONTEXT_MENU_Z_INDEX - 1 }}
        onMouseDown={onClose}
      />
      <div
        data-sheet-keep-selection
        style={{
          position: 'fixed',
          left: position.left,
          top: position.top,
          zIndex: BASE_SHEET_CONTEXT_MENU_Z_INDEX,
        }}
        onClick={e => e.stopPropagation()}
      >
        <Menu
          items={menuItems}
          style={{
            borderRadius: 8,
            border: '1px solid #e8e8e8',
            boxShadow: '0 6px 24px rgba(0, 0, 0, 0.12)',
            minWidth: 240,
          }}
        />
      </div>
    </>,
    document.body,
  );
};

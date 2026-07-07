import React, { useCallback } from 'react';
import type { ColumnFilterCondition, FreeTable } from '@lingyi-doc/core';
import { colToName, COLUMN_FILTER_OPERATORS } from '@lingyi-doc/core';
import { ToolbarPopover } from './ToolbarPopover';

interface ColumnFilterPopoverProps {
  table: FreeTable;
  open: boolean;
  onClose: () => void;
  defaultCol?: number;
  trigger: React.ReactNode;
}

export const ColumnFilterPopover: React.FC<ColumnFilterPopoverProps> = ({
  table,
  open,
  onClose,
  defaultCol = 0,
  trigger,
}) => {
  const sheet = table.sheet;
  const conditions = sheet.columnFilters ?? [];

  const updateConditions = useCallback((next: ColumnFilterCondition[]) => {
    table.setColumnFilters(next);
  }, [table]);

  const handleAdd = useCallback(() => {
    updateConditions([
      ...conditions,
      { col: defaultCol, mode: 'condition', operator: 'contains', value: '' },
    ]);
  }, [conditions, defaultCol, updateConditions]);

  const colOptions = Array.from({ length: sheet.colCount }, (_, i) => i);

  return (
    <ToolbarPopover
      open={open}
      onClose={onClose}
      width={520}
      maxHeight={420}
      trigger={trigger}
      title="列筛选"
      titleExtra={
        conditions.length > 0 ? (
          <button
            type="button"
            onClick={() => updateConditions([])}
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: '#999' }}
          >
            清空全部
          </button>
        ) : undefined
      }
    >
      <div style={{ padding: '8px 16px 12px' }}>
        {conditions.length === 0 && (
          <div style={{ fontSize: 12, color: '#999', padding: '8px 0' }}>
            暂无筛选条件。首行作为表头始终显示，其余行按条件过滤。
          </div>
        )}
        {conditions.map((cond, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <select
              value={cond.col}
              onChange={e => {
                const next = [...conditions];
                next[i] = { ...next[i], col: Number(e.target.value) };
                updateConditions(next);
              }}
              style={{ padding: '4px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, width: 72 }}
            >
              {colOptions.map(col => (
                <option key={col} value={col}>{colToName(col)}</option>
              ))}
            </select>
            <select
              value={cond.operator ?? 'contains'}
              onChange={e => {
                const next = [...conditions];
                next[i] = { ...next[i], mode: 'condition', operator: e.target.value as ColumnFilterCondition['operator'] };
                updateConditions(next);
              }}
              style={{ padding: '4px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, flex: 1 }}
            >
              {COLUMN_FILTER_OPERATORS.map(op => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
            {!['empty', 'notEmpty'].includes(cond.operator ?? '') && (
              <input
                type="text"
                value={cond.value ?? ''}
                onChange={e => {
                  const next = [...conditions];
                  next[i] = { ...next[i], value: e.target.value };
                  updateConditions(next);
                }}
                placeholder="值"
                style={{ padding: '4px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, width: 100 }}
              />
            )}
            <button
              type="button"
              onClick={() => updateConditions(conditions.filter((_, idx) => idx !== i))}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#999', fontSize: 14 }}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={handleAdd}
          style={{
            padding: '6px 12px',
            border: '1px dashed #ccc',
            borderRadius: 4,
            background: '#fafafa',
            cursor: 'pointer',
            fontSize: 12,
            color: '#666',
            width: '100%',
          }}
        >
          + 添加条件
        </button>
      </div>
    </ToolbarPopover>
  );
};

import React, { useMemo, useState } from 'react';
import {
  EyeInvisibleOutlined,
  EyeOutlined,
  HolderOutlined,
  LockOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Input, Segmented, Select, Typography } from 'antd';
import type { ColumnDef } from '@lingyi-doc/core-types';
import { BASE_THEME } from '@lingyi-doc/core-sheet';
import { baseSheetSelectProps } from '../baseAntdConfig';
import { FieldTypeIcon } from '../FieldTypeIcon';

export interface KanbanCardConfigPopoverProps {
  columnDefs: ColumnDef[];
  titleFieldId?: string;
  cardFieldIds: string[];
  showFieldNames: boolean;
  coverFieldId: string | null;
  onChangeCardFields: (fieldIds: string[]) => void;
  onChangeShowFieldNames: (show: boolean) => void;
  onChangeCoverFieldId: (fieldId: string | null) => void;
}

export const KanbanCardConfigPopover: React.FC<KanbanCardConfigPopoverProps> = ({
  columnDefs,
  titleFieldId,
  cardFieldIds,
  showFieldNames,
  coverFieldId,
  onChangeCardFields,
  onChangeShowFieldNames,
  onChangeCoverFieldId,
}) => {
  const [query, setQuery] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);

  const visibleCols = useMemo(
    () => columnDefs.filter(c => !c.hidden),
    [columnDefs],
  );

  const attachmentFields = visibleCols.filter(c => c.type === 'attachment');

  const defaultCardFieldIds = useMemo(() => {
    const title = titleFieldId || visibleCols[0]?.id;
    const result: string[] = [];
    for (const col of visibleCols) {
      if (col.id === title) continue;
      result.push(col.id);
      if (result.length >= 4) break;
    }
    return result;
  }, [visibleCols, titleFieldId]);

  const effectiveCardFieldIds = cardFieldIds.length > 0 ? cardFieldIds : defaultCardFieldIds;

  const orderedFields = useMemo(() => {
    const visibleSet = new Set(effectiveCardFieldIds);
    const ordered: ColumnDef[] = [];
    const title = titleFieldId ? visibleCols.find(c => c.id === titleFieldId) : visibleCols[0];
    if (title) ordered.push(title);
    for (const id of effectiveCardFieldIds) {
      const col = visibleCols.find(c => c.id === id);
      if (col && col.id !== title?.id) ordered.push(col);
    }
    for (const col of visibleCols) {
      if (col.id === title?.id) continue;
      if (!visibleSet.has(col.id)) ordered.push(col);
    }
    return ordered;
  }, [visibleCols, effectiveCardFieldIds, titleFieldId]);

  const filtered = orderedFields.filter(c =>
    !query.trim() || c.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const isVisible = (id: string) => {
    if (id === titleFieldId || id === orderedFields[0]?.id) return true;
    return effectiveCardFieldIds.includes(id);
  };

  const toggleVisible = (id: string) => {
    if (id === titleFieldId || id === orderedFields[0]?.id) return;
    const current = [...effectiveCardFieldIds];
    if (current.includes(id)) {
      onChangeCardFields(current.filter(f => f !== id));
    } else {
      onChangeCardFields([...current, id]);
    }
  };

  const reorder = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const titleId = titleFieldId || orderedFields[0]?.id;
    if (fromId === titleId || toId === titleId) return;
    const current = [...effectiveCardFieldIds];
    const from = current.indexOf(fromId);
    const to = current.indexOf(toId);
    if (from < 0) {
      const insertAt = to >= 0 ? to : current.length;
      current.splice(insertAt, 0, fromId);
    } else if (to < 0) {
      return;
    } else {
      const [moved] = current.splice(from, 1);
      current.splice(to, 0, moved);
    }
    onChangeCardFields(current);
  };

  return (
    <div style={{ width: 300 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>显示封面</Typography.Text>
          <Select
            {...baseSheetSelectProps}
            style={{ width: 140 }}
            allowClear
            placeholder="无"
            value={coverFieldId || undefined}
            options={attachmentFields.map(f => ({ value: f.id, label: f.name }))}
            onChange={v => onChangeCoverFieldId(v ?? null)}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>显示字段名</Typography.Text>
          <Segmented
            size="small"
            value={showFieldNames ? 'show' : 'hide'}
            options={[
              { value: 'show', label: '显示' },
              { value: 'hide', label: '隐藏' },
            ]}
            onChange={v => onChangeShowFieldNames(v === 'show')}
          />
        </div>
      </div>

      <Input
        size="small"
        allowClear
        prefix={<SearchOutlined style={{ color: BASE_THEME.secondaryTextColor }} />}
        placeholder="搜索"
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{ marginBottom: 8 }}
      />

      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {filtered.map(field => {
          const locked = field.id === titleFieldId || field.id === orderedFields[0]?.id;
          const visible = isVisible(field.id);
          return (
            <div
              key={field.id}
              draggable={!locked}
              onDragStart={() => setDragId(field.id)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => {
                if (dragId) reorder(dragId, field.id);
                setDragId(null);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 4px',
                borderRadius: 6,
                background: dragId === field.id ? BASE_THEME.selectionHeaderBg : 'transparent',
              }}
            >
              <span style={{ color: BASE_THEME.secondaryTextColor, width: 14, cursor: locked ? 'default' : 'grab' }}>
                {locked ? <LockOutlined /> : <HolderOutlined />}
              </span>
              <FieldTypeIcon type={field.type} size={16} color={BASE_THEME.headerIconColor} />
              <span style={{
                flex: 1,
                fontSize: 13,
                color: BASE_THEME.cellTextColor,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {field.name}
              </span>
              <button
                type="button"
                disabled={locked}
                onClick={() => toggleVisible(field.id)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: locked ? 'not-allowed' : 'pointer',
                  color: visible ? BASE_THEME.primaryColor : BASE_THEME.secondaryTextColor,
                  padding: 4,
                }}
              >
                {visible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

import React, { useState, useCallback, useEffect } from 'react';
import {
  Badge,
  Button,
  Divider,
  Empty,
  Flex,
  Input,
  InputNumber,
  Popover,
  Radio,
  Segmented,
  Select,
  Space,
  Switch,
  Typography,
} from 'antd';
import {
  AppstoreOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  CloseOutlined,
  ColumnHeightOutlined,
  CommentOutlined,
  EyeOutlined,
  FilterOutlined,
  FormOutlined,
  MinusOutlined,
  PlusOutlined,
  RedoOutlined,
  SearchOutlined,
  SettingOutlined,
  SortAscendingOutlined,
  TableOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { useSheetStore } from '../../store/sheetStore';
import { FieldManagePopover } from '../FieldManagePopover';
import type { FreeTable, ColumnDef, GroupRule, FilterCondition, SortRule } from '@lingyi-doc/core';
import { BASE_THEME, isGroupableColumn, isBaseSheet } from '@lingyi-doc/core';
import { baseSheetPopoverProps, baseSheetSelectProps, baseToolbarBtnActiveStyle } from '../base/baseAntdConfig';

interface BaseToolbarProps {
  table: FreeTable;
  onToggleFieldVisibility: (fieldId: string, visible: boolean) => void;
  onReorderFields: (fromIndex: number, toIndex: number) => void;
  onConfirmField: (fieldId: string | null, fieldData: Partial<ColumnDef>) => void;
  onDeleteField: (fieldId: string) => void;
  onAddRecord: () => void;
  onGenerateForm: () => void;
  recordCount: number;
  filteredRecordCount?: number;
  selectedCount: number;
  groupRules?: GroupRule[];
  onGroupRulesChange?: (rules: GroupRule[]) => void;
  filterConditions?: FilterCondition[];
  onFilterChange?: (conditions: FilterCondition[]) => void;
  sortRules?: SortRule[];
  onSortChange?: (rules: SortRule[]) => void;
}

type PopoverKey = 'field' | 'view' | 'filter' | 'group' | 'sort' | 'rowHeight';

const ROW_HEIGHTS = { compact: 28, standard: 40, loose: 56 } as const;

function rowHeightToMode(height: number): 'compact' | 'standard' | 'loose' {
  if (height <= 30) return 'compact';
  if (height >= 50) return 'loose';
  return 'standard';
}

const FILTER_OPERATORS_TEXT = [
  { value: 'eq', label: '等于' },
  { value: 'ne', label: '不等于' },
  { value: 'contains', label: '包含' },
  { value: 'empty', label: '为空' },
  { value: 'notEmpty', label: '不为空' },
] as const;

const FILTER_OPERATORS_NUMBER = [
  { value: 'eq', label: '等于' },
  { value: 'ne', label: '不等于' },
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '小于等于' },
  { value: 'empty', label: '为空' },
  { value: 'notEmpty', label: '不为空' },
] as const;

const FILTER_OPERATORS_SELECT = [
  { value: 'eq', label: '等于' },
  { value: 'ne', label: '不等于' },
  { value: 'empty', label: '为空' },
  { value: 'notEmpty', label: '不为空' },
] as const;

function getFilterOperators(field?: ColumnDef) {
  const type = field?.type ?? 'text';
  if (type === 'select' || type === 'multiSelect') return FILTER_OPERATORS_SELECT;
  if (type === 'number' || type === 'currency' || type === 'percent' || type === 'date' || type === 'datetime') {
    return FILTER_OPERATORS_NUMBER;
  }
  return FILTER_OPERATORS_TEXT;
}

function defaultFilterOperator(field?: ColumnDef): FilterCondition['operator'] {
  return getFilterOperators(field)[0].value;
}

function normalizeFilterCondition(cond: FilterCondition, field?: ColumnDef): FilterCondition {
  const ops = getFilterOperators(field);
  const operator = ops.some(o => o.value === cond.operator)
    ? cond.operator
    : defaultFilterOperator(field);
  if (operator === 'empty' || operator === 'notEmpty') {
    return { fieldId: cond.fieldId, operator };
  }
  return { ...cond, operator };
}

const SORT_LABELS: Record<string, { asc: string; desc: string }> = {
  text: { asc: 'A → Z', desc: 'Z → A' },
  number: { asc: '0 → 9', desc: '9 → 0' },
  date: { asc: '0 → 9', desc: '9 → 0' },
  datetime: { asc: '0 → 9', desc: '9 → 0' },
  default: { asc: 'A → Z', desc: 'Z → A' },
};

const GROUP_LEVEL_LABELS = ['一级分组', '二级分组', '三级分组', '四级分组', '五级分组'];

function panelTitle(label: string, onClear?: () => void) {
  return (
    <Flex justify="space-between" align="center" style={{ width: '100%' }}>
      <Typography.Text strong>{label}</Typography.Text>
      {onClear && (
        <Typography.Link onClick={onClear}>清空全部</Typography.Link>
      )}
    </Flex>
  );
}

function toolbarBtnStyle(active?: boolean): React.CSSProperties {
  return active ? { ...baseToolbarBtnActiveStyle } : {};
}

export const BaseToolbar: React.FC<BaseToolbarProps> = ({
  table, onToggleFieldVisibility, onReorderFields,
  onConfirmField, onDeleteField, onAddRecord, onGenerateForm, recordCount, filteredRecordCount, selectedCount,
  groupRules = [], onGroupRulesChange,
  filterConditions = [], onFilterChange,
  sortRules = [], onSortChange,
}) => {
  const setStatusText = useSheetStore(s => s.setStatusText);
  const zoomLevel = useSheetStore(s => s.zoomLevel);
  const setZoomLevel = useSheetStore(s => s.setZoomLevel);

  const sheetModel = table.sheet;
  const isBase = isBaseSheet(sheetModel);
  const sheet = isBase ? sheetModel : null;
  const columnDefs = sheet?.columnDefs ?? [];
  const groupableColumns = columnDefs.filter(isGroupableColumn);
  const [activePopover, setActivePopover] = useState<PopoverKey | null>(null);
  const [findQuery, setFindQuery] = useState('');
  const [autoSort, setAutoSort] = useState(true);
  const [rowHeightMode, setRowHeightMode] = useState<'compact' | 'standard' | 'loose'>(() =>
    rowHeightToMode(table.getDefaultRowHeight()),
  );

  useEffect(() => {
    setRowHeightMode(rowHeightToMode(table.getDefaultRowHeight()));
  }, [table, sheet?.defaultRowHeight, table.rowCount]);


  const closePopover = useCallback(() => {
    setActivePopover(null);
  }, []);

  const handleRowHeight = useCallback((mode: 'compact' | 'standard' | 'loose') => {
    setRowHeightMode(mode);
    const height = ROW_HEIGHTS[mode];
    table.setDefaultRowHeight(height);
    table.notifyChange(null);
    closePopover();
    setStatusText(`行高已设为${mode === 'compact' ? '紧凑' : mode === 'standard' ? '标准' : '宽松'} (${height}px)`);
  }, [table, setStatusText, closePopover]);

  const handleFind = useCallback(() => {
    if (!findQuery.trim()) {
      setStatusText('请输入查找内容');
      return;
    }
    const query = findQuery.trim().toLowerCase();
    for (let r = 0; r < table.rowCount; r++) {
      for (let c = 0; c < table.colCount; c++) {
        const cell = table.getCell(r, c);
        const text = cell?.value ? String(cell.value) : '';
        if (text.toLowerCase().includes(query)) {
          useSheetStore.getState().setSelection(
            { sheetId: table.sheetId, start: { row: r, col: c }, end: { row: r, col: c } },
            { row: r, col: c },
          );
          setStatusText(`找到匹配项 (第 ${r + 1} 行, 列 ${String.fromCharCode(65 + c)})`);
          return;
        }
      }
    }
    setStatusText('未找到匹配项');
  }, [findQuery, table, setStatusText]);

  const handleAddFilter = useCallback(() => {
    if (!columnDefs.length || !onFilterChange) return;
    const field = columnDefs[0];
    onFilterChange([...filterConditions, {
      fieldId: field.id,
      operator: defaultFilterOperator(field),
      value: '',
    }]);
  }, [columnDefs, filterConditions, onFilterChange]);

  const handleAddSort = useCallback(() => {
    if (!columnDefs.length || !onSortChange) return;
    onSortChange([...sortRules, { fieldId: columnDefs[0].id, order: 'asc' }]);
  }, [columnDefs, sortRules, onSortChange]);

  const handleAddGroup = useCallback(() => {
    if (!groupableColumns.length || !onGroupRulesChange) return;
    const used = new Set(groupRules.map(r => r.fieldId));
    const nextField = groupableColumns.find(c => !used.has(c.id));
    if (!nextField) return;
    onGroupRulesChange([...groupRules, { fieldId: nextField.id, order: 'asc' }]);
  }, [groupableColumns, groupRules, onGroupRulesChange]);

  const moveGroupRule = useCallback((from: number, to: number) => {
    if (!onGroupRulesChange || to < 0 || to >= groupRules.length) return;
    const next = [...groupRules];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onGroupRulesChange(next);
  }, [groupRules, onGroupRulesChange]);

  const getSortLabels = (fieldId: string) => {
    const field = columnDefs.find(c => c.id === fieldId);
    const type = field?.type || 'text';
    return SORT_LABELS[type] || SORT_LABELS.default;
  };

  const fieldOptions = columnDefs.map(c => ({ value: c.id, label: c.name }));
  const groupableOptions = groupableColumns.map(c => ({ value: c.id, label: c.name }));

  if (!isBase || !sheet) return null;

  const renderToolbarPopover = (
    key: PopoverKey,
    trigger: React.ReactNode,
    content: React.ReactNode,
    options?: { title?: React.ReactNode; width?: number; active?: boolean },
  ) => (
    <Popover
      {...baseSheetPopoverProps}
      open={activePopover === key}
      onOpenChange={open => setActivePopover(open ? key : null)}
      trigger="click"
      placement="bottomLeft"
      title={options?.title}
      content={content}
      styles={{
        ...baseSheetPopoverProps.styles,
        root: {
          ...baseSheetPopoverProps.styles?.root,
          ...(options?.width ? { width: options.width } : {}),
        },
      }}
    >
      <Button
        type="text"
        size="small"
        style={toolbarBtnStyle(options?.active ?? activePopover === key)}
      >
        {trigger}
      </Button>
    </Popover>
  );

  const filterPanel = (
    <div style={{ width: 420 }}>
      {filterConditions.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无筛选条件" style={{ margin: '4px 0 12px' }} />
      ) : (
        <Space direction="vertical" size={10} style={{ width: '100%', marginBottom: 12 }}>
          {filterConditions.map((cond, i) => {
            const field = columnDefs.find(c => c.id === cond.fieldId);
            const operators = getFilterOperators(field);
            const needsValue = !['empty', 'notEmpty'].includes(cond.operator);
            const isNumberField = field?.type === 'number' || field?.type === 'currency' || field?.type === 'percent';
            return (
              <Flex key={i} gap={8} align="center" style={{ width: '100%' }}>
                <Select
                  {...baseSheetSelectProps}
                  size="small"
                  style={{ flex: 1, minWidth: 0 }}
                  value={cond.fieldId}
                  options={fieldOptions}
                  onChange={fieldId => {
                    if (!onFilterChange) return;
                    const nextField = columnDefs.find(c => c.id === fieldId);
                    const newConds = [...filterConditions];
                    newConds[i] = normalizeFilterCondition({ ...newConds[i], fieldId, value: '' }, nextField);
                    onFilterChange(newConds);
                  }}
                />
                <Select
                  {...baseSheetSelectProps}
                  size="small"
                  style={{ width: 96, flexShrink: 0 }}
                  value={cond.operator}
                  options={operators.map(op => ({ value: op.value, label: op.label }))}
                  onChange={operator => {
                    if (!onFilterChange) return;
                    const newConds = [...filterConditions];
                    if (operator === 'empty' || operator === 'notEmpty') {
                      newConds[i] = { fieldId: cond.fieldId, operator };
                    } else {
                      newConds[i] = { ...newConds[i], operator };
                    }
                    onFilterChange(newConds);
                  }}
                />
                {needsValue ? (
                  field?.type === 'select' && field.options?.length ? (
                    <Select
                      {...baseSheetSelectProps}
                      size="small"
                      style={{ flex: 1, minWidth: 0 }}
                      placeholder="值"
                      allowClear
                      value={cond.value != null ? String(cond.value) : undefined}
                      options={field.options.map(opt => ({ value: opt.name, label: opt.name }))}
                      onChange={value => {
                        if (!onFilterChange) return;
                        const newConds = [...filterConditions];
                        newConds[i] = { ...newConds[i], value: value ?? '' };
                        onFilterChange(newConds);
                      }}
                    />
                  ) : isNumberField ? (
                    <InputNumber
                      size="small"
                      style={{ flex: 1, minWidth: 0 }}
                      placeholder="值"
                      value={cond.value != null && cond.value !== '' ? Number(cond.value) : undefined}
                      onChange={value => {
                        if (!onFilterChange) return;
                        const newConds = [...filterConditions];
                        newConds[i] = { ...newConds[i], value: value ?? '' };
                        onFilterChange(newConds);
                      }}
                    />
                  ) : (
                    <Input
                      size="small"
                      style={{ flex: 1, minWidth: 0 }}
                      placeholder="值"
                      value={cond.value != null ? String(cond.value) : ''}
                      onChange={e => {
                        if (!onFilterChange) return;
                        const newConds = [...filterConditions];
                        newConds[i] = { ...newConds[i], value: e.target.value };
                        onFilterChange(newConds);
                      }}
                    />
                  )
                ) : (
                  <div style={{ flex: 1, minWidth: 0 }} />
                )}
                <Button
                  type="text"
                  size="small"
                  icon={<CloseOutlined />}
                  aria-label="删除条件"
                  onClick={() => onFilterChange?.(filterConditions.filter((_, idx) => idx !== i))}
                />
              </Flex>
            );
          })}
        </Space>
      )}
      <Button type="dashed" block size="small" icon={<PlusOutlined />} onClick={handleAddFilter}>
        添加条件
      </Button>
    </div>
  );

  const groupPanel = (
    <div style={{ width: 388 }}>
      {groupRules.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无分组规则" style={{ margin: '8px 0 12px' }} />
      ) : (
        <Space direction="vertical" size={8} style={{ width: '100%', marginBottom: 12 }}>
          {groupRules.map((rule, i) => (
            <Flex key={i} gap={6} align="center">
              <Typography.Text type="secondary" style={{ fontSize: 12, minWidth: 56, flexShrink: 0 }}>
                {GROUP_LEVEL_LABELS[i] ?? `${i + 1}级分组`}
              </Typography.Text>
              <Select
                {...baseSheetSelectProps}
                size="small"
                style={{ flex: 1, minWidth: 0 }}
                value={rule.fieldId}
                options={groupableOptions}
                onChange={fieldId => {
                  if (!onGroupRulesChange) return;
                  const next = [...groupRules];
                  next[i] = { ...next[i], fieldId };
                  onGroupRulesChange(next);
                }}
              />
              <Radio.Group
                size="small"
                value={rule.order}
                onChange={e => {
                  if (!onGroupRulesChange) return;
                  const next = [...groupRules];
                  next[i] = { ...next[i], order: e.target.value };
                  onGroupRulesChange(next);
                }}
              >
                <Radio.Button value="asc">A → Z</Radio.Button>
                <Radio.Button value="desc">Z → A</Radio.Button>
              </Radio.Group>
              <Button type="text" size="small" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => moveGroupRule(i, i - 1)} />
              <Button type="text" size="small" icon={<ArrowDownOutlined />} disabled={i === groupRules.length - 1} onClick={() => moveGroupRule(i, i + 1)} />
              <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => onGroupRulesChange?.(groupRules.filter((_, idx) => idx !== i))} />
            </Flex>
          ))}
        </Space>
      )}
      <Button
        type="dashed"
        block
        size="small"
        icon={<PlusOutlined />}
        disabled={groupRules.length >= groupableColumns.length}
        onClick={handleAddGroup}
      >
        添加分组字段
      </Button>
    </div>
  );

  const sortPanel = (
    <div style={{ width: 388 }}>
      {sortRules.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无排序规则" style={{ margin: '8px 0 12px' }} />
      ) : (
        <Space direction="vertical" size={8} style={{ width: '100%', marginBottom: 12 }}>
          {sortRules.map((rule, i) => {
            const labels = getSortLabels(rule.fieldId);
            return (
              <Flex key={i} gap={6} align="center">
                <Typography.Text type="secondary" style={{ fontSize: 12, cursor: 'grab' }}>⋮⋮</Typography.Text>
                <Select
                  {...baseSheetSelectProps}
                  size="small"
                  style={{ flex: 1, minWidth: 0 }}
                  value={rule.fieldId}
                  options={fieldOptions}
                  onChange={fieldId => {
                    if (!onSortChange) return;
                    const newRules = [...sortRules];
                    newRules[i] = { ...newRules[i], fieldId };
                    onSortChange(newRules);
                  }}
                />
                <Radio.Group
                  size="small"
                  value={rule.order}
                  onChange={e => {
                    if (!onSortChange) return;
                    const newRules = [...sortRules];
                    newRules[i] = { ...newRules[i], order: e.target.value };
                    onSortChange(newRules);
                  }}
                >
                  <Radio.Button value="asc">{labels.asc}</Radio.Button>
                  <Radio.Button value="desc">{labels.desc}</Radio.Button>
                </Radio.Group>
                <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => onSortChange?.(sortRules.filter((_, idx) => idx !== i))} />
              </Flex>
            );
          })}
        </Space>
      )}
      <Button type="dashed" block size="small" icon={<PlusOutlined />} onClick={handleAddSort}>
        选择条件
      </Button>
    </div>
  );

  const rowHeightPanel = (
    <Segmented
      block
      size="small"
      value={rowHeightMode}
      onChange={value => handleRowHeight(value as 'compact' | 'standard' | 'loose')}
      options={[
        { value: 'compact', label: '紧凑 (28px)' },
        { value: 'standard', label: '标准 (40px)' },
        { value: 'loose', label: '宽松 (56px)' },
      ]}
      style={{ width: 160 }}
    />
  );

  const countBadge = (count: number) => (
    count > 0 ? <Badge count={count} size="small" style={{ marginLeft: 4 }} /> : null
  );

  return (
    <Flex
      data-sheet-keep-selection
      align="center"
      wrap="wrap"
      gap={4}
      style={{
        padding: '6px 12px',
        borderBottom: `1px solid ${BASE_THEME.toolbarBorder}`,
        background: BASE_THEME.toolbarBg,
        minHeight: 40,
        userSelect: 'none',
        position: 'relative',
        fontFamily: BASE_THEME.fontFamily,
      }}
    >
      <Space size={4} align="center" style={{ marginRight: 4, flexShrink: 0 }}>
        <TableOutlined style={{ color: BASE_THEME.secondaryTextColor, fontSize: 14 }} />
        <Typography.Text strong style={{ fontSize: 14 }}>表格</Typography.Text>
      </Space>

      <Divider type="vertical" style={{ height: 20, margin: '0 4px' }} />

      {renderToolbarPopover(
        'field',
        <><SettingOutlined /> 字段配置</>,
        <FieldManagePopover
          columnDefs={sheet.columnDefs}
          onToggleFieldVisibility={onToggleFieldVisibility}
          onReorderFields={onReorderFields}
          onConfirmField={onConfirmField}
          onDeleteField={onDeleteField}
        />,
        { width: 260 },
      )}

      {renderToolbarPopover(
        'view',
        <><EyeOutlined /> 视图配置</>,
        <Flex align="center" justify="space-between" gap={12} style={{ width: 328 }}>
          <Typography.Text type="secondary" style={{ flexShrink: 0 }}>选择父记录字段</Typography.Text>
          <Select
            {...baseSheetSelectProps}
            size="small"
            style={{ flex: 1 }}
            placeholder="请选择父记录"
            allowClear
            options={fieldOptions}
          />
        </Flex>,
        { title: panelTitle('视图配置'), width: 360 },
      )}

      <Divider type="vertical" style={{ height: 20, margin: '0 4px' }} />

      {renderToolbarPopover(
        'filter',
        <><FilterOutlined /> 筛选{countBadge(filterConditions.length)}</>,
        filterPanel,
        {
          title: panelTitle('筛选条件', filterConditions.length > 0 ? () => onFilterChange?.([]) : undefined),
          width: 456,
          active: activePopover === 'filter' || filterConditions.length > 0,
        },
      )}

      {renderToolbarPopover(
        'group',
        <><AppstoreOutlined /> 分组{countBadge(groupRules.length)}</>,
        groupPanel,
        {
          title: panelTitle('分组设置', groupRules.length > 0 ? () => onGroupRulesChange?.([]) : undefined),
          width: 420,
          active: activePopover === 'group' || groupRules.length > 0,
        },
      )}

      {renderToolbarPopover(
        'sort',
        <><SortAscendingOutlined /> 排序{countBadge(sortRules.length)}</>,
        sortPanel,
        {
          title: (
            <Flex justify="space-between" align="center" style={{ width: '100%' }}>
              <Typography.Text strong>设置排序条件</Typography.Text>
              <Space size={6} align="center">
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>自动排序</Typography.Text>
                <Switch size="small" checked={autoSort} onChange={setAutoSort} />
              </Space>
            </Flex>
          ),
          width: 420,
          active: activePopover === 'sort' || sortRules.length > 0,
        },
      )}

      <Divider type="vertical" style={{ height: 20, margin: '0 4px' }} />

      {renderToolbarPopover('rowHeight', <><ColumnHeightOutlined /> 行高</>, rowHeightPanel, { title: panelTitle('行高') })}

      <Divider type="vertical" style={{ height: 20, margin: '0 4px' }} />

      <Button type="text" size="small" icon={<FormOutlined />} onClick={onGenerateForm}>
        生成表单
      </Button>
      <Button type="text" size="small" icon={<CommentOutlined />} onClick={() => setStatusText('评论功能开发中')}>
        评论
      </Button>

      <Divider type="vertical" style={{ height: 20, margin: '0 4px' }} />

      <Button type="text" size="small" icon={<UndoOutlined />} onClick={() => { table.undo(); setStatusText('已撤销'); }}>
        撤销
      </Button>
      <Button type="text" size="small" icon={<RedoOutlined />} onClick={() => { table.redo(); setStatusText('已重做'); }}>
        重做
      </Button>

      <Divider type="vertical" style={{ height: 20, margin: '0 4px' }} />

      <Input
        size="small"
        allowClear
        prefix={<SearchOutlined style={{ color: BASE_THEME.secondaryTextColor }} />}
        placeholder="搜索记录..."
        value={findQuery}
        onChange={e => setFindQuery(e.target.value)}
        onPressEnter={handleFind}
        style={{ width: 180 }}
      />

      <Flex align="center" gap={4} style={{ marginLeft: 'auto' }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {selectedCount > 0 ? `${selectedCount} 条已选中 / ` : ''}
          {filteredRecordCount != null && filteredRecordCount !== recordCount
            ? `${filteredRecordCount} / ${recordCount} 条记录`
            : `${recordCount} 条记录`}
        </Typography.Text>

        <Divider type="vertical" style={{ height: 20, margin: '0 4px' }} />

        <Button type="link" size="small" icon={<PlusOutlined />} onClick={onAddRecord}>
          添加记录
        </Button>

        <Divider type="vertical" style={{ height: 20, margin: '0 4px' }} />

        <Space.Compact size="small">
          <Button icon={<MinusOutlined />} onClick={() => setZoomLevel(zoomLevel - 0.1)} />
          <Button style={{ minWidth: 48, pointerEvents: 'none', color: BASE_THEME.headerTextColor }}>
            {Math.round(zoomLevel * 100)}%
          </Button>
          <Button icon={<PlusOutlined />} onClick={() => setZoomLevel(zoomLevel + 0.1)} />
        </Space.Compact>
      </Flex>
    </Flex>
  );
};

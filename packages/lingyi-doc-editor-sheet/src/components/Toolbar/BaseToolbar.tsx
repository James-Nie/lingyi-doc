import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Badge,
  Button,
  DatePicker,
  Divider,
  Empty,
  Flex,
  Input,
  InputNumber,
  Popover,
  Radio,
  Select,
  Space,
  Switch,
  Typography,
} from 'antd';
import {
  AppstoreOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  CalendarOutlined,
  CloseOutlined,
  ColumnHeightOutlined,
  CommentOutlined,
  EyeOutlined,
  FilterOutlined,
  FormOutlined,
  MinusOutlined,
  ProfileOutlined,
  PlusOutlined,
  RedoOutlined,
  SearchOutlined,
  SettingOutlined,
  SortAscendingOutlined,
  TableOutlined,
  UndoOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useSheetStore } from '../../store/sheetStore';
import { FieldManagePopover } from '../FieldManagePopover';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import type { ColumnDef, GroupRule, FilterCondition, SortRule } from '@lingyi-doc/core-types';
import { getCellText } from '@lingyi-doc/core-types';
import { BASE_THEME, isGroupableColumn } from '@lingyi-doc/core-sheet';
import { isBaseSheet } from '@lingyi-doc/core-types';
import { baseSheetPopoverProps, baseSheetSelectProps, baseToolbarBtnActiveStyle } from '../base/baseAntdConfig';
import { FieldTypeIcon } from '../base/FieldTypeIcon';
import { KanbanCardConfigPopover } from '../base/kanban/KanbanCardConfigPopover';
import { KanbanGroupFieldPopover } from '../base/kanban/KanbanGroupFieldPopover';
import {
  defaultFilterOperatorForField,
  getFilterOperatorsForType,
  isValueLessFilterOperator,
  normalizeFilterCondition,
} from '../base/filterOperators';

interface BaseToolbarProps {
  table: FreeTable;
  onToggleFieldVisibility?: (fieldId: string, visible: boolean) => void;
  onReorderFields?: (fromIndex: number, toIndex: number) => void;
  onConfirmField?: (fieldId: string | null, fieldData: Partial<ColumnDef>) => void;
  onDeleteField?: (fieldId: string) => void;
  onAddRecord?: () => void;
  onGenerateForm?: () => void;
  recordCount: number;
  filteredRecordCount?: number;
  selectedCount?: number;
  groupRules?: GroupRule[];
  onGroupRulesChange?: (rules: GroupRule[]) => void;
  filterConditions?: FilterCondition[];
  onFilterChange?: (conditions: FilterCondition[]) => void;
  /** 筛选条件组合：所有=AND，任一=OR */
  filterConjunction?: 'and' | 'or';
  onFilterConjunctionChange?: (conjunction: 'and' | 'or') => void;
  sortRules?: SortRule[];
  onSortChange?: (rules: SortRule[]) => void;
  /** full=主编辑器；embed=仪表盘轻量条（筛选/分组/排序/查找） */
  mode?: 'full' | 'embed';
  /** embed 模式左侧标题，默认不展示「表格」文案 */
  embedTitle?: string;
  /** grid=表格工具栏；kanban=看板工具栏；calendar=日历工具栏 */
  variant?: 'grid' | 'kanban' | 'calendar';
  /** 看板：分组依据字段 */
  kanbanGroupFieldId?: string;
  onKanbanGroupFieldChange?: (fieldId: string) => void;
  /** 看板：卡片展示字段 */
  kanbanCardFields?: string[];
  onKanbanCardFieldsChange?: (fieldIds: string[]) => void;
  kanbanShowFieldNames?: boolean;
  onKanbanShowFieldNamesChange?: (show: boolean) => void;
  kanbanCoverFieldId?: string | null;
  onKanbanCoverFieldIdChange?: (fieldId: string | null) => void;
  /** 日历：日历配置点击 */
  onCalendarConfigClick?: () => void;
  /** 日历：配置弹层内容 */
  calendarConfigContent?: React.ReactNode;
  /** 日历：配置弹层标题 */
  calendarConfigTitle?: string;
  /** 日历：无日期记录数量 */
  noDateCount?: number;
  /** 日历：打开无日期记录抽屉 */
  onOpenNoDate?: () => void;
  /** 日历：导航标题（如 2025年7月） */
  calendarTitle?: string;
  /** 日历：切换视图类型 */
  calendarViewType?: 'month' | 'week' | 'day';
  onCalendarViewTypeChange?: (type: 'month' | 'week' | 'day') => void;
  /** 日历：导航 */
  onCalendarNavigate?: (direction: 'prev' | 'next' | 'today') => void;
  /** 评论功能开关 */
  commentsEnabled?: boolean;
  /** 评论面板是否已打开 */
  commentPanelOpen?: boolean;
  /** 切换评论面板显示 */
  onToggleCommentPanel?: () => void;
}

type PopoverKey = 'field' | 'view' | 'filter' | 'group' | 'sort' | 'rowHeight' | 'cardConfig' | 'kanbanGroup' | 'calendarConfig';

const ROW_HEIGHTS = { compact: 28, standard: 40, loose: 56 } as const;

function rowHeightToMode(height: number): 'compact' | 'standard' | 'loose' {
  if (height <= 30) return 'compact';
  if (height >= 50) return 'loose';
  return 'standard';
}

/** 文本筛选值：本地草稿，blur/Enter 再提交，避免每键触发视图持久化打断输入 */
const DeferredFilterTextInput: React.FC<{
  value: string;
  onCommit: (value: string) => void;
  style?: React.CSSProperties;
}> = ({ value, onCommit, style }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <Input
      style={style}
      placeholder="请输入"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      onPressEnter={e => {
        (e.target as HTMLInputElement).blur();
      }}
    />
  );
};

/** 数值筛选：本地草稿，blur 再提交 */
const DeferredFilterNumberInput: React.FC<{
  value: number | undefined;
  onCommit: (value: unknown) => void;
  style?: React.CSSProperties;
}> = ({ value, onCommit, style }) => {
  const [draft, setDraft] = useState<number | null>(value ?? null);
  useEffect(() => {
    setDraft(value ?? null);
  }, [value]);

  return (
    <InputNumber
      style={style}
      placeholder="请输入"
      value={draft ?? undefined}
      onChange={next => setDraft(next == null ? null : Number(next))}
      onBlur={() => {
        const committed = draft ?? '';
        const prev = value ?? '';
        if (committed !== prev) onCommit(committed);
      }}
    />
  );
};

function renderFilterValueInput(
  field: ColumnDef | undefined,
  cond: FilterCondition,
  onValueChange: (value: unknown) => void,
): React.ReactNode {
  const type = field?.type ?? 'text';
  const flexStyle: React.CSSProperties = { flex: 1, minWidth: 96 };

  if (type === 'select' || type === 'multiSelect') {
    return (
      <Select
        {...baseSheetSelectProps}
        style={flexStyle}
        placeholder="请选择选项"
        allowClear
        value={cond.value != null && cond.value !== '' ? String(cond.value) : undefined}
        options={(field?.options || []).map(opt => ({ value: opt.name, label: opt.name }))}
        onChange={value => onValueChange(value ?? '')}
      />
    );
  }

  if (type === 'boolean') {
    return (
      <Select
        {...baseSheetSelectProps}
        style={flexStyle}
        placeholder="请选择"
        allowClear
        value={cond.value != null && cond.value !== '' ? String(cond.value) : undefined}
        options={[
          { value: 'TRUE', label: '已选中' },
          { value: 'FALSE', label: '未选中' },
        ]}
        onChange={value => onValueChange(value ?? '')}
      />
    );
  }

  if (type === 'date' || type === 'datetime') {
    const raw = cond.value;
    const dateValue = typeof raw === 'number'
      ? dayjs(raw)
      : typeof raw === 'string' && raw
        ? dayjs(raw)
        : null;
    return (
      <DatePicker
        style={flexStyle}
        placeholder="请选择日期"
        showTime={type === 'datetime'}
        format={type === 'datetime' ? 'YYYY/MM/DD HH:mm' : 'YYYY/MM/DD'}
        value={dateValue?.isValid() ? dateValue : null}
        onChange={(next: Dayjs | null) => onValueChange(next ? next.valueOf() : '')}
        getPopupContainer={() => document.body}
      />
    );
  }

  if (
    type === 'number'
    || type === 'currency'
    || type === 'percent'
    || type === 'rating'
    || type === 'progress'
  ) {
    const num = cond.value != null && cond.value !== '' ? Number(cond.value) : undefined;
    return (
      <DeferredFilterNumberInput
        style={flexStyle}
        value={num != null && !Number.isNaN(num) ? num : undefined}
        onCommit={onValueChange}
      />
    );
  }

  return (
    <DeferredFilterTextInput
      style={flexStyle}
      value={cond.value != null ? String(cond.value) : ''}
      onCommit={onValueChange}
    />
  );
}

const SORT_LABELS: Record<string, { asc: string; desc: string }> = {
  text: { asc: 'A → Z', desc: 'Z → A' },
  number: { asc: '0 → 9', desc: '9 → 0' },
  date: { asc: '0 → 9', desc: '9 → 0' },
  datetime: { asc: '0 → 9', desc: '9 → 0' },
  // 单选/多选按选项定义顺序比较（compareFieldValues 用 options.findIndex）
  select: { asc: '选项顺序', desc: '选项倒序' },
  multiSelect: { asc: '选项顺序', desc: '选项倒序' },
  default: { asc: 'A → Z', desc: 'Z → A' },
};

const GROUP_LEVEL_LABELS = ['一级分组', '二级分组', '三级分组', '四级分组', '五级分组'];

/** 工具栏弹层内容区统一留白，避免小尺寸控件堆叠过紧 */
const PANEL_RULE_GAP = 10;
const PANEL_STACK_SIZE = 12;

function panelTitle(label: string, onClear?: () => void) {
  return (
    <Flex justify="space-between" align="center" style={{ width: '100%', minHeight: 24, gap: 12 }}>
      <Typography.Text strong style={{ fontSize: 14 }}>{label}</Typography.Text>
      {onClear && (
        <Typography.Link onClick={onClear} style={{ fontSize: 13, flexShrink: 0 }}>清空全部</Typography.Link>
      )}
    </Flex>
  );
}

function toolbarBtnStyle(active?: boolean): React.CSSProperties {
  return active ? { ...baseToolbarBtnActiveStyle } : {};
}

interface FindPanelProps {
  findOpen: boolean;
  setFindOpen: (open: boolean) => void;
  findQuery: string;
  onFindQueryChange: (value: string) => void;
  onFind: () => void;
  onFindPrev: () => void;
  onFindNext: () => void;
}

const FindPanel: React.FC<FindPanelProps> = ({
  findOpen,
  setFindOpen,
  findQuery,
  onFindQueryChange,
  onFind,
  onFindPrev,
  onFindNext,
}) => {
  const findMatches = useSheetStore(s => s.findMatches);
  const findActiveIndex = useSheetStore(s => s.findActiveIndex);

  return (
    <Popover
      open={findOpen}
      onOpenChange={setFindOpen}
      trigger="click"
      placement="bottomLeft"
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SearchOutlined style={{ color: '#999' }} />
          <span>查找</span>
        </div>
      }
      content={
        <div style={{ width: 280 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Input
              size="small"
              placeholder="输入查找内容"
              value={findQuery}
              onChange={e => onFindQueryChange(e.target.value)}
              onPressEnter={onFind}
              autoFocus
              style={{ flex: 1 }}
            />
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 4,
              color: '#999',
              fontSize: 12,
              flexShrink: 0,
            }}>
              <Button
                type="text"
                size="small"
                icon={<ArrowUpOutlined />}
                onClick={onFindPrev}
                disabled={findMatches.length === 0}
                style={{ padding: '0 4px', minWidth: 'auto' }}
              />
              <span style={{ minWidth: 40, textAlign: 'center' }}>
                {findMatches.length > 0 ? `${findActiveIndex + 1}/${findMatches.length}` : '0/0'}
              </span>
              <Button
                type="text"
                size="small"
                icon={<ArrowDownOutlined />}
                onClick={onFindNext}
                disabled={findMatches.length === 0}
                style={{ padding: '0 4px', minWidth: 'auto' }}
              />
            </div>
          </div>
          {findMatches.length === 0 && findQuery.trim() && (
            <div style={{ color: '#999', fontSize: 12, marginTop: 8, textAlign: 'center' }}>
              未找到匹配项
            </div>
          )}
        </div>
      }
    >
      <Button
        type="text"
        size="small"
        icon={<SearchOutlined />}
        style={findOpen ? baseToolbarBtnActiveStyle : undefined}
      />
    </Popover>
  );
};

export const BaseToolbar: React.FC<BaseToolbarProps> = ({
  table, onToggleFieldVisibility, onReorderFields,
  onConfirmField, onDeleteField, onAddRecord, onGenerateForm, recordCount, filteredRecordCount, selectedCount = 0,
  groupRules = [], onGroupRulesChange,
  filterConditions = [], onFilterChange,
  filterConjunction = 'and', onFilterConjunctionChange,
  sortRules = [], onSortChange,
  mode = 'full',
  embedTitle,
  variant = 'grid',
  kanbanGroupFieldId,
  onKanbanGroupFieldChange,
  kanbanCardFields,
  onKanbanCardFieldsChange,
  kanbanShowFieldNames = false,
  onKanbanShowFieldNamesChange,
  kanbanCoverFieldId = null,
  onKanbanCoverFieldIdChange,
  onCalendarConfigClick,
  calendarConfigContent,
  calendarConfigTitle,
  noDateCount = 0,
  onOpenNoDate,
  calendarTitle,
  calendarViewType,
  onCalendarViewTypeChange,
  onCalendarNavigate,
  commentsEnabled = false,
  commentPanelOpen = false,
  onToggleCommentPanel,
}) => {
  const isEmbed = mode === 'embed';
  const isKanban = variant === 'kanban';
  const isCalendar = variant === 'calendar';
  const setStatusText = useSheetStore(s => s.setStatusText);
  const zoomLevel = useSheetStore(s => s.zoomLevel);
  const setZoomLevel = useSheetStore(s => s.setZoomLevel);

  const sheetModel = table.sheet;
  const isBase = isBaseSheet(sheetModel);
  const sheet = isBase ? sheetModel : null;
  const columnDefs = sheet?.columnDefs ?? [];
  const groupableColumns = columnDefs.filter(isGroupableColumn);
  const kanbanGroupFieldName = columnDefs.find(c => c.id === kanbanGroupFieldId)?.name;
  const titleFieldId = columnDefs.find(c => !c.hidden)?.id;
  const [activePopover, setActivePopover] = useState<PopoverKey | null>(null);
  const [findQuery, setFindQuery] = useState('');
  const [findOpen, setFindOpen] = useState(false);
  const [findMatches, setFindMatches] = useState<Array<{ row: number; col: number }>>([]);
  const [findIndex, setFindIndex] = useState(0);
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
      useSheetStore.getState().setFindHighlights(false);
      return;
    }
    const query = findQuery.trim().toLowerCase();
    const matches: Array<{ row: number; col: number }> = [];
    
    for (let r = 0; r < table.rowCount; r++) {
      for (let c = 0; c < table.colCount; c++) {
        const cell = table.getCell(r, c);
        const text = cell?.value ? getCellText(cell.value) : '';
        if (text.toLowerCase().includes(query)) {
          matches.push({ row: r, col: c });
        }
      }
    }
    
    if (matches.length > 0) {
      useSheetStore.getState().setFindHighlights(true, matches, 0);
      const first = matches[0];
      useSheetStore.getState().setSelection(
        { sheetId: table.sheetId, start: first, end: first },
        first,
      );
    } else {
      useSheetStore.getState().setFindHighlights(false);
    }
  }, [findQuery, table, setStatusText]);

  const handleFindPrev = useCallback(() => {
    const { findMatches, findActiveIndex } = useSheetStore.getState();
    if (findMatches.length === 0) return;
    const newIndex = findActiveIndex > 0 ? findActiveIndex - 1 : findMatches.length - 1;
    useSheetStore.getState().setFindActiveIndex(newIndex);
    const coord = findMatches[newIndex];
    useSheetStore.getState().setSelection(
      { sheetId: table.sheetId, start: coord, end: coord },
      coord,
    );
  }, [table, setStatusText]);

  const handleFindNext = useCallback(() => {
    const { findMatches, findActiveIndex } = useSheetStore.getState();
    if (findMatches.length === 0) return;
    const newIndex = findActiveIndex < findMatches.length - 1 ? findActiveIndex + 1 : 0;
    useSheetStore.getState().setFindActiveIndex(newIndex);
    const coord = findMatches[newIndex];
    useSheetStore.getState().setSelection(
      { sheetId: table.sheetId, start: coord, end: coord },
      coord,
    );
  }, [table, setStatusText]);

  const handleFindQueryChange = useCallback((value: string) => {
    setFindQuery(value);
    if (!value.trim()) {
      useSheetStore.getState().setFindHighlights(false);
    }
  }, []);

  const handleAddFilter = useCallback(() => {
    if (!columnDefs.length || !onFilterChange) return;
    const field = columnDefs[0];
    onFilterChange([...filterConditions, {
      fieldId: field.id,
      operator: defaultFilterOperatorForField(field),
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
    options?: { title?: React.ReactNode; width?: number; active?: boolean; bodyPadding?: number | string },
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
        ...(options?.bodyPadding !== undefined
          ? { body: { ...baseSheetPopoverProps.styles?.body, padding: options.bodyPadding } }
          : {}),
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

  const filterFieldOptions = columnDefs.map(c => ({
    value: c.id,
    label: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <FieldTypeIcon type={c.type} size={14} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
      </span>
    ),
  }));

  const filterPanel = (
    <div style={{ width: 460 }}>
      {filterConditions.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无筛选条件" style={{ margin: '12px 0 16px' }} />
      ) : (
        <>
          <Flex align="center" gap={6} style={{ marginBottom: 14, fontSize: 13, color: BASE_THEME.secondaryTextColor }}>
            <span>符合以下</span>
            <Select
              {...baseSheetSelectProps}
              size="small"
              style={{ width: 72 }}
              value={filterConjunction}
              options={[
                { value: 'and', label: '所有' },
                { value: 'or', label: '任一' },
              ]}
              onChange={value => onFilterConjunctionChange?.(value as 'and' | 'or')}
            />
            <span>条件</span>
          </Flex>
          <Space direction="vertical" size={PANEL_STACK_SIZE} style={{ width: '100%', marginBottom: 12 }}>
            {filterConditions.map((cond, i) => {
              const field = columnDefs.find(c => c.id === cond.fieldId);
              const operators = getFilterOperatorsForType(field?.type);
              const needsValue = !isValueLessFilterOperator(cond.operator);
              return (
                <Flex key={i} gap={PANEL_RULE_GAP} align="center" style={{ width: '100%' }}>
                  <Select
                    {...baseSheetSelectProps}
                    style={{ flex: 1.1, minWidth: 100 }}
                    value={cond.fieldId}
                    options={filterFieldOptions}
                    optionLabelProp="label"
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
                    style={{ width: 110, flexShrink: 0 }}
                    value={cond.operator}
                    options={operators.map(op => ({ value: op.value, label: op.label }))}
                    onChange={operator => {
                      if (!onFilterChange) return;
                      const newConds = [...filterConditions];
                      if (isValueLessFilterOperator(operator)) {
                        newConds[i] = { fieldId: cond.fieldId, operator };
                      } else {
                        newConds[i] = { ...newConds[i], operator };
                      }
                      onFilterChange(newConds);
                    }}
                  />
                  {needsValue ? (
                    renderFilterValueInput(field, cond, value => {
                      if (!onFilterChange) return;
                      const newConds = [...filterConditions];
                      newConds[i] = { ...newConds[i], value };
                      onFilterChange(newConds);
                    })
                  ) : (
                    <div style={{ flex: 1, minWidth: 0 }} />
                  )}
                  <Button
                    type="text"
                    icon={<CloseOutlined />}
                    aria-label="删除条件"
                    onClick={() => onFilterChange?.(filterConditions.filter((_, idx) => idx !== i))}
                  />
                </Flex>
              );
            })}
          </Space>
        </>
      )}
      <Button
        type="link"
        icon={<PlusOutlined />}
        onClick={handleAddFilter}
        style={{ padding: 0, height: 'auto' }}
      >
        添加条件
      </Button>
    </div>
  );

  const groupPanel = (
    <div style={{ width: 460 }}>
      {groupRules.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无分组规则" style={{ margin: '12px 0 16px' }} />
      ) : (
        <Space direction="vertical" size={PANEL_STACK_SIZE} style={{ width: '100%', marginBottom: 16 }}>
          {groupRules.map((rule, i) => (
            <Flex key={i} gap={PANEL_RULE_GAP} align="center">
              <Typography.Text type="secondary" style={{ fontSize: 13, minWidth: 64, flexShrink: 0 }}>
                {GROUP_LEVEL_LABELS[i] ?? `${i + 1}级分组`}
              </Typography.Text>
              <Select
                {...baseSheetSelectProps}
                style={{ flex: 1, minWidth: 96 }}
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
              <Space size={2} style={{ flexShrink: 0 }}>
                <Button type="text" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => moveGroupRule(i, i - 1)} />
                <Button type="text" icon={<ArrowDownOutlined />} disabled={i === groupRules.length - 1} onClick={() => moveGroupRule(i, i + 1)} />
                <Button type="text" icon={<CloseOutlined />} onClick={() => onGroupRulesChange?.(groupRules.filter((_, idx) => idx !== i))} />
              </Space>
            </Flex>
          ))}
        </Space>
      )}
      <Button
        type="dashed"
        block
        icon={<PlusOutlined />}
        disabled={groupRules.length >= groupableColumns.length}
        onClick={handleAddGroup}
      >
        添加分组字段
      </Button>
    </div>
  );

  const sortPanel = (
    <div style={{ width: 440 }}>
      {sortRules.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无排序规则" style={{ margin: '12px 0 16px' }} />
      ) : (
        <Space direction="vertical" size={PANEL_STACK_SIZE} style={{ width: '100%', marginBottom: 16 }}>
          {sortRules.map((rule, i) => {
            const labels = getSortLabels(rule.fieldId);
            return (
              <Flex key={i} gap={PANEL_RULE_GAP} align="center">
                <Typography.Text type="secondary" style={{ fontSize: 13, cursor: 'grab', paddingInline: 2 }}>⋮⋮</Typography.Text>
                <Select
                  {...baseSheetSelectProps}
                  style={{ flex: 1, minWidth: 96 }}
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
                <Button type="text" icon={<CloseOutlined />} onClick={() => onSortChange?.(sortRules.filter((_, idx) => idx !== i))} />
              </Flex>
            );
          })}
        </Space>
      )}
      <Button type="dashed" block icon={<PlusOutlined />} onClick={handleAddSort}>
        选择条件
      </Button>
    </div>
  );

  const rowHeightPanel = (
    <Select
      {...baseSheetSelectProps}
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

  const renderCalendarVariant = () => (
    <>
      <Space size={6} align="center" style={{ marginRight: 6, flexShrink: 0 }}>
        <CalendarOutlined style={{ color: BASE_THEME.secondaryTextColor, fontSize: 14 }} />
        <Typography.Text strong style={{ fontSize: 14 }}>日历</Typography.Text>
      </Space>
      <Divider type="vertical" style={{ height: 20, margin: '0 6px' }} />

      {sheet && onToggleFieldVisibility && onReorderFields && onConfirmField && onDeleteField && renderToolbarPopover(
        'field',
        <><SettingOutlined /> 字段管理</>,
        <FieldManagePopover
          columnDefs={sheet.columnDefs}
          onToggleFieldVisibility={onToggleFieldVisibility}
          onReorderFields={onReorderFields}
          onConfirmField={onConfirmField}
          onDeleteField={onDeleteField}
        />,
        { width: 290, bodyPadding: 0 },
      )}

      {renderToolbarPopover(
        'calendarConfig',
        <><SettingOutlined /> 日历配置</>,
        calendarConfigContent || (
          <div style={{ padding: '12px 16px', minWidth: 280 }}>
            <Typography.Text type="secondary">点击"日历配置"按钮可配置日期字段、卡片颜色等</Typography.Text>
          </div>
        ),
        { title: panelTitle(calendarConfigTitle || '日历配置'), width: 320 },
      )}

      <Divider type="vertical" style={{ height: 20, margin: '0 6px' }} />

      {renderToolbarPopover(
        'filter',
        <><FilterOutlined /> 筛选{countBadge(filterConditions.length)}</>,
        filterPanel,
        {
          title: panelTitle('筛选条件', filterConditions.length > 0 ? () => onFilterChange?.([]) : undefined),
          width: 480,
          active: activePopover === 'filter' || filterConditions.length > 0,
        },
      )}

      {renderToolbarPopover(
        'sort',
        <><SortAscendingOutlined /> 排序{countBadge(sortRules.length)}</>,
        sortPanel,
        {
          title: (
            <Flex justify="space-between" align="center" style={{ width: '100%', minHeight: 24, gap: 12 }}>
              <Typography.Text strong style={{ fontSize: 14 }}>设置排序条件</Typography.Text>
              <Space size={8} align="center">
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>自动排序</Typography.Text>
                <Switch checked={autoSort} onChange={setAutoSort} />
              </Space>
            </Flex>
          ),
          width: 472,
          active: activePopover === 'sort' || sortRules.length > 0,
        },
      )}

      {noDateCount > 0 ? (
        <>
          <Divider type="vertical" style={{ height: 20, margin: '0 6px' }} />
          <Button
            type="text"
            size="small"
            icon={<UnorderedListOutlined />}
            onClick={onOpenNoDate}
          >
            无日期的记录 ({noDateCount})
          </Button>
        </>
      ) : null}
    </>
  );

  return (
    <Flex
      data-sheet-keep-selection
      align="center"
      wrap="wrap"
      gap={6}
      style={{
        padding: isEmbed ? '6px 12px' : '8px 16px',
        borderBottom: `1px solid ${BASE_THEME.toolbarBorder}`,
        background: BASE_THEME.toolbarBg,
        minHeight: isEmbed ? 40 : 44,
        userSelect: 'none',
        position: 'relative',
        fontFamily: BASE_THEME.fontFamily,
      }}
    >
      {isCalendar && !isEmbed ? renderCalendarVariant() : (
        <>
          {!isEmbed && (
            <>
              <Space size={6} align="center" style={{ marginRight: 6, flexShrink: 0 }}>
                {isKanban
                  ? <AppstoreOutlined style={{ color: BASE_THEME.secondaryTextColor, fontSize: 14 }} />
                  : <TableOutlined style={{ color: BASE_THEME.secondaryTextColor, fontSize: 14 }} />}
                <Typography.Text strong style={{ fontSize: 14 }}>{isKanban ? '看板' : '表格'}</Typography.Text>
              </Space>
              <Divider type="vertical" style={{ height: 20, margin: '0 6px' }} />
              {isKanban ? (
                sheet && onKanbanCardFieldsChange && onKanbanShowFieldNamesChange && onKanbanCoverFieldIdChange && renderToolbarPopover(
                  'cardConfig',
                  <><ProfileOutlined /> 卡片配置</>,
                  <KanbanCardConfigPopover
                    columnDefs={sheet.columnDefs}
                    titleFieldId={titleFieldId}
                    cardFieldIds={kanbanCardFields ?? []}
                    showFieldNames={kanbanShowFieldNames}
                    coverFieldId={kanbanCoverFieldId}
                    onChangeCardFields={onKanbanCardFieldsChange}
                    onChangeShowFieldNames={onKanbanShowFieldNamesChange}
                    onChangeCoverFieldId={onKanbanCoverFieldIdChange}
                  />,
                  { title: panelTitle('卡片配置'), width: 320 },
                )
              ) : (
                <>
                  {sheet && onToggleFieldVisibility && onReorderFields && onConfirmField && onDeleteField && renderToolbarPopover(
                    'field',
                    <><SettingOutlined /> 字段配置</>,
                    <FieldManagePopover
                      columnDefs={sheet.columnDefs}
                      onToggleFieldVisibility={onToggleFieldVisibility}
                      onReorderFields={onReorderFields}
                      onConfirmField={onConfirmField}
                      onDeleteField={onDeleteField}
                    />,
                    { width: 290, bodyPadding: 0 },
                  )}
                  {renderToolbarPopover(
                    'view',
                    <><EyeOutlined /> 视图配置</>,
                    <Flex align="center" justify="space-between" gap={12} style={{ width: 328 }}>
                      <Typography.Text type="secondary" style={{ flexShrink: 0 }}>选择父记录字段</Typography.Text>
                      <Select
                        {...baseSheetSelectProps}
                        style={{ flex: 1 }}
                        placeholder="请选择父记录"
                        allowClear
                        options={fieldOptions}
                      />
                    </Flex>,
                    { title: panelTitle('视图配置'), width: 360 },
                  )}
                </>
              )}
              <Divider type="vertical" style={{ height: 20, margin: '0 6px' }} />
            </>
          )}

          {isEmbed && embedTitle ? (
            <>
              <Typography.Text strong style={{ fontSize: 13, marginRight: 4 }}>{embedTitle}</Typography.Text>
              <Divider type="vertical" style={{ height: 18, margin: '0 4px' }} />
            </>
          ) : null}

          {renderToolbarPopover(
            'filter',
            <><FilterOutlined /> 筛选{countBadge(filterConditions.length)}</>,
            filterPanel,
            {
              title: panelTitle('筛选条件', filterConditions.length > 0 ? () => onFilterChange?.([]) : undefined),
              width: 480,
              active: activePopover === 'filter' || filterConditions.length > 0,
            },
          )}

          {isKanban ? (
            renderToolbarPopover(
              'kanbanGroup',
              <><AppstoreOutlined /> 分组依据{kanbanGroupFieldName ? ` ${kanbanGroupFieldName}` : ''}</>,
              <KanbanGroupFieldPopover
                columnDefs={columnDefs}
                groupFieldId={kanbanGroupFieldId}
                onSelect={fieldId => {
                  onKanbanGroupFieldChange?.(fieldId);
                  closePopover();
                }}
              />,
              {
                title: panelTitle('分组依据'),
                width: 260,
                active: activePopover === 'kanbanGroup' || !!kanbanGroupFieldId,
              },
            )
          ) : (
            renderToolbarPopover(
              'group',
              <><AppstoreOutlined /> 分组{countBadge(groupRules.length)}</>,
              groupPanel,
              {
                title: panelTitle('分组设置', groupRules.length > 0 ? () => onGroupRulesChange?.([]) : undefined),
                width: 492,
                active: activePopover === 'group' || groupRules.length > 0,
              },
            )
          )}

          {renderToolbarPopover(
            'sort',
            <><SortAscendingOutlined /> 排序{countBadge(sortRules.length)}</>,
            sortPanel,
            {
              title: (
                <Flex justify="space-between" align="center" style={{ width: '100%', minHeight: 24, gap: 12 }}>
                  <Typography.Text strong style={{ fontSize: 14 }}>设置排序条件</Typography.Text>
                  <Space size={8} align="center">
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>自动排序</Typography.Text>
                    <Switch checked={autoSort} onChange={setAutoSort} />
                  </Space>
                </Flex>
              ),
              width: 472,
              active: activePopover === 'sort' || sortRules.length > 0,
            },
          )}

          {!isEmbed && !isKanban && (
            <>
              <Divider type="vertical" style={{ height: 20, margin: '0 4px' }} />
              {renderToolbarPopover('rowHeight', <><ColumnHeightOutlined /> 行高</>, rowHeightPanel, { title: panelTitle('行高') })}
              <Divider type="vertical" style={{ height: 20, margin: '0 4px' }} />
              <Button type="text" size="small" icon={<FormOutlined />} onClick={onGenerateForm}>
                生成表单
              </Button>
              {commentsEnabled && onToggleCommentPanel && (
                <Button
                  type="text"
                  size="small"
                  icon={<CommentOutlined />}
                  style={commentPanelOpen ? baseToolbarBtnActiveStyle : undefined}
                  onClick={onToggleCommentPanel}
                >
                  评论
                </Button>
              )}
              <Divider type="vertical" style={{ height: 20, margin: '0 4px' }} />
              <Button type="text" size="small" icon={<UndoOutlined />} onClick={() => { table.undo(); setStatusText('已撤销'); }}>
                撤销
              </Button>
              <Button type="text" size="small" icon={<RedoOutlined />} onClick={() => { table.redo(); setStatusText('已重做'); }}>
                重做
              </Button>
              <Divider type="vertical" style={{ height: 20, margin: '0 4px' }} />
            </>
          )}

          {!isEmbed && isKanban && (
            <>
              <Divider type="vertical" style={{ height: 20, margin: '0 4px' }} />
              <Button type="text" size="small" icon={<UndoOutlined />} onClick={() => { table.undo(); setStatusText('已撤销'); }}>
                撤销
              </Button>
              <Button type="text" size="small" icon={<RedoOutlined />} onClick={() => { table.redo(); setStatusText('已重做'); }}>
                重做
              </Button>
              <Divider type="vertical" style={{ height: 20, margin: '0 4px' }} />
            </>
          )}
        </>
      )}

      {isEmbed && <Divider type="vertical" style={{ height: 18, margin: '0 4px' }} />}

      <FindPanel
        findOpen={findOpen}
        setFindOpen={setFindOpen}
        findQuery={findQuery}
        onFindQueryChange={handleFindQueryChange}
        onFind={handleFind}
        onFindPrev={handleFindPrev}
        onFindNext={handleFindNext}
      />

      <Flex align="center" gap={4} style={{ marginLeft: 'auto' }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {!isEmbed && selectedCount > 0 ? `${selectedCount} 条已选中 / ` : ''}
          {filteredRecordCount != null && filteredRecordCount !== recordCount
            ? `${filteredRecordCount} / ${recordCount} 条记录`
            : `${recordCount} 条记录`}
        </Typography.Text>

        {!isEmbed && (
          <>
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
          </>
        )}
      </Flex>
    </Flex>
  );
};

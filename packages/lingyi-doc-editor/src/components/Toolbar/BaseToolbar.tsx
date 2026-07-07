import React, { useState, useCallback, useEffect } from 'react';
import { useSheetStore } from '../../store/sheetStore';
import { ToolbarPopover } from './ToolbarPopover';
import { FieldManagePopover } from '../FieldManagePopover';
import type { FreeTable, ColumnDef } from '@lingyi-doc/core';
import { BASE_THEME } from '@lingyi-doc/core';

interface BaseToolbarProps {
  table: FreeTable;
  onToggleFieldVisibility: (fieldId: string, visible: boolean) => void;
  onReorderFields: (fromIndex: number, toIndex: number) => void;
  onConfirmField: (fieldId: string | null, fieldData: Partial<ColumnDef>) => void;
  onDeleteField: (fieldId: string) => void;
  onAddRecord: () => void;
  onGenerateForm: () => void;
  recordCount: number;
  selectedCount: number;
}

const btnBase: React.CSSProperties = {
  padding: '4px 8px',
  border: 'none',
  borderRadius: 4,
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 13,
  height: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  gap: 6,
  color: BASE_THEME.headerTextColor,
};

const activeBtn = (a: boolean): React.CSSProperties => ({
  ...btnBase,
  background: a ? '#EDEEF0' : 'transparent',
  color: a ? BASE_THEME.primaryColor : BASE_THEME.headerTextColor,
  fontWeight: a ? 500 : 400,
});

const divider = (
  <div style={{ width: 1, height: 20, background: BASE_THEME.gridColor, margin: '0 6px', flexShrink: 0 }} />
);

type PopoverKey = 'field' | 'view' | 'filter' | 'group' | 'sort' | 'rowHeight' | null;

const ROW_HEIGHTS = { compact: 28, standard: 40, loose: 56 } as const;

function rowHeightToMode(height: number): 'compact' | 'standard' | 'loose' {
  if (height <= 30) return 'compact';
  if (height >= 50) return 'loose';
  return 'standard';
}

const SORT_LABELS: Record<string, { asc: string; desc: string }> = {
  text: { asc: 'A → Z', desc: 'Z → A' },
  number: { asc: '0 → 9', desc: '9 → 0' },
  date: { asc: '0 → 9', desc: '9 → 0' },
  datetime: { asc: '0 → 9', desc: '9 → 0' },
  default: { asc: 'A → Z', desc: 'Z → A' },
};

export const BaseToolbar: React.FC<BaseToolbarProps> = ({
  table, onToggleFieldVisibility, onReorderFields,
  onConfirmField, onDeleteField, onAddRecord, onGenerateForm, recordCount, selectedCount,
}) => {
  const setStatusText = useSheetStore(s => s.setStatusText);
  const zoomLevel = useSheetStore(s => s.zoomLevel);
  const setZoomLevel = useSheetStore(s => s.setZoomLevel);

  const sheet = table.sheet;
  const [activePopover, setActivePopover] = useState<PopoverKey>(null);
  const [findQuery, setFindQuery] = useState('');
  const [filterConditions, setFilterConditions] = useState<{ fieldId: string; operator: string; value: string }[]>([]);
  const [sortRules, setSortRules] = useState<{ fieldId: string; order: 'asc' | 'desc' }[]>([]);
  const [autoSort, setAutoSort] = useState(true);
  const [groupFieldId, setGroupFieldId] = useState<string>('');
  const [rowHeightMode, setRowHeightMode] = useState<'compact' | 'standard' | 'loose'>(() =>
    rowHeightToMode(table.getDefaultRowHeight()),
  );

  useEffect(() => {
    setRowHeightMode(rowHeightToMode(table.getDefaultRowHeight()));
  }, [table, table.sheet.defaultRowHeight, table.rowCount]);

  const togglePopover = useCallback((key: PopoverKey) => {
    setActivePopover(prev => prev === key ? null : key);
  }, []);

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
            { row: r, col: c }
          );
          setStatusText(`找到匹配项 (第 ${r + 1} 行, 列 ${String.fromCharCode(65 + c)})`);
          return;
        }
      }
    }
    setStatusText('未找到匹配项');
  }, [findQuery, table, setStatusText]);

  const handleAddFilter = useCallback(() => {
    if (!sheet.columnDefs.length) return;
    setFilterConditions([...filterConditions, {
      fieldId: sheet.columnDefs[0].id,
      operator: 'eq',
      value: '',
    }]);
  }, [sheet.columnDefs, filterConditions]);

  const handleAddSort = useCallback(() => {
    if (!sheet.columnDefs.length) return;
    setSortRules([...sortRules, {
      fieldId: sheet.columnDefs[0].id,
      order: 'asc',
    }]);
  }, [sheet.columnDefs, sortRules]);

  const getSortLabels = (fieldId: string) => {
    const field = sheet.columnDefs.find(c => c.id === fieldId);
    const type = field?.type || 'text';
    return SORT_LABELS[type] || SORT_LABELS.default;
  };

  return (
    <div
      data-sheet-keep-selection
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '6px 12px',
        borderBottom: `1px solid ${BASE_THEME.toolbarBorder}`,
        background: BASE_THEME.toolbarBg,
        gap: 2,
        flexWrap: 'wrap',
        minHeight: 40,
        userSelect: 'none',
        position: 'relative',
        fontFamily: BASE_THEME.fontFamily,
      }}
    >
      <span style={{
        fontSize: 14,
        fontWeight: 600,
        color: '#1F2329',
        marginRight: 8,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={BASE_THEME.secondaryTextColor} strokeWidth="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
        表格
      </span>

      {divider}
      {/* 字段配置 */}
      <ToolbarPopover
        open={activePopover === 'field'}
        onClose={closePopover}
        width={260}
        maxHeight={520}
        overflowVisible
        trigger={
          <button style={activeBtn(activePopover === 'field')} onClick={() => togglePopover('field')}>
            <span>⚙</span> 字段配置
          </button>
        }
      >
        <FieldManagePopover
          columnDefs={sheet.columnDefs}
          onToggleFieldVisibility={onToggleFieldVisibility}
          onReorderFields={onReorderFields}
          onConfirmField={onConfirmField}
          onDeleteField={onDeleteField}
        />
      </ToolbarPopover>

      {/* 视图配置 */}
      <ToolbarPopover
        open={activePopover === 'view'}
        onClose={closePopover}
        width={360}
        trigger={
          <button style={activeBtn(activePopover === 'view')} onClick={() => togglePopover('view')}>
            <span>👁</span> 视图配置
          </button>
        }
        title="视图配置"
      >
        <div style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 13, color: '#666', flexShrink: 0 }}>选择父记录字段</span>
            <select
              style={{ flex: 1, padding: '6px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13 }}
              defaultValue=""
            >
              <option value="">请选择父记录</option>
              {sheet.columnDefs.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
      </ToolbarPopover>

      {divider}

      {/* 筛选 */}
      <ToolbarPopover
        open={activePopover === 'filter'}
        onClose={closePopover}
        width={480}
        maxHeight={400}
        trigger={
          <button style={activeBtn(activePopover === 'filter')} onClick={() => togglePopover('filter')}>
            <span>🔍</span> 筛选{filterConditions.length > 0 ? ` ${filterConditions.length}` : ''}
          </button>
        }
        title="筛选条件"
        titleExtra={
          filterConditions.length > 0 ? (
            <button
              onClick={() => setFilterConditions([])}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: '#999' }}
            >
              清空全部
            </button>
          ) : undefined
        }
      >
        <div style={{ padding: '8px 16px 12px' }}>
          {filterConditions.length === 0 && (
            <div style={{ fontSize: 12, color: '#999', padding: '8px 0' }}>暂无筛选条件，点击下方按钮添加</div>
          )}
          {filterConditions.map((cond, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <select
                value={cond.fieldId}
                onChange={e => {
                  const newConds = [...filterConditions];
                  newConds[i].fieldId = e.target.value;
                  setFilterConditions(newConds);
                }}
                style={{ padding: '4px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, flex: 1 }}
              >
                {sheet.columnDefs.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select
                value={cond.operator}
                onChange={e => {
                  const newConds = [...filterConditions];
                  newConds[i].operator = e.target.value;
                  setFilterConditions(newConds);
                }}
                style={{ padding: '4px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13 }}
              >
                <option value="eq">等于</option>
                <option value="ne">不等于</option>
                <option value="contains">包含</option>
                <option value="empty">为空</option>
                <option value="notEmpty">不为空</option>
              </select>
              {!['empty', 'notEmpty'].includes(cond.operator) && (
                <input
                  type="text"
                  value={cond.value}
                  onChange={e => {
                    const newConds = [...filterConditions];
                    newConds[i].value = e.target.value;
                    setFilterConditions(newConds);
                  }}
                  placeholder="值"
                  style={{ padding: '4px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, width: 80 }}
                />
              )}
              <button
                onClick={() => setFilterConditions(filterConditions.filter((_, idx) => idx !== i))}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#999', fontSize: 14 }}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={handleAddFilter}
            style={{
              padding: '6px 12px', border: '1px dashed #ccc', borderRadius: 4,
              background: '#fafafa', cursor: 'pointer', fontSize: 12, color: '#666', width: '100%',
            }}
          >
            + 添加条件
          </button>
        </div>
      </ToolbarPopover>

      {/* 分组 */}
      <ToolbarPopover
        open={activePopover === 'group'}
        onClose={closePopover}
        width={320}
        trigger={
          <button style={activeBtn(activePopover === 'group')} onClick={() => togglePopover('group')}>
            <span>⊞</span> 分组{groupFieldId ? ' 1' : ''}
          </button>
        }
        title="分组设置"
      >
        <div style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#666', flexShrink: 0 }}>按字段分组</span>
            <select
              value={groupFieldId}
              onChange={e => setGroupFieldId(e.target.value)}
              style={{ flex: 1, padding: '6px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13 }}
            >
              <option value="">不分组</option>
              {sheet.columnDefs.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          {groupFieldId && (
            <button
              onClick={() => setGroupFieldId('')}
              style={{
                marginTop: 8, padding: '4px 12px', border: 'none',
                background: 'none', cursor: 'pointer', color: '#999', fontSize: 12,
              }}
            >
              取消分组
            </button>
          )}
        </div>
      </ToolbarPopover>

      {/* 排序 */}
      <ToolbarPopover
        open={activePopover === 'sort'}
        onClose={closePopover}
        width={420}
        maxHeight={400}
        trigger={
          <button style={activeBtn(activePopover === 'sort')} onClick={() => togglePopover('sort')}>
            <span>⇅</span> 排序{sortRules.length > 0 ? ` ${sortRules.length}` : ''}
          </button>
        }
        title="设置排序条件"
        titleExtra={
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#666', cursor: 'pointer' }}>
            自动排序
            <ToggleSwitch checked={autoSort} onChange={setAutoSort} />
          </label>
        }
      >
        <div style={{ padding: '8px 16px 12px' }}>
          {sortRules.length === 0 && (
            <div style={{ fontSize: 12, color: '#999', padding: '8px 0' }}>暂无排序规则，点击下方按钮添加</div>
          )}
          {sortRules.map((rule, i) => {
            const labels = getSortLabels(rule.fieldId);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: '#ccc', cursor: 'grab', userSelect: 'none' }}>⋮⋮</span>
                <select
                  value={rule.fieldId}
                  onChange={e => {
                    const newRules = [...sortRules];
                    newRules[i].fieldId = e.target.value;
                    setSortRules(newRules);
                  }}
                  style={{ padding: '4px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, flex: 1 }}
                >
                  {sheet.columnDefs.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => { const r = [...sortRules]; r[i].order = 'asc'; setSortRules(r); }}
                  style={{
                    padding: '4px 8px', border: '1px solid #ddd', borderRadius: 4,
                    background: rule.order === 'asc' ? '#e8f0fe' : '#fff',
                    color: rule.order === 'asc' ? '#1a73e8' : '#666',
                    cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap',
                  }}
                >
                  {labels.asc}
                </button>
                <button
                  onClick={() => { const r = [...sortRules]; r[i].order = 'desc'; setSortRules(r); }}
                  style={{
                    padding: '4px 8px', border: '1px solid #ddd', borderRadius: 4,
                    background: rule.order === 'desc' ? '#e8f0fe' : '#fff',
                    color: rule.order === 'desc' ? '#1a73e8' : '#666',
                    cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap',
                  }}
                >
                  {labels.desc}
                </button>
                <button
                  onClick={() => setSortRules(sortRules.filter((_, idx) => idx !== i))}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#999', fontSize: 14 }}
                >
                  ✕
                </button>
              </div>
            );
          })}
          <button
            onClick={handleAddSort}
            style={{
              padding: '6px 12px', border: '1px dashed #ccc', borderRadius: 4,
              background: '#fafafa', cursor: 'pointer', fontSize: 12, color: '#666', width: '100%',
            }}
          >
            + 选择条件
          </button>
        </div>
      </ToolbarPopover>

      {divider}

      {/* 行高 */}
      <ToolbarPopover
        open={activePopover === 'rowHeight'}
        onClose={closePopover}
        minWidth={120}
        trigger={
          <button style={btnBase} onClick={() => togglePopover('rowHeight')}>
            <span>↕</span> 行高
          </button>
        }
      >
        <div style={{ padding: 4 }}>
          {([
            { mode: 'compact' as const, label: '紧凑', height: 28 },
            { mode: 'standard' as const, label: '标准', height: 40 },
            { mode: 'loose' as const, label: '宽松', height: 56 },
          ]).map(h => (
            <button
              key={h.mode}
              onClick={() => handleRowHeight(h.mode)}
              style={{
                padding: '6px 10px', width: '100%', border: 'none',
                background: rowHeightMode === h.mode ? '#e8f0fe' : '#fff',
                color: rowHeightMode === h.mode ? '#1a73e8' : '#333',
                cursor: 'pointer', fontSize: 12, textAlign: 'left',
              }}
            >
              {h.label} ({h.height}px)
            </button>
          ))}
        </div>
      </ToolbarPopover>

      {divider}

      <button style={btnBase} onClick={onGenerateForm}>
        <span>📝</span> 生成表单
      </button>
      <button style={btnBase} onClick={() => setStatusText('评论功能开发中')}>
        <span>💬</span> 评论
      </button>

      {divider}

      <button style={btnBase} onClick={() => { table.undo(); setStatusText('已撤销'); }}>
        ↩ 撤销
      </button>
      <button style={btnBase} onClick={() => { table.redo(); setStatusText('已重做'); }}>
        ↪ 重做
      </button>

      {divider}

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          value={findQuery}
          onChange={e => setFindQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleFind(); }}
          placeholder="搜索记录..."
          style={{
            padding: '4px 8px 4px 28px', border: '1px solid #ddd', borderRadius: 4,
            fontSize: 13, width: 160, outline: 'none', height: 28,
          }}
          onFocus={e => { e.currentTarget.style.borderColor = '#1a73e8'; }}
          onBlur={e => { e.currentTarget.style.borderColor = '#ddd'; }}
        />
        <span style={{ position: 'absolute', left: 8, fontSize: 12, color: '#999' }}>🔍</span>
        {findQuery && (
          <button
            onClick={() => { setFindQuery(''); setStatusText(''); }}
            style={{
              position: 'absolute', right: 6, border: 'none', background: 'none',
              cursor: 'pointer', fontSize: 10, color: '#999',
            }}
          >
            ✕
          </button>
        )}
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 12, color: '#999', marginRight: 4 }}>
          {selectedCount > 0 ? `${selectedCount} 条已选中 / ` : ''}{recordCount} 条记录
        </span>

        {divider}

        <button
          style={{ ...btnBase, color: BASE_THEME.primaryColor, fontWeight: 500 }}
          onClick={onAddRecord}
        >
          + 添加记录
        </button>

        {divider}

        <button style={{ ...btnBase, padding: '4px 8px', color: BASE_THEME.secondaryTextColor }} onClick={() => setZoomLevel(zoomLevel - 0.1)}>−</button>
        <span style={{ fontSize: 12, color: BASE_THEME.secondaryTextColor, minWidth: 40, textAlign: 'center' }}>{Math.round(zoomLevel * 100)}%</span>
        <button style={{ ...btnBase, padding: '4px 8px', color: BASE_THEME.secondaryTextColor }} onClick={() => setZoomLevel(zoomLevel + 0.1)}>+</button>
      </div>
    </div>
  );
};

const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ checked, onChange }) => (
  <label style={{ position: 'relative', display: 'inline-block', width: 36, height: 20, cursor: 'pointer' }}>
    <input
      type="checkbox"
      checked={checked}
      onChange={e => onChange(e.target.checked)}
      style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
    />
    <span style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      borderRadius: 20, background: checked ? '#1a73e8' : '#ccc', transition: 'background 0.2s',
    }}>
      <span style={{
        position: 'absolute', top: 2, left: checked ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </span>
  </label>
);

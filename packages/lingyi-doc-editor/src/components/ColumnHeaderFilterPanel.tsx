import React, { useCallback, useMemo, useState } from 'react';
import type { ColumnFilterCondition, FreeTable } from '@lingyi-doc/core';
import {
  collectColumnValueStats,
  getColumnFilterForCol,
  isColumnFilterActive,
  NUMBER_CONDITION_PRESETS,
  TEXT_CONDITION_PRESETS,
} from '@lingyi-doc/core';

interface ColumnHeaderFilterPanelProps {
  table: FreeTable;
  col: number;
  anchorRect: { left: number; top: number; width: number; height: number };
  onClose: () => void;
}

type FilterTab = 'values' | 'condition';
type ConditionCategory = 'none' | 'all' | 'text' | 'number';

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  zIndex: 400,
  width: 320,
  background: '#fff',
  borderRadius: 8,
  boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
  border: '1px solid #e8e8e8',
  fontSize: 13,
  color: '#1f2329',
};

const btnStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 0',
  border: '1px solid #dcdcdc',
  background: '#fff',
  cursor: 'pointer',
  fontSize: 13,
  color: '#333',
};

export const ColumnHeaderFilterPanel: React.FC<ColumnHeaderFilterPanelProps> = ({
  table,
  col,
  anchorRect,
  onClose,
}) => {
  const sheet = table.sheet;
  const existing = getColumnFilterForCol(sheet.columnFilters, col);
  const valueStats = useMemo(
    () => collectColumnValueStats(sheet.rowCount, col, (r, c) => table.getCell(r, c)),
    [table, sheet.rowCount, col],
  );

  const allValues = useMemo(() => valueStats.map(s => s.value), [valueStats]);
  const totalCount = useMemo(() => valueStats.reduce((sum, s) => sum + s.count, 0), [valueStats]);

  const [tab, setTab] = useState<FilterTab>(existing?.mode === 'condition' ? 'condition' : 'values');
  const [search, setSearch] = useState('');
  const [privateOnly, setPrivateOnly] = useState(false);

  const [selectedValues, setSelectedValues] = useState<Set<string>>(() => {
    if (existing?.selectedValues) return new Set(existing.selectedValues);
    return new Set(allValues);
  });
  const [includeBlank, setIncludeBlank] = useState(existing?.includeBlank !== false);

  const [condCategory, setCondCategory] = useState<ConditionCategory>(() => {
    if (!existing?.operator) return 'none';
    if (['gt', 'gte', 'lt', 'lte'].includes(existing.operator)) return 'number';
    return 'text';
  });
  const [condOperator, setCondOperator] = useState<NonNullable<ColumnFilterCondition['operator']>>(
    existing?.operator ?? 'contains',
  );
  const [condValue, setCondValue] = useState(existing?.value ?? '');

  const filteredStats = useMemo(() => {
    const keywords = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (keywords.length === 0) return valueStats;
    return valueStats.filter(s =>
      keywords.every(kw => s.label.toLowerCase().includes(kw)),
    );
  }, [valueStats, search]);

  const allFilteredSelected = filteredStats.length > 0
    && filteredStats.every(s => selectedValues.has(s.value));

  const toggleValue = useCallback((value: string) => {
    setSelectedValues(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }, []);

  const toggleAllFiltered = useCallback(() => {
    setSelectedValues(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredStats.forEach(s => next.delete(s.value));
      } else {
        filteredStats.forEach(s => next.add(s.value));
      }
      return next;
    });
  }, [allFilteredSelected, filteredStats]);

  const handleSort = useCallback((order: 'asc' | 'desc') => {
    table.sortByColumn(col, order);
    onClose();
  }, [table, col, onClose]);

  const handleClear = useCallback(() => {
    table.setColumnFilterForCol(col, null);
    onClose();
  }, [table, col, onClose]);

  const handleConfirm = useCallback(() => {
    if (tab === 'values') {
      const hasBlank = valueStats.some(s => s.isBlank);
      const allSelected = allValues.every(v => selectedValues.has(v))
        && (!hasBlank || includeBlank);
      if (allSelected) {
        table.setColumnFilterForCol(col, null);
      } else {
        table.setColumnFilterForCol(col, {
          col,
          mode: 'values',
          selectedValues: [...selectedValues],
          includeBlank,
        });
      }
    } else if (condCategory === 'none' || condCategory === 'all') {
      table.setColumnFilterForCol(col, null);
    } else if (condOperator === 'empty' || condOperator === 'notEmpty') {
      table.setColumnFilterForCol(col, { col, mode: 'condition', operator: condOperator });
    } else if (condValue.trim()) {
      table.setColumnFilterForCol(col, {
        col,
        mode: 'condition',
        operator: condOperator,
        value: condValue.trim(),
      });
    } else {
      table.setColumnFilterForCol(col, null);
    }
    onClose();
  }, [tab, allValues, selectedValues, includeBlank, valueStats, condCategory, condOperator, condValue, table, col, onClose]);

  const left = Math.min(anchorRect.left, window.innerWidth - 340);
  const top = anchorRect.top + anchorRect.height + 4;

  const presets = condCategory === 'number' ? NUMBER_CONDITION_PRESETS : TEXT_CONDITION_PRESETS;
  const hasActiveFilter = isColumnFilterActive(existing ?? { col });

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 399 }}
        onMouseDown={onClose}
      />
      <div style={{ ...panelStyle, left, top }} data-sheet-keep-selection="">
        {/* 排序 */}
        <div style={{ display: 'flex', padding: '12px 12px 0' }}>
          <button type="button" style={{ ...btnStyle, borderRadius: '4px 0 0 4px' }} onClick={() => handleSort('asc')}>
            升序
          </button>
          <button type="button" style={{ ...btnStyle, borderLeft: 'none', borderRadius: '0 4px 4px 0' }} onClick={() => handleSort('desc')}>
            降序
          </button>
        </div>

        {/* 标签页 */}
        <div style={{ display: 'flex', borderBottom: '1px solid #eee', margin: '12px 12px 0', gap: 16 }}>
          {(['values', 'condition'] as FilterTab[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                border: 'none',
                background: 'none',
                padding: '8px 0',
                cursor: 'pointer',
                fontSize: 13,
                color: tab === t ? '#4A89F3' : '#666',
                borderBottom: tab === t ? '2px solid #4A89F3' : '2px solid transparent',
                fontWeight: tab === t ? 500 : 400,
              }}
            >
              {t === 'values' ? '按值筛选' : '按条件筛选'}
            </button>
          ))}
        </div>

        {tab === 'values' ? (
          <div style={{ padding: '12px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              border: '1px solid #dcdcdc',
              borderRadius: 6,
              padding: '6px 10px',
              marginBottom: 8,
            }}>
              <span style={{ color: '#999' }}>🔍</span>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="可使用空格分隔多个关键词"
                style={{ border: 'none', outline: 'none', flex: 1, fontSize: 13 }}
              />
            </div>

            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              <label style={{ display: 'flex', alignItems: 'center', padding: '6px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={allFilteredSelected} onChange={toggleAllFiltered} style={{ marginRight: 8 }} />
                <span style={{ flex: 1 }}>全选</span>
                <span style={{ color: '#999', fontSize: 12 }}>{totalCount}</span>
              </label>
              {filteredStats.map(stat => (
                <label key={stat.value || '__blank__'} style={{ display: 'flex', alignItems: 'center', padding: '6px 0', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={stat.isBlank ? includeBlank : selectedValues.has(stat.value)}
                    onChange={() => {
                      if (stat.isBlank) setIncludeBlank(v => !v);
                      else toggleValue(stat.value);
                    }}
                    style={{ marginRight: 8 }}
                  />
                  <span style={{ flex: 1 }}>{stat.label}</span>
                  <span style={{ color: '#999', fontSize: 12 }}>{stat.count}</span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ padding: '12px' }}>
            <select
              value={condCategory}
              onChange={e => {
                const cat = e.target.value as ConditionCategory;
                setCondCategory(cat);
                if (cat === 'text') setCondOperator('contains');
                if (cat === 'number') setCondOperator('eq');
              }}
              style={{ width: '100%', padding: '8px', border: '1px solid #4A89F3', borderRadius: 4, marginBottom: 8, fontSize: 13 }}
            >
              <option value="none">无</option>
              <option value="all">全部</option>
              <option value="text">文本</option>
              <option value="number">数字</option>
            </select>

            {condCategory === 'text' || condCategory === 'number' ? (
              <>
                <select
                  value={condOperator}
                  onChange={e => setCondOperator(e.target.value as NonNullable<ColumnFilterCondition['operator']>)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #dcdcdc', borderRadius: 4, marginBottom: 8, fontSize: 13 }}
                >
                  {presets.map(p => (
                    <option key={p.label} value={p.operator}>{p.label}</option>
                  ))}
                </select>
                {condOperator !== 'empty' && condOperator !== 'notEmpty' && (
                  <input
                    type="text"
                    value={condValue}
                    onChange={e => setCondValue(e.target.value)}
                    placeholder="输入值"
                    style={{ width: '100%', padding: '8px', border: '1px solid #dcdcdc', borderRadius: 4, boxSizing: 'border-box', fontSize: 13 }}
                  />
                )}
              </>
            ) : null}
          </div>
        )}

        {/* 底部 */}
        <div style={{ borderTop: '1px solid #eee', padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, fontSize: 12, color: '#666' }}>
            <span>筛选结果仅我可见 ⓘ</span>
            <button
              type="button"
              onClick={() => setPrivateOnly(v => !v)}
              style={{
                width: 36,
                height: 20,
                borderRadius: 10,
                border: 'none',
                background: privateOnly ? '#4A89F3' : '#ccc',
                cursor: 'pointer',
                position: 'relative',
              }}
            >
              <span style={{
                position: 'absolute',
                top: 2,
                left: privateOnly ? 18 : 2,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: '#fff',
                transition: 'left 0.15s',
              }} />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              type="button"
              onClick={handleClear}
              disabled={!hasActiveFilter}
              style={{
                border: 'none',
                background: 'none',
                color: hasActiveFilter ? '#999' : '#ccc',
                cursor: hasActiveFilter ? 'pointer' : 'default',
                fontSize: 13,
              }}
            >
              清除筛选
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={onClose}
                style={{ padding: '6px 16px', border: '1px solid #dcdcdc', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 13 }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                style={{ padding: '6px 16px', border: 'none', borderRadius: 4, background: '#4A89F3', color: '#fff', cursor: 'pointer', fontSize: 13 }}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

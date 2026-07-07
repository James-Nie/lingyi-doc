import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BaseBlock, BaseEmbedViewType, ColumnDef } from '@lingyi-doc/core';
import {
  FreeTable,
  baseBlockViewLabel,
  getRatingColumnWidth,
  getRatingConfig,
  BASE_THEME,
} from '@lingyi-doc/core';
import { SheetContainer } from '../components/SheetContainer';
import { FieldManagePopover } from '../components/FieldManagePopover';
import { FieldConfigPanel } from '../components/FieldConfigPanel';
import { ToolbarPopover } from '../components/Toolbar/ToolbarPopover';
import { useSheetStore } from '../store/sheetStore';
import { DOC_COLORS } from './styles';
import { useDocHistoryRevision } from './DocHistoryContext';

const EMBED_VIEWS: BaseEmbedViewType[] = ['grid', 'kanban', 'gantt', 'gallery'];

function computeGridHeight(table: FreeTable): number {
  const rowH = table.getDefaultRowHeight();
  const headerH = 40;
  const addRowH = 36;
  return Math.min(420, Math.max(176, headerH + table.rowCount * rowH + addRowH + 8));
}

interface DocBaseBlockProps {
  block: BaseBlock;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onFocus: () => void;
  onChange: (block: BaseBlock, recordHistory?: boolean) => void;
  onRegisterRef: (id: string, el: HTMLElement | null) => void;
  readOnly?: boolean;
}

export const DocBaseBlock: React.FC<DocBaseBlockProps> = ({
  block,
  index,
  selected,
  onSelect,
  onFocus,
  onChange,
  onRegisterRef,
  readOnly = false,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const blockRef = useRef(block);
  blockRef.current = block;

  const tableRef = useRef<FreeTable | null>(null);
  if (!tableRef.current) {
    tableRef.current = FreeTable.fromJSON(block.sheetData);
  }

  const historyRevision = useDocHistoryRevision();
  const lastHistoryRevisionRef = useRef(historyRevision);

  const [hovered, setHovered] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [fieldPopoverOpen, setFieldPopoverOpen] = useState(false);
  const [fieldConfigVisible, setFieldConfigVisible] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [tableVersion, setTableVersion] = useState(0);
  const viewMenuRef = useRef<HTMLDivElement>(null);

  const showBorder = selected || hovered;

  useEffect(() => {
    onRegisterRef(block.id, rootRef.current);
    return () => onRegisterRef(block.id, null);
  }, [block.id, onRegisterRef]);

  useEffect(() => {
    const forceSync = historyRevision !== lastHistoryRevisionRef.current;
    if (forceSync) {
      lastHistoryRevisionRef.current = historyRevision;
      tableRef.current = FreeTable.fromJSON(block.sheetData);
      setTableVersion(v => v + 1);
    }
  }, [block.sheetData, historyRevision]);

  const table = tableRef.current!;
  void tableVersion;

  useEffect(() => {
    const t = tableRef.current;
    if (!t) return;
    return t.onChange(() => {
      if (readOnly) return;
      setTableVersion(v => v + 1);
      onChange({
        ...blockRef.current,
        sheetData: t.toJSON() as Record<string, unknown>,
      }, false);
    });
  }, [onChange, readOnly]);

  useEffect(() => {
    if (selected) {
      const store = useSheetStore.getState();
      store.setEditingCell(null);
      store.setFormulaBarText('');
      store.setSelection(null, null);
      store.setScrollPosition(0, 0);
      store.setCurrentView(block.activeViewType);
      const view = table.sheet.views?.find(v => v.viewType === block.activeViewType);
      if (view) table.sheet.activeViewId = view.viewId;
      return;
    }

    const root = rootRef.current;
    const active = document.activeElement;
    if (root && active instanceof HTMLElement && root.contains(active)) {
      active.blur();
    }
    const store = useSheetStore.getState();
    store.setEditingCell(null);
    store.setFormulaBarText('');
    store.setSelection(null, null);
  }, [selected, block.id, block.activeViewType, table]);

  useEffect(() => {
    if (!viewMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (viewMenuRef.current?.contains(e.target as Node)) return;
      setViewMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [viewMenuOpen]);

  const persistBlock = useCallback((patch: Partial<BaseBlock>, recordHistory = true) => {
    if (readOnly) return;
    onChange({ ...blockRef.current, ...patch }, recordHistory);
  }, [onChange, readOnly]);

  const switchView = useCallback((viewType: BaseEmbedViewType) => {
    const view = table.sheet.views?.find(v => v.viewType === viewType);
    if (!view) return;
    table.sheet.activeViewId = view.viewId;
    useSheetStore.getState().setCurrentView(viewType);
    persistBlock({
      activeViewType: viewType,
      title: baseBlockViewLabel(viewType),
      sheetData: table.toJSON() as Record<string, unknown>,
    }, true);
    table.notifyChange(null);
    setViewMenuOpen(false);
  }, [table, persistBlock]);

  const handleConfirmField = useCallback((fieldId: string | null, fieldData: Partial<ColumnDef>) => {
    if (readOnly) return;
    if (fieldId) {
      const idx = table.sheet.columnDefs.findIndex(c => c.id === fieldId);
      if (idx >= 0) {
        const existing = table.sheet.columnDefs[idx];
        const updated = { ...existing, ...fieldData } as ColumnDef;
        table.sheet.columnDefs[idx] = updated;
        if (updated.type === 'rating') {
          const width = getRatingColumnWidth(getRatingConfig(updated));
          updated.width = width;
          table.setColumnWidth(idx, width);
        }
      }
    } else {
      const colIndex = table.sheet.columnDefs.length;
      table.insertColumns(colIndex, 1);
      const newField: ColumnDef = {
        id: `col_${Date.now()}_${colIndex}`,
        name: fieldData.name || '新字段',
        type: fieldData.type || 'text',
        width: fieldData.type === 'boolean' ? 70 : fieldData.type === 'autoNumber' ? 80 : fieldData.type === 'date' ? 110 : fieldData.type === 'rating' ? 90 : fieldData.type === 'progress' ? 110 : 160,
        ...fieldData,
      };
      if (newField.type === 'rating') {
        newField.width = getRatingColumnWidth(getRatingConfig(newField));
      }
      table.sheet.columnDefs.push(newField);
      table.setColumnWidth(colIndex, newField.width || 160);
    }
    table.syncColumnLayout();
    table.notifyChange(null);
  }, [table, readOnly]);

  const handleToggleFieldVisibility = useCallback((fieldId: string, visible: boolean) => {
    if (readOnly) return;
    const field = table.sheet.columnDefs.find(c => c.id === fieldId);
    if (field) {
      field.hidden = !visible;
      table.applyColumnVisibility();
      table.notifyChange(null);
    }
  }, [table, readOnly]);

  const handleReorderFields = useCallback((fromIndex: number, toIndex: number) => {
    if (readOnly) return;
    table.moveColumns(fromIndex, toIndex);
    table.syncColumnLayout();
  }, [table, readOnly]);

  const handleDeleteField = useCallback((fieldId: string) => {
    if (readOnly) return;
    const idx = table.sheet.columnDefs.findIndex(c => c.id === fieldId);
    if (idx > 0) {
      table.deleteColumns(idx, 1);
      table.notifyChange(null);
    }
  }, [table, readOnly]);

  const handleOpenFieldConfig = useCallback((fieldId?: string | null) => {
    if (readOnly) return;
    setEditingFieldId(fieldId ?? null);
    setFieldConfigVisible(true);
  }, [readOnly]);

  const handleFieldConfigConfirm = useCallback((fieldData: Partial<ColumnDef>) => {
    handleConfirmField(editingFieldId, fieldData);
    setFieldConfigVisible(false);
    setEditingFieldId(null);
  }, [handleConfirmField, editingFieldId]);

  const handleAddRecord = useCallback(() => {
    if (readOnly) return;
    const rowCount = table.rowCount;
    table.insertRows(rowCount, 1);
    table.notifyChange(null);
  }, [table, readOnly]);

  const title = block.title ?? baseBlockViewLabel(block.activeViewType);
  const recordCount = table.rowCount;
  const gridHeight = computeGridHeight(table);

  const viewIcons: Record<BaseEmbedViewType, React.ReactNode> = useMemo(() => ({
    grid: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3370FF" strokeWidth="1.8">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      </svg>
    ),
    kanban: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00B578" strokeWidth="1.8">
        <rect x="3" y="4" width="6" height="16" rx="1" />
        <rect x="11" y="4" width="6" height="10" rx="1" />
        <rect x="19" y="4" width="2" height="13" rx="1" />
      </svg>
    ),
    gantt: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F54A45" strokeWidth="1.8">
        <path d="M4 6h8v3H4zM4 11h14v3H4zM4 16h10v3H4z" />
      </svg>
    ),
    gallery: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C6CFF" strokeWidth="1.8">
        <rect x="3" y="5" width="8" height="8" rx="1" />
        <rect x="13" y="5" width="8" height="8" rx="1" />
        <rect x="3" y="15" width="8" height="6" rx="1" />
        <rect x="13" y="15" width="8" height="6" rx="1" />
      </svg>
    ),
  }), []);

  return (
    <div
      ref={rootRef}
      data-block-id={block.id}
      data-block-index={index}
      data-doc-base-ui
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={e => {
        e.stopPropagation();
        onSelect();
      }}
      style={{
        margin: 0,
        padding: '12px 0',
        borderRadius: 8,
        border: showBorder
          ? selected ? `2px solid ${DOC_COLORS.primary}` : `1px solid ${DOC_COLORS.border}`
          : `1px solid ${DOC_COLORS.border}`,
        background: '#fff',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: `1px solid ${BASE_THEME.toolbarBorder}`,
        background: BASE_THEME.toolbarBg,
        minHeight: 40,
      }}>
        <div ref={viewMenuRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onMouseDown={e => e.stopPropagation()}
            onClick={() => setViewMenuOpen(v => !v)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              color: DOC_COLORS.text,
              padding: '4px 6px',
              borderRadius: 4,
            }}
          >
            {viewIcons[block.activeViewType]}
            <span>{title}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#86909C" strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {viewMenuOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 4,
              background: '#fff',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              border: `1px solid ${DOC_COLORS.border}`,
              padding: '4px 0',
              minWidth: 140,
              zIndex: 20,
            }}>
              {EMBED_VIEWS.map(vt => (
                <button
                  key={vt}
                  type="button"
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => switchView(vt)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '8px 12px',
                    border: 'none',
                    background: block.activeViewType === vt ? '#F2F3F5' : 'transparent',
                    cursor: 'pointer',
                    fontSize: 14,
                    color: DOC_COLORS.text,
                    textAlign: 'left',
                  }}
                >
                  {viewIcons[vt]}
                  {baseBlockViewLabel(vt)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div data-sheet-keep-selection style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {!readOnly && (
          <ToolbarPopover
            open={fieldPopoverOpen}
            onClose={() => setFieldPopoverOpen(false)}
            width={260}
            maxHeight={520}
            overflowVisible
            align="right"
            trigger={
              <button
                type="button"
                title="字段配置"
                onMouseDown={e => e.stopPropagation()}
                onClick={() => setFieldPopoverOpen(v => !v)}
                style={{
                  width: 28,
                  height: 28,
                  border: 'none',
                  borderRadius: 4,
                  background: fieldPopoverOpen ? '#E8F0FE' : 'transparent',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: fieldPopoverOpen ? '#1a73e8' : '#646A73',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              </button>
            }
          >
            <FieldManagePopover
              columnDefs={table.sheet.columnDefs}
              onToggleFieldVisibility={handleToggleFieldVisibility}
              onReorderFields={handleReorderFields}
              onConfirmField={handleConfirmField}
              onDeleteField={handleDeleteField}
            />
          </ToolbarPopover>
          )}
        </div>
      </div>

      <div
        onFocus={onFocus}
        onMouseDown={e => e.stopPropagation()}
        style={{ position: 'relative', minHeight: gridHeight }}
      >
        <SheetContainer
          key={block.id}
          table={table}
          style={{ width: '100%', height: gridHeight }}
          previewMode={readOnly}
          onOpenFieldConfig={handleOpenFieldConfig}
          onToggleFieldVisibility={handleToggleFieldVisibility}
          onDeleteField={handleDeleteField}
        />
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px 12px',
        borderTop: `1px solid ${DOC_COLORS.border}`,
        fontSize: 12,
        color: DOC_COLORS.muted,
        gap: 8,
      }}>
        {!readOnly && (
        <button
          type="button"
          title="添加记录"
          onMouseDown={e => e.stopPropagation()}
          onClick={() => {
            onSelect();
            handleAddRecord();
          }}
          style={{
            width: 20,
            height: 20,
            border: `1px solid ${DOC_COLORS.border}`,
            borderRadius: 4,
            background: '#fff',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
            color: DOC_COLORS.muted,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          +
        </button>
        )}
        <span>{recordCount} 条记录</span>
      </div>

      {!readOnly && (
      <FieldConfigPanel
        visible={fieldConfigVisible}
        field={editingFieldId ? table.sheet.columnDefs.find(c => c.id === editingFieldId) || null : null}
        allFields={table.sheet.columnDefs}
        onClose={() => {
          setFieldConfigVisible(false);
          setEditingFieldId(null);
        }}
        onConfirm={handleFieldConfigConfirm}
      />
      )}
    </div>
  );
};

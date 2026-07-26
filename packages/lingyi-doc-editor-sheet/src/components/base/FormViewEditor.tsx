import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import type { BaseView, CellValue, ColumnDef, ColumnType } from '@lingyi-doc/core-types';
import { BASE_THEME, findFirstEmptyRecordRow, getCurrentRecordOperator, getRatingConfig, getRatingColumnWidth, isSystemColumnType } from '@lingyi-doc/core-sheet';
import { isBaseSheet } from '@lingyi-doc/core-types';
import { useSheetStore } from '../../store/sheetStore';
import { FormFieldCard } from './FormFieldCard';
import { FormFieldDeleteDialog } from './FormFieldDeleteDialog';
import { FormFieldPalette } from './FormFieldPalette';
import { FormViewToolbar, type FormSharePanelContext } from './FormViewToolbar';
import {
  addAllFieldsToForm,
  addFieldToForm,
  createDefaultColumnDef,
  getVisibleFormFieldItems,
  removeAllFieldsFromForm,
  removeFormFieldItem,
  reorderFormFieldItems,
  purgeFormField,
  syncFormFieldItems,
  syncFormFieldRename,
  updateFormFieldItem,
  updateFormViewConfig,
} from './formViewUtils';
import { isEmptyCellValue } from './formFillUtils';

interface FormViewEditorProps {
  table: FreeTable;
  formView: BaseView;
  onChange: () => void;
  onDeleteField?: (fieldId: string) => void;
  readOnly?: boolean;
  renderFormSharePanel?: (ctx: FormSharePanelContext) => React.ReactNode;
}

const DROP_PLACEHOLDER_STYLE: React.CSSProperties = {
  height: 56,
  marginBottom: 12,
  borderRadius: 8,
  border: `2px dashed ${BASE_THEME.primaryColor}`,
  background: 'rgba(51, 112, 255, 0.04)',
  boxSizing: 'border-box',
};

export const FormViewEditor: React.FC<FormViewEditorProps> = ({
  table, formView, onChange, onDeleteField, readOnly = false, renderFormSharePanel,
}) => {
  const formEditorTab = useSheetStore(s => s.formEditorTab);
  const setFormEditorTab = useSheetStore(s => s.setFormEditorTab);
  const setStatusText = useSheetStore(s => s.setStatusText);

  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);
  const [fillValues, setFillValues] = useState<Record<string, CellValue>>({});
  const [fillResetKey, setFillResetKey] = useState(0);
  const [dragState, setDragState] = useState<{ from: number; over: number } | null>(null);
  const [formRevision, setFormRevision] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{ fieldId: string; name: string } | null>(null);
  const [titleDraft, setTitleDraft] = useState(() => formView.config.formTitle ?? '表单');
  const [descriptionDraft, setDescriptionDraft] = useState(() => formView.config.formDescription ?? '');

  useEffect(() => {
    setTitleDraft(formView.config.formTitle ?? '表单');
    setDescriptionDraft(formView.config.formDescription ?? '');
  }, [formView.viewId, formView.config.formTitle, formView.config.formDescription]);

  const sheetModel = table.sheet;
  const sheet = isBaseSheet(sheetModel) ? sheetModel : null;
  const columnDefs = sheet?.columnDefs ?? [];
  const columnSyncKey = columnDefs
    .map(c => `${c.id}:${c.name}:${c.type}:${c.hidden ? 1 : 0}`)
    .join('|');

  // 表格侧增删改字段后，进入表单或字段集变化时补齐同步
  useEffect(() => {
    if (!sheet) return;
    syncFormFieldItems(formView, sheet.columnDefs);
    setFormRevision(v => v + 1);
  }, [formView, sheet, columnSyncKey]);

  const formItems = useMemo(
    () => (sheet ? getVisibleFormFieldItems(formView, sheet.columnDefs) : []),
    [formView, formRevision, sheet, columnDefs],
  );

  const persist = useCallback(() => {
    setFormRevision(v => v + 1);
    onChange();
    table.notifyChange(null);
  }, [onChange, table]);

  const handleUpdateField = useCallback((fieldId: string, patch: Parameters<typeof updateFormFieldItem>[2]) => {
    updateFormFieldItem(formView, fieldId, patch);
    persist();
  }, [formView, persist]);

  const handleUpdateColumnDef = useCallback((fieldId: string, patch: Partial<ColumnDef>) => {
    if (!sheet) return;
    const idx = columnDefs.findIndex(c => c.id === fieldId);
    if (idx < 0) return;
    const existing = columnDefs[idx];
    const oldName = existing.name;
    const updated = { ...existing, ...patch };
    if (patch.ratingIcon !== undefined && updated.type === 'rating') {
      const width = getRatingColumnWidth(getRatingConfig(updated));
      updated.width = width;
      table.setColumnWidth(idx, width);
    }
    sheet.columnDefs[idx] = updated;
    if (patch.name !== undefined && patch.name !== oldName) {
      syncFormFieldRename(sheet, fieldId, oldName, updated.name);
    }
    table.syncColumnLayout();
    persist();
  }, [columnDefs, sheet, table, persist]);

  const handleRemoveField = useCallback((fieldId: string) => {
    const col = columnDefs.find(c => c.id === fieldId);
    removeFormFieldItem(formView, fieldId);
    if (expandedFieldId === fieldId) setExpandedFieldId(null);
    persist();
    setStatusText(`已将「${col?.name || '字段'}」移出表单，表格视图字段保留`);
  }, [columnDefs, formView, expandedFieldId, persist, setStatusText]);

  const handleAddField = useCallback((fieldId: string) => {
    const col = columnDefs.find(c => c.id === fieldId);
    if (col) {
      addFieldToForm(formView, col);
      persist();
      setStatusText(`已将「${col.name}」加入表单`);
    }
  }, [columnDefs, formView, persist, setStatusText]);

  const handleCreateField = useCallback((type: ColumnType) => {
    if (!sheet) return;
    const colIndex = columnDefs.length;
    const newField = createDefaultColumnDef(type, colIndex);
    table.insertColumns(colIndex, 1);
    sheet.columnDefs.push(newField);
    table.setColumnWidth(colIndex, newField.width || 160);
    table.syncColumnLayout();
    if (isSystemColumnType(newField.type)) {
      table.backfillSystemFieldColumn(colIndex);
      persist();
      setStatusText(`已添加系统字段「${newField.name}」`);
      return;
    }
    addFieldToForm(formView, newField);
    setExpandedFieldId(newField.id);
    persist();
    setStatusText(`已添加「${newField.name}」到表单`);
  }, [columnDefs.length, sheet, table, formView, persist, setStatusText]);

  const handleDragStart = useCallback((index: number) => (e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    setDragState({ from: index, over: index });
  }, []);

  const handleDragOver = useCallback((index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragState(prev => (prev ? { ...prev, over: index } : null));
  }, []);

  const handleDrop = useCallback((index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragState) return;
    const { from } = dragState;
    if (from !== index) {
      reorderFormFieldItems(formView, from, index);
      persist();
    }
    setDragState(null);
  }, [dragState, formView, persist]);

  const handleDragEnd = useCallback(() => {
    setDragState(null);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    onDeleteField?.(deleteTarget.fieldId);
    purgeFormField(formView, deleteTarget.fieldId);
    if (expandedFieldId === deleteTarget.fieldId) setExpandedFieldId(null);
    setDeleteTarget(null);
    persist();
    setStatusText(`已删除字段「${deleteTarget.name}」，表格与表单视图均已移除`);
  }, [deleteTarget, onDeleteField, formView, expandedFieldId, persist, setStatusText]);

  const handleSubmit = useCallback(() => {
    for (const item of formItems) {
      if (item.required && isEmptyCellValue(fillValues[item.fieldId])) {
        const col = columnDefs.find(c => c.id === item.fieldId);
        setStatusText(`请填写必填项「${item.question || col?.name}」`);
        return;
      }
    }

    const formColIndices = formItems
      .map(item => columnDefs.findIndex(c => c.id === item.fieldId))
      .filter(colIndex => colIndex >= 0);
    const getFieldValue = (recordRow: number, col: number) => table.getCell(recordRow, col)?.value;
    let rowIndex = findFirstEmptyRecordRow(table.rowCount, formColIndices, getFieldValue);
    const isNewRow = rowIndex >= table.rowCount;
    if (isNewRow) {
      table.insertRows(table.rowCount, 1);
      rowIndex = table.rowCount - 1;
    }
    for (const item of formItems) {
      const colIndex = columnDefs.findIndex(c => c.id === item.fieldId);
      if (colIndex < 0) continue;
      const cellValue = fillValues[item.fieldId];
      if (isEmptyCellValue(cellValue)) continue;
      table.setCellValue(rowIndex, colIndex, cellValue);
    }

    if (isBaseSheet(table.sheet)) {
      const record = table.sheet.rows[rowIndex];
      const op = getCurrentRecordOperator();
      if (record) {
        const now = Date.now();
        if (isNewRow || !record._createdBy || record._createdBy === 'local') {
          record._createdBy = op;
          record._createdAt = now;
        }
        record._updatedBy = op;
        record._updatedAt = now;
      }
      table.syncSystemFieldsForRow(rowIndex);
    }

    table.notifyChange(null);
    setFillValues({});
    setFillResetKey(k => k + 1);
    setStatusText('表单提交成功，已添加一条记录');
  }, [formItems, fillValues, table, columnDefs, setStatusText]);

  const title = formView.config.formTitle ?? '表单';
  const description = formView.config.formDescription ?? '';
  const isDragging = dragState !== null;

  const isFillMode = readOnly || formEditorTab === 'fill';

  if (!sheet) {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: isFillMode ? '#E8EDF5' : '#EEF1F6' }}>
      {!readOnly && (
        <FormViewToolbar
          tab={formEditorTab}
          onTabChange={setFormEditorTab}
          renderFormSharePanel={renderFormSharePanel}
        />
      )}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {!readOnly && formEditorTab === 'edit' && (
          <FormFieldPalette
            view={formView}
            columnDefs={columnDefs}
            onAddField={handleAddField}
            onAddAll={() => { addAllFieldsToForm(formView, columnDefs); persist(); }}
            onRemoveAll={() => { removeAllFieldsFromForm(formView, columnDefs); persist(); }}
            onCreateField={handleCreateField}
          />
        )}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, position: 'relative' }}>
          <div style={{
            height: isFillMode ? 160 : 120,
            background: 'linear-gradient(135deg, #5B8FF9 0%, #3370FF 55%, #6C5CE7 100%)',
            position: 'relative', overflow: 'hidden',
          }}>
            {isFillMode && (
              <div style={{
                position: 'absolute', top: 0, right: 0, width: '45%', height: '100%',
                backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.35) 1px, transparent 1px)',
                backgroundSize: '14px 14px',
                opacity: 0.5,
              }} />
            )}
            <div style={{ position: 'absolute', width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', top: 20, left: '15%' }} />
            <div style={{ position: 'absolute', width: 50, height: 50, borderRadius: 12, background: 'rgba(255,255,255,0.2)', top: 40, right: '20%', transform: 'rotate(15deg)' }} />
            <div style={{ position: 'absolute', width: 30, height: 30, background: 'rgba(255,255,255,0.25)', bottom: 20, left: '45%', transform: 'rotate(45deg)' }} />
          </div>

          <div style={{ maxWidth: 720, margin: '0 auto', padding: isFillMode ? '0 24px 48px' : '0 24px 40px' }}>
            <div style={{
              background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
              marginTop: isFillMode ? -56 : -40,
              padding: isFillMode ? '56px 40px 32px' : '32px 36px 28px',
              position: 'relative',
              zIndex: 1,
            }}>
              {readOnly || formEditorTab !== 'edit' ? (
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                  <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 700, color: BASE_THEME.cellTextColor }}>{title}</h1>
                  {description && (
                    <p style={{ margin: 0, fontSize: 14, color: BASE_THEME.secondaryTextColor, lineHeight: '22px' }}>
                      {description}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <input
                    value={titleDraft}
                    onChange={e => setTitleDraft(e.target.value)}
                    onBlur={() => {
                      const next = titleDraft.trim() || '表单';
                      if (next === (formView.config.formTitle ?? '表单')) return;
                      updateFormViewConfig(formView, { formTitle: next });
                      persist();
                    }}
                    style={{
                      width: '100%', border: 'none', fontSize: 28, fontWeight: 700,
                      color: BASE_THEME.cellTextColor, outline: 'none', marginBottom: 8,
                      background: 'transparent',
                      textAlign: 'center',
                    }}
                  />
                  <input
                    value={descriptionDraft}
                    onChange={e => setDescriptionDraft(e.target.value)}
                    onBlur={() => {
                      if (descriptionDraft === (formView.config.formDescription ?? '')) return;
                      updateFormViewConfig(formView, { formDescription: descriptionDraft });
                      persist();
                    }}
                    placeholder="请输入表单描述"
                    style={{
                      width: '100%', border: 'none', fontSize: 14,
                      color: BASE_THEME.secondaryTextColor, outline: 'none', marginBottom: 24,
                      background: 'transparent',
                    }}
                  />
                </>
              )}

              {formItems.length === 0 && !readOnly && (
                <div style={{ padding: '40px 0', textAlign: 'center', color: BASE_THEME.secondaryTextColor, fontSize: 14 }}>
                  请从左侧添加字段，或点击工具栏「生成表单」同步表格字段
                </div>
              )}

              {formItems.map((item, index) => {
                const colDef = columnDefs.find(c => c.id === item.fieldId);
                if (!colDef) return null;
                const colIndex = columnDefs.findIndex(c => c.id === item.fieldId);
                const isItemDragging = dragState?.from === index;
                const isDropTarget = isDragging && dragState?.over === index && dragState.from !== index;

                const precedingFields = formItems.slice(0, index)
                  .map(fi => columnDefs.find(c => c.id === fi.fieldId))
                  .filter((c): c is ColumnDef => !!c);

                return (
                  <div
                    key={item.fieldId}
                    onDragOver={formEditorTab === 'edit' ? handleDragOver(index) : undefined}
                    onDrop={formEditorTab === 'edit' ? handleDrop(index) : undefined}
                  >
                    {isDropTarget && <div style={DROP_PLACEHOLDER_STYLE} />}
                    <FormFieldCard
                      item={item}
                      columnDef={colDef}
                      allFields={columnDefs}
                      precedingFields={precedingFields}
                      expanded={!readOnly && formEditorTab === 'edit' && expandedFieldId === item.fieldId}
                      mode={readOnly ? 'fill' : formEditorTab}
                      fillValue={fillValues[item.fieldId]}
                      fillResetKey={fillResetKey}
                      isLocked={colIndex === 0}
                      isDragging={isItemDragging}
                      onExpand={() => setExpandedFieldId(prev => prev === item.fieldId ? null : item.fieldId)}
                      onUpdate={patch => handleUpdateField(item.fieldId, patch)}
                      onUpdateColumnDef={patch => handleUpdateColumnDef(item.fieldId, patch)}
                      onRemove={() => handleRemoveField(item.fieldId)}
                      onDeleteField={() => setDeleteTarget({ fieldId: item.fieldId, name: item.question || colDef.name })}
                      onFillChange={readOnly ? undefined : v => setFillValues(prev => ({ ...prev, [item.fieldId]: v }))}
                      dragHandleProps={!readOnly && formEditorTab === 'edit' ? {
                        draggable: true,
                        onDragStart: handleDragStart(index),
                        onDragEnd: handleDragEnd,
                      } : undefined}
                    />
                  </div>
                );
              })}

              {formEditorTab === 'fill' && formItems.length > 0 && !readOnly && (
                <button
                  type="button"
                  onClick={handleSubmit}
                  style={{
                    marginTop: 8, width: '100%', padding: '13px 0', border: 'none', borderRadius: 8,
                    background: BASE_THEME.primaryColor, color: '#fff', fontSize: 15, fontWeight: 500,
                    cursor: 'pointer', boxShadow: '0 2px 8px rgba(51, 112, 255, 0.25)',
                  }}
                >
                  提交
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <FormFieldDeleteDialog
        visible={!!deleteTarget}
        fieldName={deleteTarget?.name || ''}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import { Workbook, isBaseSheet, BASE_THEME } from '@lingyi-doc/core';
import { SheetContainer, SheetTabs, useSheetStore } from '@lingyi-doc/editor-sheet';

const noop = () => {};

/** 表格/多维表预览（独立 chunk，避免与 mindnote/whiteboard 预览互相拖入） */
export const DocumentSheetPreview: React.FC<{
  title: string;
  docType: string;
  data: unknown;
}> = ({ title, docType, data }) => {
  const normalizedType = docType === 'base' ? 'base' : 'freeform';
  const [workbook] = useState(() => {
    const wb = Workbook.fromJSON(data as Record<string, unknown>);
    wb.normalizeAfterLoad(normalizedType);
    return wb;
  });
  const [activeSheetId, setActiveSheetId] = useState(workbook.activeSheetId);

  useEffect(() => {
    useSheetStore.getState().setEditingCell(null);
    useSheetStore.getState().setFormulaBarText('');
    useSheetStore.getState().setSelection(null, null);
  }, []);

  const activeTable = workbook.activeSheet;
  const isBase = activeTable ? isBaseSheet(activeTable.sheet) : false;
  const sheetInfos = useMemo(
    () => workbook.sheets.map(s => ({ id: s.id, name: s.name, type: s.type })),
    [workbook, activeSheetId],
  );

  if (!activeTable) {
    return <div style={{ padding: 48, textAlign: 'center', color: '#8f959e' }}>空白文档</div>;
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 480,
      overflow: 'hidden',
      background: isBase ? BASE_THEME.pageBg : '#fff',
    }}>
      {!isBase && title && (
        <div style={{ padding: '12px 16px', fontSize: 16, fontWeight: 600, color: '#1f2329', background: '#fff', borderBottom: '1px solid #dee0e3' }}>
          {title}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: isBase ? 8 : 0 }}>
        <SheetContainer
          key={activeSheetId}
          table={activeTable}
          previewMode
          selectedChartId={null}
          onSelectChart={noop}
          onOpenFieldConfig={noop}
          onToggleFieldVisibility={noop}
          onDeleteField={noop}
        />
      </div>
      {sheetInfos.length > 1 && (
        <SheetTabs
          sheets={sheetInfos}
          activeId={activeSheetId}
          onSwitch={id => {
            workbook.switchSheet(id);
            setActiveSheetId(id);
            useSheetStore.getState().setEditingCell(null);
            useSheetStore.getState().setFormulaBarText('');
          }}
          onAdd={noop}
          onRename={noop}
          onDelete={noop}
        />
      )}
    </div>
  );
};

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Workbook, isBaseSheet } from '@lingyi-doc/core';
import {
  SheetContainer,
  SheetTabs,
  useSheetStore,
  BASE_THEME,
} from '@lingyi-doc/editor-pro';

interface SheetEditorPreviewProps {
  /** 模板 workbook 工厂产物，每次切换模板会 remount */
  workbook: Workbook;
  docType: 'freeform' | 'base';
}

/** 与 EditorPage 使用相同的表格渲染组件 */
export const SheetEditorPreview: React.FC<SheetEditorPreviewProps> = ({ workbook: sourceWb, docType }) => {
  const [workbook] = useState(() => {
    const wb = Workbook.fromJSON(sourceWb.toJSON() as Record<string, unknown>);
    wb.normalizeAfterLoad(docType);
    return wb;
  });
  const [activeSheetId, setActiveSheetId] = useState(workbook.activeSheetId);

  useEffect(() => {
    useSheetStore.getState().setEditingCell(null);
    useSheetStore.getState().setFormulaBarText('');
    useSheetStore.getState().setSelection(null, null);
  }, []);

  const handleSwitchSheet = useCallback((sheetId: string) => {
    workbook.switchSheet(sheetId);
    setActiveSheetId(sheetId);
    useSheetStore.getState().setEditingCell(null);
    useSheetStore.getState().setFormulaBarText('');
  }, [workbook]);

  const activeTable = workbook.activeSheet;
  const isBase = activeTable ? isBaseSheet(activeTable.sheet) : false;
  const sheetInfos = useMemo(
    () => workbook.sheets.map(s => ({ id: s.id, name: s.name, type: s.type })),
    [workbook, activeSheetId],
  );

  if (!activeTable) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#8f959e' }}>空白表格</div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0,
      minWidth: 0,
      overflow: 'hidden',
      background: isBase ? BASE_THEME.pageBg : '#fff',
    }}>
      <div style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        background: isBase ? BASE_THEME.pageBg : '#fff',
        padding: isBase ? 8 : 0,
      }}>
        <div style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          background: isBase ? BASE_THEME.cardBg : '#fff',
          border: isBase ? `1px solid ${BASE_THEME.cardBorder}` : 'none',
          borderRadius: isBase ? BASE_THEME.cardRadius : 0,
          overflow: 'hidden',
        }}>
          <SheetContainer
            key={activeSheetId}
            table={activeTable}
            previewMode
            selectedChartId={null}
            onSelectChart={() => {}}
            onOpenFieldConfig={() => {}}
            onToggleFieldVisibility={() => {}}
            onDeleteField={() => {}}
          />
        </div>
      </div>
      {sheetInfos.length > 1 && (
        <SheetTabs
          sheets={sheetInfos}
          activeId={activeSheetId}
          onSwitch={handleSwitchSheet}
          onAdd={() => {}}
          onRename={() => {}}
          onDelete={() => {}}
        />
      )}
    </div>
  );
};

const CARD_PREVIEW_WIDTH = 960;
const CARD_PREVIEW_HEIGHT = 520;

/** 模板卡片缩略图：缩放版 SheetContainer */
export const SheetEditorCardPreview: React.FC<{ workbook: Workbook }> = ({ workbook }) => {
  const [wb] = useState(() => Workbook.fromJSON(workbook.toJSON() as Record<string, unknown>));
  const table = wb.activeSheet;
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.28);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      setScale(Math.min(width / CARD_PREVIEW_WIDTH, height / CARD_PREVIEW_HEIGHT, 0.45));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!table) return null;

  return (
    <div ref={hostRef} style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: CARD_PREVIEW_WIDTH,
        height: CARD_PREVIEW_HEIGHT,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        pointerEvents: 'none',
      }}>
        <SheetContainer
          table={table}
          previewMode
          selectedChartId={null}
          onSelectChart={() => {}}
          onOpenFieldConfig={() => {}}
          onToggleFieldVisibility={() => {}}
          onDeleteField={() => {}}
        />
      </div>
    </div>
  );
};

import { useEffect } from 'react';
import type { CellCoord } from '@lingyi-doc/core';
import { useSheetStore } from '../../../store/sheetStore';

export function useSheetPreviewReset(
  previewMode: boolean,
  setContextMenu: React.Dispatch<React.SetStateAction<{
    visible: boolean;
    x: number;
    y: number;
    coord: CellCoord | null;
    clickInSelection?: boolean;
  }>>,
) {
  const setEditingCell = useSheetStore(s => s.setEditingCell);
  const setFormulaBarText = useSheetStore(s => s.setFormulaBarText);
  const setSelection = useSheetStore(s => s.setSelection);

  useEffect(() => {
    if (!previewMode) return;
    setEditingCell(null);
    setFormulaBarText('');
    setSelection(null, null);
    setContextMenu({ visible: false, x: 0, y: 0, coord: null });
  }, [previewMode, setEditingCell, setFormulaBarText, setSelection, setContextMenu]);
}

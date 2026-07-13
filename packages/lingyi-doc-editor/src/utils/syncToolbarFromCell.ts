import type { CellData } from '@lingyi-doc/core';
import {
  getCellAlign,
  resolveFormatMenuKeyFromValue,
  DEFAULT_BORDER_SIDE,
  pickCellBorderSide,
} from '@lingyi-doc/core';
import { useSheetStore } from '../store/sheetStore';

const DEFAULT_FONT_COLOR = '#333333';
const DEFAULT_BG_COLOR = '#ffffff';

/** 将当前单元格样式/格式同步到顶部工具栏 */
export function syncToolbarFromCell(cellData: CellData | undefined): void {
  const store = useSheetStore.getState();
  const style = cellData?.style;

  store.setBoldActive(!!style?.bold);
  store.setItalicActive(!!style?.italic);
  store.setUnderlineActive(!!style?.underline);
  store.setStrikethroughActive(!!style?.strikethrough);
  store.setFontSize(style?.fontSize ?? 11);
  store.setFontFamily(style?.fontFamily ?? 'Arial');
  store.setFontColor(style?.fontColor ?? DEFAULT_FONT_COLOR);
  store.setBackgroundColor(style?.backgroundColor ?? DEFAULT_BG_COLOR);
  const borderSide = pickCellBorderSide(style);
  store.setBorderColor(borderSide?.color ?? DEFAULT_BORDER_SIDE.color);
  store.setBorderLineStyle(borderSide?.style ?? DEFAULT_BORDER_SIDE.style);
  store.setHorizontalAlign(
    style?.horizontalAlign ?? (cellData?.value ? getCellAlign(cellData.value) : 'left') ?? 'left',
  );
  store.setVerticalAlign(style?.verticalAlign ?? 'middle');
  store.setTextWrapActive(!!style?.textWrap);
  store.setNumberFormat(resolveFormatMenuKeyFromValue(cellData?.value));
}

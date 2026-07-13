import { create } from 'zustand';
import type { CellCoord, CellRange, CellStyle, BaseViewType, BorderStyle } from '@lingyi-doc/core';
import { DEFAULT_BORDER_SIDE } from '@lingyi-doc/core';

interface SheetStoreState {
  // 当前选中区域
  selectionRange: CellRange | null;
  /** Command/Ctrl + 点击产生的离散多选 */
  discreteSelections: CellCoord[];
  activeCell: CellCoord | null;
  editingCell: CellCoord | null;
  /** 键盘 Enter 刚打开编辑器时的时间戳，用于忽略同一次按键触发的立即提交 */
  keyboardEditOpenedAt: number;

  // UI 状态
  zoomLevel: number;
  scrollTop: number;
  scrollLeft: number;
  formulaBarText: string;
  statusText: string;

  // 多维表视图状态
  currentView: BaseViewType;
  formEditorTab: 'edit' | 'fill';

  // 工具栏状态
  boldActive: boolean;
  italicActive: boolean;
  underlineActive: boolean;
  currentFontSize: number;
  currentFontFamily: string;

  // 新增工具栏状态
  strikethroughActive: boolean;
  fontColor: string;
  backgroundColor: string;
  borderColor: string;
  borderLineStyle: BorderStyle['style'];
  horizontalAlign: string;
  verticalAlign: string;
  textWrapActive: boolean;
  numberFormat: string;
  formatPainterActive: boolean;
  formatPainterSource: CellStyle | null;

  /** 列/行头离散多选（供工具栏筛选等读取） */
  axisDiscreteCols: number[];
  axisDiscreteRows: number[];

  /** 工具栏请求打开列筛选面板（seq 用于重复打开同一列） */
  columnFilterPanelRequest: { col: number; seq: number } | null;

  // Actions
  setSelection: (range: CellRange | null, activeCell?: CellCoord | null) => void;
  setDiscreteSelections: (cells: CellCoord[], activeCell?: CellCoord | null) => void;
  setEditingCell: (coord: CellCoord | null) => void;
  markKeyboardEditOpened: () => void;
  shouldIgnoreKeyboardEditCommit: () => boolean;
  setZoomLevel: (level: number) => void;
  setScrollPosition: (top: number, left: number) => void;
  setFormulaBarText: (text: string) => void;
  setStatusText: (text: string) => void;
  setCurrentView: (view: BaseViewType) => void;
  setFormEditorTab: (tab: 'edit' | 'fill') => void;
  setBoldActive: (active: boolean) => void;
  setItalicActive: (active: boolean) => void;
  setUnderlineActive: (active: boolean) => void;
  setFontSize: (size: number) => void;
  setFontFamily: (family: string) => void;

  // 新增 Actions
  setStrikethroughActive: (active: boolean) => void;
  setFontColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  setBorderColor: (color: string) => void;
  setBorderLineStyle: (style: BorderStyle['style']) => void;
  setHorizontalAlign: (align: string) => void;
  setVerticalAlign: (align: string) => void;
  setTextWrapActive: (active: boolean) => void;
  setNumberFormat: (format: string) => void;
  setFormatPainterActive: (active: boolean, source?: CellStyle | null, mode?: 'once' | 'multi') => void;
  formatPainterMode: 'once' | 'multi';
  setAxisDiscreteCols: (cols: number[]) => void;
  setAxisDiscreteRows: (rows: number[]) => void;
  requestColumnFilterPanel: (col: number) => void;
  clearColumnFilterPanelRequest: () => void;
}

export const useSheetStore = create<SheetStoreState>((set, get) => ({
  selectionRange: null,
  discreteSelections: [],
  activeCell: null,
  editingCell: null,
  keyboardEditOpenedAt: 0,
  zoomLevel: 1,
  scrollTop: 0,
  scrollLeft: 0,
  formulaBarText: '',
  statusText: '就绪',
  currentView: 'grid',
  formEditorTab: 'edit',
  boldActive: false,
  italicActive: false,
  underlineActive: false,
  currentFontSize: 11,
  currentFontFamily: 'Arial',

  // 新增状态初始化
  strikethroughActive: false,
  fontColor: '#333333',
  backgroundColor: '#ffffff',
  borderColor: DEFAULT_BORDER_SIDE.color,
  borderLineStyle: DEFAULT_BORDER_SIDE.style,
  horizontalAlign: 'left',
  verticalAlign: 'middle',
  textWrapActive: false,
  numberFormat: 'general',
  formatPainterActive: false,
  formatPainterSource: null,
  formatPainterMode: 'once',
  columnFilterPanelRequest: null,
  axisDiscreteCols: [],
  axisDiscreteRows: [],

  setSelection: (range, activeCell = null) =>
    set({
      selectionRange: range,
      discreteSelections: [],
      activeCell: activeCell ?? (range ? range.start : null),
    }),

  setDiscreteSelections: (cells, activeCell = null) =>
    set(state => ({
      discreteSelections: cells,
      selectionRange: cells.length > 1 ? null : state.selectionRange,
      activeCell: activeCell ?? state.activeCell,
    })),

  setEditingCell: (coord) => set({ editingCell: coord }),

  markKeyboardEditOpened: () => set({ keyboardEditOpenedAt: Date.now() }),

  shouldIgnoreKeyboardEditCommit: (): boolean => {
    const openedAt = get().keyboardEditOpenedAt;
    return openedAt > 0 && Date.now() - openedAt < 120;
  },

  setZoomLevel: (level) => set({ zoomLevel: Math.max(0.5, Math.min(3.0, level)) }),

  setScrollPosition: (top, left) => set({ scrollTop: top, scrollLeft: left }),

  setFormulaBarText: (text) => set({ formulaBarText: text }),

  setStatusText: (text) => set({ statusText: text }),

  setCurrentView: (view) => set({ currentView: view }),
  setFormEditorTab: (tab) => set({ formEditorTab: tab }),

  setBoldActive: (active) => set({ boldActive: active }),
  setItalicActive: (active) => set({ italicActive: active }),
  setUnderlineActive: (active) => set({ underlineActive: active }),
  setFontSize: (size) => set({ currentFontSize: size }),
  setFontFamily: (family) => set({ currentFontFamily: family }),

  // 新增 Actions
  setStrikethroughActive: (active) => set({ strikethroughActive: active }),
  setFontColor: (color) => set({ fontColor: color }),
  setBackgroundColor: (color) => set({ backgroundColor: color }),
  setBorderColor: (color) => set({ borderColor: color }),
  setBorderLineStyle: (style) => set({ borderLineStyle: style }),
  setHorizontalAlign: (align) => set({ horizontalAlign: align }),
  setVerticalAlign: (align) => set({ verticalAlign: align }),
  setTextWrapActive: (active) => set({ textWrapActive: active }),
  setNumberFormat: (format) => set({ numberFormat: format }),
  setFormatPainterActive: (active, source = null, mode = 'once') =>
    set({ formatPainterActive: active, formatPainterSource: source, formatPainterMode: mode }),

  setAxisDiscreteCols: (cols) => set({ axisDiscreteCols: cols }),
  setAxisDiscreteRows: (rows) => set({ axisDiscreteRows: rows }),

  requestColumnFilterPanel: (col) => set(state => ({
    columnFilterPanelRequest: {
      col,
      seq: (state.columnFilterPanelRequest?.seq ?? 0) + 1,
    },
  })),

  clearColumnFilterPanelRequest: () => set({ columnFilterPanelRequest: null }),
}));

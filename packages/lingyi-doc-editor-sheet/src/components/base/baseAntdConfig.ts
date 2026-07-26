/** 多维表工具栏 Popover 层级 */
export const BASE_SHEET_POPOVER_Z_INDEX = 10001;

/** 工具栏内 Select / Dropdown 下拉层级（需高于 Popover） */
export const BASE_SHEET_DROPDOWN_Z_INDEX = 10002;

/** 列头 / 记录右键菜单层级 */
export const BASE_SHEET_CONTEXT_MENU_Z_INDEX = 10003;

export const baseSheetSelectProps = {
  getPopupContainer: () => document.body,
  styles: {
    popup: {
      root: { zIndex: BASE_SHEET_DROPDOWN_Z_INDEX },
    },
  },
} as const;

export const baseSheetPopoverProps = {
  getPopupContainer: () => document.body,
  destroyOnHidden: true,
  styles: {
    root: { zIndex: BASE_SHEET_POPOVER_Z_INDEX },
    body: { padding: '16px 20px' },
  },
} as const;

/** 工具栏按钮激活态 */
export const baseToolbarBtnActiveStyle = {
  color: '#1677ff',
  background: '#e6f4ff',
  fontWeight: 500,
} as const;

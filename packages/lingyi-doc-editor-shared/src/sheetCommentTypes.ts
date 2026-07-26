export interface SheetCommentRequest {
  rowIndex: number;
  colIndex: number;
  /** 多维表记录 ID；普通表格无需提供 */
  recordId?: string;
  fieldId?: string;
  quote: string;
}

import { RichDocument } from '../doc/model';
import { Workbook } from '../model/Workbook';
import { DocxIO, isDocxFile } from './DocxIO';
import { MarkdownIO, isMarkdownFile } from './MarkdownIO';
import { XlsxIO } from './XlsxIO';

const SPREADSHEET_EXTENSIONS = /\.(xlsx|xls|csv)$/i;

const SPREADSHEET_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
]);

export function isSpreadsheetFile(file: File): boolean {
  if (SPREADSHEET_EXTENSIONS.test(file.name)) return true;
  return SPREADSHEET_MIME_TYPES.has(file.type);
}

export type DocumentImportResult =
  | { kind: 'richtext'; title: string; document: RichDocument }
  | { kind: 'workbook'; title: string; workbook: Workbook; docType: 'freeform' };

function titleFromSpreadsheetName(fileName: string): string {
  return fileName.replace(SPREADSHEET_EXTENSIONS, '').trim() || '导入的表格';
}

/** 按文件类型导入为自研文档（富文本 / 表格） */
export async function importDocumentFile(file: File): Promise<DocumentImportResult> {
  if (isMarkdownFile(file)) {
    const { title, document } = await MarkdownIO.importFromFile(file);
    return { kind: 'richtext', title, document };
  }
  if (isDocxFile(file)) {
    const { title, document } = await DocxIO.importFromFile(file);
    return { kind: 'richtext', title, document };
  }
  if (isSpreadsheetFile(file)) {
    const workbook = await XlsxIO.importFromFile(file);
    return {
      kind: 'workbook',
      title: titleFromSpreadsheetName(file.name),
      workbook,
      docType: 'freeform',
    };
  }
  throw new Error('不支持的文件格式，请上传 .docx、.md、.xlsx、.xls 或 .csv');
}

export { isDocxFile, isMarkdownFile };

export { XlsxIO } from './XlsxIO';
export { RichDocExport, type RichDocExportFormat, type RichDocExportOptions } from './RichDocExport';
export { MarkdownIO, isMarkdownFile } from './MarkdownIO';
export { DocxIO, isDocxFile } from './DocxIO';
export { importDocumentFile, isSpreadsheetFile, type DocumentImportResult } from './DocumentImport';
export { SaveManager, type SaveManagerOptions, type SaveStatus } from './SaveManager';
export * from './patch/index';
export {
  registerDocumentHandler,
  getDocumentHandler,
  requireDocumentHandler,
  listDocumentHandlerTypes,
  type DocumentHandler,
} from '@lingyi-doc/core-types';
import './handlers/registerBuiltin';

import type { DocBlock } from '../doc/types';
import {
  blocksToHtml,
  blocksToMarkdown,
  downloadBlob,
  printHtmlDocument,
  sanitizeFileName,
  wrapHtmlDocument,
  wrapHtmlForWord,
} from '../doc/export';

export type RichDocExportFormat = 'word' | 'pdf' | 'markdown';

export class RichDocExport {
  static export(blocks: DocBlock[], title: string, format: RichDocExportFormat): void {
    const safeName = sanitizeFileName(title);
    switch (format) {
      case 'markdown': {
        const md = blocksToMarkdown(blocks);
        const blob = new Blob(['\uFEFF' + md], { type: 'text/markdown;charset=utf-8' });
        downloadBlob(blob, `${safeName}.md`);
        break;
      }
      case 'word': {
        const body = blocksToHtml(blocks);
        const html = wrapHtmlForWord(body, title);
        const blob = new Blob(['\uFEFF' + html], { type: 'application/msword' });
        downloadBlob(blob, `${safeName}.doc`);
        break;
      }
      case 'pdf': {
        const body = blocksToHtml(blocks);
        const html = wrapHtmlDocument(body, title);
        printHtmlDocument(html);
        break;
      }
      default:
        break;
    }
  }
}

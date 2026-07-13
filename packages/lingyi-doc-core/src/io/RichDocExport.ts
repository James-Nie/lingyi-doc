import type { DocBlock } from '../doc/types';
import type { WhiteboardJSON } from '../whiteboard/types';
import {
  blocksToHtml,
  blocksToMarkdown,
  downloadBlob,
  prepareBlocksForExport,
  printHtmlDocument,
  sanitizeFileName,
  wrapHtmlDocument,
  wrapHtmlForWord,
} from '../doc/export';

export type RichDocExportFormat = 'word' | 'pdf' | 'markdown';

export interface RichDocExportOptions {
  /** 导出前预处理块（内嵌图片、渲染画板等） */
  prepareBlocks?: (blocks: DocBlock[]) => Promise<DocBlock[]>;
  /** 将图片 URL 解析为 data URI */
  resolveImageUrl?: (url: string) => Promise<string>;
  /** 将画板数据渲染为 data URI */
  renderWhiteboard?: (data: WhiteboardJSON) => Promise<string | null>;
}

export class RichDocExport {
  static async exportAsync(
    blocks: DocBlock[],
    title: string,
    format: RichDocExportFormat,
    options?: RichDocExportOptions,
  ): Promise<void> {
    const safeName = sanitizeFileName(title);
    const needsEmbed = format === 'word' || format === 'pdf';
    const prepared = needsEmbed
      ? await RichDocExport.resolveBlocks(blocks, options)
      : blocks;

    switch (format) {
      case 'markdown': {
        const md = blocksToMarkdown(prepared);
        const blob = new Blob(['\uFEFF' + md], { type: 'text/markdown;charset=utf-8' });
        downloadBlob(blob, `${safeName}.md`);
        break;
      }
      case 'word': {
        const body = blocksToHtml(prepared);
        const html = wrapHtmlForWord(body, title);
        const blob = new Blob(['\uFEFF' + html], { type: 'application/msword' });
        downloadBlob(blob, `${safeName}.doc`);
        break;
      }
      case 'pdf': {
        const body = blocksToHtml(prepared);
        const html = wrapHtmlDocument(body, title);
        await printHtmlDocument(html);
        break;
      }
      default:
        break;
    }
  }

  /** @deprecated 请使用 exportAsync；Word/PDF 导出不会内嵌图片与画板 */
  static export(blocks: DocBlock[], title: string, format: RichDocExportFormat): void {
    void RichDocExport.exportAsync(blocks, title, format);
  }

  private static async resolveBlocks(
    blocks: DocBlock[],
    options?: RichDocExportOptions,
  ): Promise<DocBlock[]> {
    if (options?.prepareBlocks) return options.prepareBlocks(blocks);
    if (options?.resolveImageUrl || options?.renderWhiteboard) {
      return prepareBlocksForExport(blocks, options);
    }
    return blocks;
  }
}

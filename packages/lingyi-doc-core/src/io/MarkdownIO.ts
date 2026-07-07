import { RichDocument } from '../doc/model';
import { parseMarkdownToBlocks } from '../doc/markdown';

const MARKDOWN_EXTENSIONS = /\.(md|markdown|mkd|mdown)$/i;

const MARKDOWN_MIME_TYPES = new Set([
  'text/markdown',
  'text/x-markdown',
  'application/x-markdown',
]);

function titleFromFileName(fileName: string): string {
  return fileName.replace(MARKDOWN_EXTENSIONS, '').trim() || '导入的文档';
}

/** 判断是否为 Markdown 文件（扩展名或 MIME） */
export function isMarkdownFile(file: File): boolean {
  if (MARKDOWN_EXTENSIONS.test(file.name)) return true;
  return MARKDOWN_MIME_TYPES.has(file.type);
}

export class MarkdownIO {
  static isMarkdownFile = isMarkdownFile;

  /** 从本地 Markdown 文件导入为富文本文档 */
  static async importFromFile(file: File): Promise<{ title: string; document: RichDocument }> {
    const text = await file.text();
    const normalized = text.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '');
    const blocks = parseMarkdownToBlocks(normalized);
    const title = titleFromFileName(file.name);
    const document = new RichDocument('', title, blocks);
    return { title, document };
  }
}

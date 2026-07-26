/**
 * 文档剪贴板小工具（P2-7 收敛）：统一判断粘贴块是否「有意义」
 * 避免 RichDocEditor 内多处复制 filter 逻辑。
 */
import type { DocBlock } from './types';
import { isTextBlock } from './utils';
import { parseHtmlToBlocks } from './html';

export function filterMeaningfulPasteBlocks(blocks: DocBlock[]): DocBlock[] {
  return blocks.filter(b => {
    if (isTextBlock(b)) return b.text.trim().length > 0;
    if (b.type === 'list') return b.items.some(it => it.text.trim().length > 0);
    return true;
  });
}

/** 从 HTML 字符串解析并过滤空块；失败返回 null */
export function parseHtmlClipboardToBlocks(html: string): DocBlock[] | null {
  const trimmed = html.trim();
  if (!trimmed) return null;
  try {
    const blocks = parseHtmlToBlocks(trimmed);
    const meaningful = filterMeaningfulPasteBlocks(blocks);
    return meaningful.length ? meaningful : null;
  } catch {
    return null;
  }
}

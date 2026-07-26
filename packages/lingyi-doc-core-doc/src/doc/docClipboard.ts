import type { DocBlock } from './types';
import { cloneDocBlock, isTextBlock } from './utils';
import { blocksToMarkdown } from './export';
import { extractDocSelection } from './selectionExtract';
import {
  getNativeTextSelectionDetail,
  selectionSlicesToAnchors,
  type NativeTextSelectionDetail,
} from './selectionFormat';
import { findEditableRoot, findBlockIndexFromNode } from './selection';
import { getListCaretContext } from './listDom';
import { isCollapsedDocSelection, type DocSelection } from './selectionModel';

export const DOC_BLOCKS_CLIPBOARD_MIME = 'application/x-ai-table-doc-blocks';

export type DocCopyPayload = {
  plainText: string;
  blocks: DocBlock[];
};

function payloadFromBlocks(blocks: DocBlock[]): DocCopyPayload | null {
  if (!blocks.length) return null;
  return {
    plainText: blocksToMarkdown(blocks),
    blocks,
  };
}

/** 整块可复制（标题/段落/引用/列表） */
export function isWholeBlockCopyable(block: DocBlock): boolean {
  return isTextBlock(block) || block.type === 'list';
}

/** 无选区时复制整个块 */
export function extractWholeBlockCopyPayload(block: DocBlock): DocCopyPayload | null {
  if (!isWholeBlockCopyable(block)) return null;
  return payloadFromBlocks([cloneDocBlock(block)]);
}

/** 从原生文本选区提取结构化块（标题/段落/引用/列表等） */
export function extractNativeSelectionCopyPayload(
  blocks: DocBlock[],
  blockEls: Map<string, HTMLElement>,
  savedDetail?: NativeTextSelectionDetail | null,
): DocCopyPayload | null {
  let detail = getNativeTextSelectionDetail(blocks, blockEls);
  if ((!detail || detail.collapsed || !detail.slices.length) && savedDetail) {
    detail = savedDetail;
  }
  if (!detail || detail.collapsed || !detail.slices.length) return null;

  const anchors = selectionSlicesToAnchors(detail.slices);
  if (!anchors) return null;

  const extracted = extractDocSelection(blocks, {
    anchor: anchors.anchor,
    focus: anchors.focus,
  });
  return payloadFromBlocks(extracted.blocks);
}

/** 统一解析当前应写入剪贴板的内容 */
export function resolveDocCopyPayload(params: {
  blocks: DocBlock[];
  blockEls: Map<string, HTMLElement>;
  docSelection: DocSelection | null;
  savedNativeDetail?: NativeTextSelectionDetail | null;
  focusNode?: Node | null;
  /** 单击选中的对象块（图片/表格/代码等） */
  selectedBlockIndex?: number | null;
}): DocCopyPayload | null {
  const { blocks, blockEls, docSelection, savedNativeDetail, focusNode, selectedBlockIndex } = params;

  if (docSelection && !isCollapsedDocSelection(docSelection)) {
    const extracted = extractDocSelection(blocks, docSelection);
    return payloadFromBlocks(extracted.blocks);
  }

  const nativePayload = extractNativeSelectionCopyPayload(
    blocks,
    blockEls,
    savedNativeDetail,
  );
  if (nativePayload) return nativePayload;

  if (selectedBlockIndex != null && selectedBlockIndex >= 0 && selectedBlockIndex < blocks.length) {
    return payloadFromBlocks([cloneDocBlock(blocks[selectedBlockIndex])]);
  }

  const editable = findEditableRoot(focusNode ?? null);
  if (!editable) return null;

  const blockIndex = findBlockIndexFromNode(editable);
  const block = blockIndex >= 0 ? blocks[blockIndex] : null;
  if (!block || !isWholeBlockCopyable(block)) return null;

  if (editable.dataset.listRoot !== undefined && block.type === 'list') {
    const listCtx = getListCaretContext(editable);
    if (listCtx && !listCtx.collapsed) return null;
    return extractWholeBlockCopyPayload(block);
  }

  const sel = typeof window !== 'undefined' ? window.getSelection() : null;
  if (sel && !sel.isCollapsed) return null;

  return extractWholeBlockCopyPayload(block);
}

export function writeDocCopyToClipboard(
  dt: DataTransfer | null | undefined,
  payload: DocCopyPayload,
): void {
  if (!dt || !payload.blocks.length) return;
  dt.setData('text/plain', payload.plainText || ' ');
  dt.setData(DOC_BLOCKS_CLIPBOARD_MIME, JSON.stringify(payload.blocks));
}

/** 从剪贴板读取结构化文档块（粘贴时重新生成 id） */
export function parseClipboardDocBlocks(dt: DataTransfer | null | undefined): DocBlock[] | null {
  if (!dt) return null;
  try {
    const raw = dt.getData(DOC_BLOCKS_CLIPBOARD_MIME);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || !parsed.length) return null;
    return (parsed as DocBlock[]).map(block => cloneDocBlock(block));
  } catch {
    return null;
  }
}

// 兼容旧导出
export const extractListCopyPayload = extractNativeSelectionCopyPayload;
export function wholeListCopyPayload(block: DocBlock): DocCopyPayload | null {
  return block.type === 'list' ? extractWholeBlockCopyPayload(block) : null;
}

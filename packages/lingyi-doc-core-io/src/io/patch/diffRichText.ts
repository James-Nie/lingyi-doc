function getContentBlocks(doc: Record<string, unknown>): unknown[] {
  if (Array.isArray(doc.content)) return doc.content;
  // 兼容旧数据
  if (Array.isArray(doc.blocks)) return doc.blocks;
  return [];
}

function computeContentIndexOps(
  before: unknown[],
  after: unknown[],
): import('./types').RichTextPatchOp[] {
  const ops: import('./types').RichTextPatchOp[] = [];

  if (before.length === after.length) {
    for (let i = 0; i < before.length; i++) {
      if (JSON.stringify(before[i]) !== JSON.stringify(after[i])) {
        ops.push({ type: 'update_content_block', index: i, block: after[i] });
      }
    }
    return ops;
  }

  const minLen = Math.min(before.length, after.length);
  for (let i = 0; i < minLen; i++) {
    if (JSON.stringify(before[i]) !== JSON.stringify(after[i])) {
      ops.push({ type: 'update_content_block', index: i, block: after[i] });
    }
  }

  if (after.length > before.length) {
    for (let i = before.length; i < after.length; i++) {
      ops.push({ type: 'insert_content_block', index: i, block: after[i] });
    }
  }

  if (before.length > after.length) {
    for (let i = before.length - 1; i >= after.length; i--) {
      ops.push({ type: 'delete_content_block', index: i });
    }
  }

  return ops;
}

/** 对比富文本文档 JSON（RichDocumentJSON：documentId + title + content） */
export function diffRichText(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): import('./types').RichTextPatchOp[] {
  const ops: import('./types').RichTextPatchOp[] = [];

  const metaPatch: { title?: string; documentId?: string } = {};
  if (before.title !== after.title) metaPatch.title = after.title as string;
  if (before.documentId !== after.documentId) metaPatch.documentId = after.documentId as string;
  if (Object.keys(metaPatch).length > 0) {
    ops.push({ type: 'set_doc_meta', patch: metaPatch });
  }

  const beforeContent = getContentBlocks(before);
  const afterContent = getContentBlocks(after);

  if (JSON.stringify(beforeContent) === JSON.stringify(afterContent)) {
    return ops;
  }

  const contentOps = computeContentIndexOps(beforeContent, afterContent);
  if (contentOps.length === 0 || contentOps.length > 30) {
    ops.push({ type: 'replace_content', content: afterContent });
    return ops;
  }

  ops.push(...contentOps);
  return ops;
}

/** 提取用于 hash 对比的富文本 canonical 字段 */
export function richTextSnapshotForDiff(doc: Record<string, unknown>): Record<string, unknown> {
  return {
    documentId: doc.documentId ?? '',
    title: doc.title ?? '',
    content: getContentBlocks(doc),
  };
}

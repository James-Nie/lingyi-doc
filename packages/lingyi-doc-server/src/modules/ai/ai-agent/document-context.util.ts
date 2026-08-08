import type { DocumentRecord } from '../../../types/database';
import { extractDocumentPlainText } from '../../../utils/documentContentStats';

type DocBlockLike = {
  type?: string;
  text?: string;
  level?: number;
  items?: Array<{ text?: string; level?: number }>;
};

export interface DocumentContextPayload {
  id: string;
  title: string;
  docType: string;
  version: number;
  plainText: string;
  blockCount: number;
  isEmpty: boolean;
}

function extractBlockText(block: DocBlockLike): string {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'quote':
    case 'code':
    case 'mermaid':
      return block.text?.trim() ?? '';
    case 'list':
      return (block.items ?? [])
        .map((item) => `${'  '.repeat(item.level ?? 0)}- ${item.text ?? ''}`.trim())
        .filter(Boolean)
        .join('\n');
    default:
      return block.text?.trim() ?? '';
  }
}

function getContentBlocks(data: unknown): DocBlockLike[] {
  if (!data || typeof data !== 'object') return [];
  const record = data as Record<string, unknown>;
  if (Array.isArray(record.content)) return record.content as DocBlockLike[];
  if (Array.isArray(data)) return data as DocBlockLike[];
  return [];
}

export function buildDocumentContext(doc: DocumentRecord): DocumentContextPayload {
  const docType = doc.docType === 'rich' ? 'richtext' : doc.docType;
  const blocks = getContentBlocks(doc.data);
  const plainText = extractDocumentPlainText(doc.data, docType);

  return {
    id: doc.id,
    title: doc.title,
    docType: doc.docType,
    version: doc.version,
    plainText,
    blockCount: blocks.length,
    isEmpty: plainText.trim().length === 0,
  };
}

export function formatDocumentContextForPrompt(ctx: DocumentContextPayload): string {
  const preview = ctx.plainText.length > 12000
    ? `${ctx.plainText.slice(0, 12000)}\n\n...(内容已截断，共 ${ctx.plainText.length} 字)`
    : ctx.plainText;

  return [
    '## 当前绑定的文档',
    `- 文档ID: ${ctx.id}`,
    `- 标题: ${ctx.title}`,
    `- 类型: ${ctx.docType}`,
    `- 版本: ${ctx.version}`,
    `- 块数量: ${ctx.blockCount}`,
    '',
    '## 文档正文',
    ctx.isEmpty ? '(文档当前为空)' : preview,
    '',
    '## 操作要求',
    `- 读取文档时使用 read_document，documentId 必须为 \`${ctx.id}\``,
    `- 更新文档时使用 write_document，documentId 必须为 \`${ctx.id}\``,
    '- 用户要求完善、续写、改写文档时，必须基于上述正文操作，并调用 write_document 写回',
  ].join('\n');
}

export function appendTextToDocumentData(data: unknown, text: string): Record<string, unknown> {
  const normalized = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const content = [...getContentBlocks(normalized)] as Array<Record<string, unknown>>;

  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(paragraph);
    if (headingMatch) {
      content.push({
        type: 'heading',
        id: `blk_ai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        level: headingMatch[1].length,
        text: headingMatch[2],
        marks: [],
        align: 'left',
      });
      continue;
    }

    content.push({
      type: 'paragraph',
      id: `blk_ai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      text: paragraph.replace(/\n/g, ' '),
      marks: [],
      align: 'left',
    });
  }

  return {
    ...normalized,
    content,
  };
}

export function replaceDocumentContent(data: unknown, text: string): Record<string, unknown> {
  const normalized = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const content: Array<Record<string, unknown>> = paragraphs.map((paragraph, index) => {
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(paragraph);
    if (headingMatch) {
      return {
        type: 'heading',
        id: `blk_ai_${index}_${Date.now()}`,
        level: headingMatch[1].length,
        text: headingMatch[2],
        marks: [],
        align: 'left',
      };
    }
    return {
      type: 'paragraph',
      id: `blk_ai_${index}_${Date.now()}`,
      text: paragraph.replace(/\n/g, ' '),
      marks: [],
      align: 'left',
    };
  });

  return {
    ...normalized,
    content: content.length > 0 ? content : [{
      type: 'paragraph',
      id: `blk_ai_empty_${Date.now()}`,
      text: '',
      marks: [],
      align: 'left',
    }],
  };
}

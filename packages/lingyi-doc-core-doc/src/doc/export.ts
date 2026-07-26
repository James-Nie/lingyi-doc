import type { EmbeddedWhiteboardData, DocBlock, ImageBlock, ListBlock, TableBlock, TextMark } from './types';
import { baseBlockToExportTable } from './exportBaseBlock';
export {
  downloadBlob,
  printHtmlDocument,
  sanitizeFileName,
  wrapHtmlDocument,
  wrapImagePrintHtml,
} from '@lingyi-doc/core-types';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeMarkdownCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

type MarkSpan = { start: number; end: number; open: string; close: string };

function buildMarkSpans(text: string, marks: TextMark[], mode: 'html' | 'markdown'): MarkSpan[] {
  const spans: MarkSpan[] = [];
  for (const mark of marks) {
    if (mark.start >= mark.end || mark.end > text.length) continue;
    switch (mark.type) {
      case 'bold':
        spans.push({ start: mark.start, end: mark.end, open: mode === 'html' ? '<strong>' : '**', close: mode === 'html' ? '</strong>' : '**' });
        break;
      case 'italic':
        spans.push({ start: mark.start, end: mark.end, open: mode === 'html' ? '<em>' : '*', close: mode === 'html' ? '</em>' : '*' });
        break;
      case 'underline':
        spans.push({ start: mark.start, end: mark.end, open: mode === 'html' ? '<u>' : '', close: mode === 'html' ? '</u>' : '' });
        break;
      case 'strikethrough':
        spans.push({ start: mark.start, end: mark.end, open: mode === 'html' ? '<s>' : '~~', close: mode === 'html' ? '</s>' : '~~' });
        break;
      case 'link':
        if (mark.value) {
          const label = escapeHtml(text.slice(mark.start, mark.end));
          if (mode === 'html') {
            spans.push({
              start: mark.start,
              end: mark.end,
              open: `<a href="${escapeHtml(mark.value)}">`,
              close: '</a>',
            });
          } else {
            spans.push({
              start: mark.start,
              end: mark.end,
              open: '[',
              close: `](${mark.value})`,
            });
            // markdown link replaces inner text handling below
            void label;
          }
        }
        break;
      case 'fontSize':
        if (mark.value && mode === 'html') {
          spans.push({
            start: mark.start,
            end: mark.end,
            open: `<span style="font-size:${escapeHtml(mark.value)}">`,
            close: '</span>',
          });
        }
        break;
      case 'color':
        if (mark.value && mode === 'html') {
          spans.push({ start: mark.start, end: mark.end, open: `<span style="color:${escapeHtml(mark.value)}">`, close: '</span>' });
        }
        break;
      case 'background':
        if (mark.value && mode === 'html') {
          spans.push({ start: mark.start, end: mark.end, open: `<span style="background:${escapeHtml(mark.value)}">`, close: '</span>' });
        }
        break;
      default:
        break;
    }
  }
  return spans.sort((a, b) => a.start - b.start || b.end - a.end);
}

function renderInline(text: string, marks: TextMark[], mode: 'html' | 'markdown'): string {
  if (!text) return '';
  const spans = buildMarkSpans(text, marks, mode);
  if (!spans.length) return mode === 'html' ? escapeHtml(text) : text;

  const points = new Set<number>([0, text.length]);
  for (const span of spans) {
    points.add(span.start);
    points.add(span.end);
  }
  const sorted = [...points].sort((a, b) => a - b);
  let result = '';

  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (start >= end) continue;
    const chunk = text.slice(start, end);
    const active = spans.filter(s => s.start <= start && s.end >= end);
    const open = active.map(s => s.open).join('');
    const close = [...active].reverse().map(s => s.close).join('');
    if (mode === 'html') {
      result += open + escapeHtml(chunk) + close;
    } else {
      result += open + chunk + close;
    }
  }
  return result;
}

function listToMarkdown(block: ListBlock): string {
  return block.items.map((item, index) => {
    const indent = '  '.repeat(Math.max(0, item.level - 1));
    const inline = item.marks?.length
      ? renderInline(item.text, item.marks, 'markdown')
      : renderInline(item.text, [], 'markdown');
    if (block.listType === 'ordered') return `${indent}${index + 1}. ${inline}`;
    if (block.listType === 'task') return `${indent}- [${item.checked ? 'x' : ' '}] ${inline}`;
    return `${indent}- ${inline}`;
  }).join('\n');
}

function tableToMarkdown(block: TableBlock): string {
  const rows: string[] = [];
  for (let r = 0; r < block.rows; r++) {
    const cells = block.cells[r]?.map(cell => {
      const text = cell?.text ?? '';
      const inline = cell?.marks?.length
        ? renderInline(text, cell.marks, 'markdown')
        : escapeMarkdownCell(text);
      return escapeMarkdownCell(inline);
    }) ?? [];
    rows.push(`| ${cells.join(' | ')} |`);
    if (r === 0) rows.push(`| ${cells.map(() => '---').join(' | ')} |`);
  }
  return rows.join('\n');
}

function buildBlockStyle(opts: {
  align?: string;
  blockBackground?: string;
  indentLevel?: number;
  firstLineIndent?: boolean;
}): string {
  const parts: string[] = [];
  if (opts.blockBackground) parts.push(`background:${escapeHtml(opts.blockBackground)}`);
  if (opts.align && opts.align !== 'left') parts.push(`text-align:${opts.align}`);
  if (opts.indentLevel && opts.indentLevel > 0) parts.push(`margin-left:${opts.indentLevel * 24}px`);
  if (opts.firstLineIndent) parts.push('text-indent:2em');
  return parts.length ? ` style="${parts.join(';')}"` : '';
}

function imageToHtml(block: { url: string; alt?: string; caption?: string; width?: number; align?: string }): string {
  const widthAttr = block.width ? ` width="${block.width}"` : '';
  const alignStyle = block.align && block.align !== 'left' ? ` style="display:block;margin:${block.align === 'center' ? '12px auto' : block.align === 'right' ? '12px 0 12px auto' : '12px 0'};max-width:100%;"` : ' style="max-width:100%;margin:12px 0;"';
  return `<figure${block.align === 'center' ? ' align="center"' : ''}><img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt ?? '')}"${widthAttr}${alignStyle} />${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ''}</figure>`;
}

function tableToHtml(block: TableBlock): string {
  const body = block.cells.map((row, ri) => {
    const tag = ri === 0 ? 'th' : 'td';
    const cells = row.map(cell => {
      const text = cell?.text ?? '';
      const inner = cell?.marks?.length
        ? renderInline(text, cell.marks, 'html')
        : escapeHtml(text);
      return `<${tag}>${inner}</${tag}>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%;">${body}</table>`;
}

function blockToMarkdown(block: DocBlock): string {
  switch (block.type) {
    case 'heading':
      return `${'#'.repeat(block.level)} ${renderInline(block.text, block.marks, 'markdown')}`;
    case 'paragraph':
      return renderInline(block.text, block.marks, 'markdown');
    case 'quote':
      return renderInline(block.text, block.marks, 'markdown')
        .split('\n')
        .map(line => `> ${line}`)
        .join('\n');
    case 'list':
      return listToMarkdown(block);
    case 'code':
      return `\`\`\`${block.language ?? ''}\n${block.text}\n\`\`\``;
    case 'mermaid':
      return `\`\`\`mermaid\n${block.text}\n\`\`\``;
    case 'divider':
      return '---';
    case 'table':
      return tableToMarkdown(block);
    case 'image':
      return `![${block.alt ?? ''}](${block.url})`;
    case 'whiteboard':
      return `[${block.title ?? '画板'}]`;
    case 'base': {
      const table = baseBlockToExportTable(block);
      return table.type === 'table' ? tableToMarkdown(table) : blockToMarkdown(table);
    }
    default:
      return '';
  }
}

function blockToHtml(block: DocBlock): string {
  switch (block.type) {
    case 'heading': {
      const tag = `h${block.level}`;
      const style = buildBlockStyle(block);
      return `<${tag}${style}>${renderInline(block.text, block.marks, 'html')}</${tag}>`;
    }
    case 'paragraph': {
      const style = buildBlockStyle(block);
      return `<p${style}>${renderInline(block.text, block.marks, 'html')}</p>`;
    }
    case 'quote': {
      const style = buildBlockStyle(block);
      return `<blockquote${style}>${renderInline(block.text, block.marks, 'html')}</blockquote>`;
    }
    case 'list': {
      const tag = block.listType === 'ordered' ? 'ol' : 'ul';
      const items = block.items.map(item => {
        const inner = item.marks?.length
          ? renderInline(item.text, item.marks, 'html')
          : escapeHtml(item.text);
        const indent = item.level > 1 ? ` style="margin-left:${(item.level - 1) * 24}px;"` : '';
        if (block.listType === 'task') {
          return `<li${indent}><input type="checkbox"${item.checked ? ' checked' : ''} disabled /> ${inner}</li>`;
        }
        return `<li${indent}>${inner}</li>`;
      }).join('');
      return `<${tag}>${items}</${tag}>`;
    }
    case 'code': {
      const lang = block.language ? ` class="language-${escapeHtml(block.language)}"` : '';
      return `<pre><code${lang}>${escapeHtml(block.text)}</code></pre>`;
    }
    case 'mermaid':
      return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
    case 'divider':
      return '<hr />';
    case 'table':
      return tableToHtml(block);
    case 'image':
      return imageToHtml(block);
    case 'whiteboard':
      return `<p style="color:#646a73;">[${escapeHtml(block.title ?? '画板')}]</p>`;
    case 'base': {
      const table = baseBlockToExportTable(block);
      return table.type === 'table' ? tableToHtml(table) : blockToHtml(table);
    }
    default:
      return '';
  }
}

export interface ExportEmbedOptions {
  resolveImageUrl?: (url: string) => Promise<string>;
  renderWhiteboard?: (data: EmbeddedWhiteboardData) => Promise<string | null>;
}

function toExportImageBlock(
  source: DocBlock,
  dataUrl: string,
  alt: string,
  width?: number,
): ImageBlock {
  return {
    type: 'image',
    id: source.id,
    url: dataUrl,
    alt,
    width,
    align: 'center',
  };
}

/** 导出前内嵌图片、渲染画板（供 Word/PDF 离线可用） */
export async function prepareBlocksForExport(
  blocks: DocBlock[],
  options: ExportEmbedOptions,
): Promise<DocBlock[]> {
  const { resolveImageUrl, renderWhiteboard } = options;
  if (!resolveImageUrl && !renderWhiteboard) return blocks;

  const prepared: DocBlock[] = [];
  for (const block of blocks) {
    if (block.type === 'image' && resolveImageUrl) {
      if (!block.url) {
        prepared.push({ type: 'paragraph', id: block.id, text: '[图片]', marks: [] });
        continue;
      }
      try {
        const url = await resolveImageUrl(block.url);
        prepared.push({ ...block, url });
      } catch {
        prepared.push({
          type: 'paragraph',
          id: block.id,
          text: block.alt ? `[图片: ${block.alt}]` : '[图片加载失败]',
          marks: [],
        });
      }
      continue;
    }

    if (block.type === 'whiteboard' && renderWhiteboard) {
      try {
        const dataUrl = await renderWhiteboard(block.whiteboardData);
        if (dataUrl) {
          prepared.push(toExportImageBlock(block, dataUrl, block.title ?? '画板', 640));
          continue;
        }
      } catch { /* fall through to placeholder */ }
      prepared.push({
        type: 'paragraph',
        id: block.id,
        text: `[${block.title ?? '画板'}]`,
        marks: [],
      });
      continue;
    }

    prepared.push(block);
  }
  return prepared;
}

/** 将文档块序列化为 Markdown 文本 */
export function blocksToMarkdown(blocks: DocBlock[]): string {
  return blocks
    .map(blockToMarkdown)
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

/** 将文档块序列化为 HTML 片段 */
export function blocksToHtml(blocks: DocBlock[]): string {
  return blocks.map(blockToHtml).filter(Boolean).join('\n');
}

export function wrapHtmlForWord(body: string, title: string): string {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>
  body { font-family: "PingFang SC", "Microsoft YaHei", sans-serif; color: #1f2329; line-height: 1.6; }
  h1,h2,h3,h4,h5,h6 { margin: 1em 0 0.5em; }
  p { margin: 0.5em 0; }
  pre { background: #f5f6f7; padding: 12px; border-radius: 6px; white-space: pre-wrap; word-wrap: break-word; }
  blockquote { border-left: 3px solid #dee0e3; margin: 0.8em 0; padding-left: 12px; color: #646a73; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #dee0e3; padding: 6px 8px; vertical-align: top; }
  img { max-width: 100%; height: auto; }
  figure { margin: 12px 0; }
  figcaption { font-size: 12px; color: #646a73; text-align: center; margin-top: 4px; }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${body}
</body>
</html>`;
}

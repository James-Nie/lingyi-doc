import type { DocBlock, ListBlock, TableBlock, TextMark } from './types';

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
    case 'base':
      return '';
    default:
      return '';
  }
}

function blockToHtml(block: DocBlock): string {
  switch (block.type) {
    case 'heading': {
      const tag = `h${block.level}`;
      return `<${tag}>${renderInline(block.text, block.marks, 'html')}</${tag}>`;
    }
    case 'paragraph': {
      const align = block.align && block.align !== 'left' ? ` style="text-align:${block.align}"` : '';
      return `<p${align}>${renderInline(block.text, block.marks, 'html')}</p>`;
    }
    case 'quote':
      return `<blockquote>${renderInline(block.text, block.marks, 'html')}</blockquote>`;
    case 'list': {
      const tag = block.listType === 'ordered' ? 'ol' : 'ul';
      const items = block.items.map(item => {
        const inner = item.marks?.length
          ? renderInline(item.text, item.marks, 'html')
          : escapeHtml(item.text);
        if (block.listType === 'task') {
          return `<li><input type="checkbox"${item.checked ? ' checked' : ''} disabled /> ${inner}</li>`;
        }
        return `<li>${inner}</li>`;
      }).join('');
      return `<${tag}>${items}</${tag}>`;
    }
    case 'code':
      return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
    case 'mermaid':
      return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
    case 'divider':
      return '<hr />';
    case 'table':
      return tableToHtml(block);
    case 'image':
      return `<figure><img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt ?? '')}" style="max-width:100%;" />${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ''}</figure>`;
    case 'base':
      return '';
    default:
      return '';
  }
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

export function wrapHtmlDocument(body: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; color: #1f2329; line-height: 1.6; padding: 24px; max-width: 860px; margin: 0 auto; }
    h1,h2,h3,h4,h5,h6 { margin: 1.2em 0 0.5em; }
    p { margin: 0.5em 0; }
    pre { background: #f5f6f7; padding: 12px; border-radius: 6px; overflow: auto; }
    blockquote { border-left: 3px solid #dee0e3; margin: 0.8em 0; padding-left: 12px; color: #646a73; }
    table { margin: 12px 0; }
    img { max-width: 100%; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${body}
</body>
</html>`;
}

export function wrapHtmlForWord(body: string, title: string): string {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${body}
</body>
</html>`;
}

export function sanitizeFileName(name: string, fallback = '文档'): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').trim() || fallback;
}

/** 触发浏览器下载 Blob */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** 在新窗口中打开打印（用于 PDF 导出） */
export function printHtmlDocument(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    document.body.removeChild(iframe);
    throw new Error('无法创建打印窗口');
  }
  doc.open();
  doc.write(html);
  doc.close();
  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();
  window.setTimeout(() => {
    document.body.removeChild(iframe);
  }, 1000);
}

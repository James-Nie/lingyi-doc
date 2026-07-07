import type { DocBlock, ListItem, ListType, TextMark } from './types';
import {
  createEmptyParagraph,
  createEmptyTableCell,
  fitTableColumnWidths,
  genBlockId,
  DOC_TABLE_DEFAULT_ROW_HEIGHT,
} from './utils';

type MarkAttrs = Partial<Pick<TextMark, 'type' | 'value'>>;

const BLOCK_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'div', 'ul', 'ol', 'blockquote', 'pre', 'table', 'hr', 'img',
]);

function makeCodeBlock(text: string): DocBlock {
  const lines = text.split('\n').length;
  const autoHeight = Math.max(120, Math.min(480, lines * 22 + 48));
  return {
    type: 'code',
    id: genBlockId(),
    text,
    collapsed: false,
    height: autoHeight,
    wordWrap: false,
  };
}

function normalizeFontSize(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (v.endsWith('px')) return v;
  const ptMatch = v.match(/^([0-9.]+)pt$/);
  if (ptMatch) {
    const pt = parseFloat(ptMatch[1]);
    if (Number.isFinite(pt)) return `${Math.round(pt * 96 / 72)}px`;
  }
  const emMatch = v.match(/^([0-9.]+)em$/);
  if (emMatch) {
    const em = parseFloat(emMatch[1]);
    if (Number.isFinite(em)) return `${Math.round(em * 16)}px`;
  }
  return raw;
}

function extractInlineContent(root: Node): { text: string; marks: TextMark[] } {
  let text = '';
  const marks: TextMark[] = [];

  const walk = (node: Node, active: MarkAttrs[]) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const chunk = (node.textContent ?? '').replace(/\u00a0/g, ' ');
      if (!chunk) return;
      const start = text.length;
      text += chunk;
      const end = text.length;
      for (const mark of active) {
        marks.push({ type: mark.type!, start, end, value: mark.value });
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === 'br') {
      text += '\n';
      return;
    }

    const next = [...active];
    switch (tag) {
      case 'strong':
      case 'b':
        next.push({ type: 'bold' });
        break;
      case 'em':
      case 'i':
        next.push({ type: 'italic' });
        break;
      case 'u':
        next.push({ type: 'underline' });
        break;
      case 's':
      case 'strike':
      case 'del':
        next.push({ type: 'strikethrough' });
        break;
      case 'a':
        next.push({ type: 'link', value: el.getAttribute('href') ?? '' });
        break;
      case 'span': {
        const style = el.getAttribute('style') ?? '';
        const color = style.match(/(?:^|;)\s*color:\s*([^;]+)/i)?.[1]?.trim();
        const bg = style.match(/background(?:-color)?:\s*([^;]+)/i)?.[1]?.trim();
        const fontSize = style.match(/(?:^|;)\s*font-size:\s*([^;]+)/i)?.[1]?.trim();
        if (color) next.push({ type: 'color', value: color });
        if (bg) next.push({ type: 'background', value: bg });
        if (fontSize) next.push({ type: 'fontSize', value: normalizeFontSize(fontSize) });
        break;
      }
      default:
        break;
    }

    for (const child of el.childNodes) walk(child, next);
  };

  walk(root, []);
  return { text: text.replace(/\n+$/, ''), marks };
}

function makeHeading(level: 1 | 2 | 3 | 4, el: HTMLElement): DocBlock {
  const { text, marks } = extractInlineContent(el);
  return { type: 'heading', id: genBlockId(), level, text, marks };
}

function makeParagraph(el: HTMLElement): DocBlock {
  const { text, marks } = extractInlineContent(el);
  return { ...createEmptyParagraph(), text, marks };
}

function parseImgElement(el: HTMLElement): DocBlock {
  const widthAttr = el.getAttribute('width') ?? el.style.width;
  const width = widthAttr ? parseInt(String(widthAttr).replace(/px/i, ''), 10) : undefined;
  return {
    type: 'image',
    id: genBlockId(),
    url: el.getAttribute('src') ?? '',
    alt: el.getAttribute('alt') ?? undefined,
    width: Number.isFinite(width) && width! > 0 ? width : 480,
    align: 'center',
  };
}

function blocksFromParagraph(el: HTMLElement): DocBlock[] {
  const blocks: DocBlock[] = [];
  let inlineRoot: HTMLElement | null = null;

  const flushInline = () => {
    if (!inlineRoot) return;
    const { text, marks } = extractInlineContent(inlineRoot);
    if (text.trim() || marks.length) {
      blocks.push({ ...createEmptyParagraph(), text, marks, ...parseBlockLayout(el) });
    }
    inlineRoot = null;
  };

  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as HTMLElement;
      const tag = child.tagName.toLowerCase();
      if (tag === 'img') {
        flushInline();
        blocks.push(parseImgElement(child));
        continue;
      }
    }
    if (!inlineRoot) {
      inlineRoot = document.createElement('div');
    }
    inlineRoot!.appendChild(node.cloneNode(true));
  }

  flushInline();
  if (!blocks.length) {
    blocks.push({ ...makeParagraph(el), ...parseBlockLayout(el) });
  } else if (blocks.length === 1 && blocks[0].type === 'paragraph') {
    Object.assign(blocks[0], parseBlockLayout(el));
  } else {
    const layout = parseBlockLayout(el);
    for (const block of blocks) {
      if (block.type === 'paragraph' || block.type === 'heading' || block.type === 'quote') {
        Object.assign(block, layout);
      }
    }
  }
  return blocks;
}

function parseBlockLayout(el: HTMLElement): {
  align?: 'left' | 'center' | 'right';
  indentLevel?: number;
  firstLineIndent?: boolean;
} {
  const style = el.getAttribute('style') ?? '';
  const layout: {
    align?: 'left' | 'center' | 'right';
    indentLevel?: number;
    firstLineIndent?: boolean;
  } = {};

  const alignMatch = style.match(/text-align:\s*(left|center|right|justify)/i);
  if (alignMatch) {
    const a = alignMatch[1].toLowerCase();
    if (a === 'center' || a === 'right' || a === 'left') layout.align = a;
  }

  const marginLeft = style.match(/margin-left:\s*([0-9.]+)(pt|px|cm|em)/i);
  if (marginLeft) {
    const value = parseFloat(marginLeft[1]);
    const unit = marginLeft[2].toLowerCase();
    let px = value;
    if (unit === 'pt') px = value * 1.333;
    else if (unit === 'cm') px = value * 37.8;
    else if (unit === 'em') px = value * 16;
    layout.indentLevel = Math.max(0, Math.min(8, Math.round(px / 24)));
  }

  const textIndent = style.match(/text-indent:\s*([0-9.]+)(pt|px|cm|em)/i);
  if (textIndent && parseFloat(textIndent[1]) > 0) {
    layout.firstLineIndent = true;
  }

  return layout;
}

function makeQuote(el: HTMLElement): DocBlock {
  const { text, marks } = extractInlineContent(el);
  return { type: 'quote', id: genBlockId(), text, marks };
}

function listTypeForTag(tag: string): ListType {
  return tag === 'ol' ? 'ordered' : 'bullet';
}

function parseListItems(listEl: HTMLElement, level = 1): ListItem[] {
  const items: ListItem[] = [];
  for (const child of listEl.children) {
    if (child.tagName.toLowerCase() !== 'li') continue;
    const li = child as HTMLLIElement;
    const clone = li.cloneNode(true) as HTMLLIElement;
    for (const nested of clone.querySelectorAll('ul, ol')) nested.remove();
    const { text, marks } = extractInlineContent(clone);
    items.push({ text, marks, level });

    for (const nested of li.children) {
      const nestedTag = nested.tagName.toLowerCase();
      if (nestedTag === 'ul' || nestedTag === 'ol') {
        items.push(...parseListItems(nested as HTMLElement, level + 1));
      }
    }
  }
  return items;
}

function makeList(el: HTMLElement): DocBlock {
  const listType = listTypeForTag(el.tagName.toLowerCase());
  const items = parseListItems(el);
  return { type: 'list', id: genBlockId(), listType, items };
}

function makeTable(table: HTMLTableElement): DocBlock {
  const rowEls = Array.from(table.rows);
  const rows = Math.max(rowEls.length, 1);
  const cols = Math.max(...rowEls.map(r => r.cells.length), 1);
  const cells = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      const cellEl = rowEls[r]?.cells[c];
      if (!cellEl) return createEmptyTableCell();
      const { text, marks } = extractInlineContent(cellEl);
      const cell: ReturnType<typeof createEmptyTableCell> = { ...createEmptyTableCell(), text, marks };
      const alignStyle = cellEl.getAttribute('style') ?? '';
      const alignMatch = alignStyle.match(/text-align:\s*(left|center|right)/i);
      if (alignMatch) {
        const a = alignMatch[1].toLowerCase();
        if (a === 'center' || a === 'right' || a === 'left') cell.align = a;
      }
      return cell;
    }),
  );
  return {
    type: 'table',
    id: genBlockId(),
    rows,
    cols,
    cells,
    columnWidths: fitTableColumnWidths(cols),
    rowHeights: Array.from({ length: rows }, () => DOC_TABLE_DEFAULT_ROW_HEIGHT),
  };
}

function isBlockElement(el: HTMLElement): boolean {
  return BLOCK_TAGS.has(el.tagName.toLowerCase());
}

function appendBlock(blocks: DocBlock[], block: DocBlock | null): void {
  if (!block) return;
  if (block.type === 'paragraph' && !block.text.trim() && !block.marks.length) return;
  blocks.push(block);
}

function blockFromElement(el: HTMLElement): DocBlock | null {
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case 'h1':
      return makeHeading(1, el);
    case 'h2':
      return makeHeading(2, el);
    case 'h3':
      return makeHeading(3, el);
    case 'h4':
    case 'h5':
    case 'h6':
      return makeHeading(4, el);
    case 'p':
      return null;
    case 'blockquote':
      return makeQuote(el);
    case 'ul':
    case 'ol':
      return makeList(el);
    case 'pre':
      return makeCodeBlock(el.textContent ?? '');
    case 'table':
      return makeTable(el as HTMLTableElement);
    case 'hr':
      return { type: 'divider', id: genBlockId() };
    case 'img':
      return parseImgElement(el);
    case 'div': {
      const children = Array.from(el.children).filter(c => c.nodeType === Node.ELEMENT_NODE) as HTMLElement[];
      if (children.length === 0) return makeParagraph(el);
      return null;
    }
    default:
      return makeParagraph(el);
  }
}

function walkContainer(container: ParentNode, blocks: DocBlock[]): void {
  for (const node of container.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? '').replace(/\u00a0/g, ' ').trim();
      if (text) appendBlock(blocks, { ...createEmptyParagraph(), text, marks: [] });
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    const el = node as HTMLElement;
    if (el.tagName.toLowerCase() === 'div' && Array.from(el.children).some(c => isBlockElement(c as HTMLElement))) {
      walkContainer(el, blocks);
      continue;
    }

    const block = blockFromElement(el);
    if (block) {
      appendBlock(blocks, block);
      continue;
    }

    if (el.tagName.toLowerCase() === 'p') {
      for (const part of blocksFromParagraph(el)) appendBlock(blocks, part);
      continue;
    }

    walkContainer(el, blocks);
  }
}

/** 将 HTML 解析为 DocBlock 数组（用于 docx 等导入） */
export function parseHtmlToBlocks(html: string): DocBlock[] {
  if (typeof DOMParser === 'undefined') {
    throw new Error('当前环境不支持 HTML 解析');
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks: DocBlock[] = [];
  walkContainer(doc.body, blocks);
  return blocks.length ? blocks : [createEmptyParagraph()];
}

import type { DocBlock, TextMark } from '../../doc/types';
import { genBlockId } from '../../doc/utils';
import { parseNumPr, type NumPrInfo } from './docxNumbering';
import {
  bytesToBase64,
  elementsByLocalName,
  emuToPx,
  firstByLocalName,
  guessMime,
  parseRelationships,
  readZipBytes,
  readZipText,
  resolveDocxPath,
} from './docxZip';

type JSZip = import('jszip');

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

type MarkAttrs = Partial<Pick<TextMark, 'type' | 'value'>>;

export type ParagraphLayout = {
  align?: 'left' | 'center' | 'right';
  indentLevel?: number;
  firstLineIndent?: boolean;
};

export type DocxBodySegment =
  | {
    kind: 'paragraph';
    extraBlocks?: DocBlock[];
    layout?: ParagraphLayout;
    inline?: { text: string; marks: TextMark[] };
    numInfo?: NumPrInfo;
    pStyle?: string;
  }
  | { kind: 'table' };

/** 从 w:p 解析段落样式名（Heading1 / Title 等） */
export function parseParagraphStyle(p: Element): string | null {
  const pPr = firstByLocalName(p, 'pPr');
  const pStyleEl = pPr ? firstByLocalName(pPr, 'pStyle') : null;
  return pStyleEl ? wAttr(pStyleEl, 'val') : null;
}

function wAttr(el: Element, localName: string): string | null {
  return el.getAttributeNS(W_NS, localName) ?? el.getAttribute(`w:${localName}`) ?? el.getAttribute(localName);
}

function twipsToIndentLevel(twips: number): number {
  return Math.max(0, Math.min(8, Math.round(twips / 360)));
}

function halfPointsToPx(halfPts: number): string {
  const pt = halfPts / 2;
  return `${Math.round(pt * 96 / 72)}px`;
}

function wordColorToCss(val: string): string {
  if (!val || val === 'auto') return '';
  const hex = val.replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex}`;
  return val;
}

const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: '#ffff00',
  green: '#00ff00',
  cyan: '#00ffff',
  turquoise: '#00ffff',
  magenta: '#ff00ff',
  blue: '#0000ff',
  red: '#ff0000',
  darkBlue: '#000080',
  darkCyan: '#008080',
  darkGreen: '#008000',
  darkMagenta: '#800080',
  darkRed: '#800000',
  darkYellow: '#808000',
  darkGray: '#808080',
  lightGray: '#c0c0c0',
  black: '#000000',
  white: '#ffffff',
};

function isWordToggleOn(el: Element | null): boolean {
  if (!el) return false;
  const val = wAttr(el, 'val');
  if (val === '0' || val === 'false') return false;
  return true;
}

function isUnderlineOn(el: Element | null): boolean {
  if (!el) return false;
  const val = wAttr(el, 'val');
  if (!val || val === 'none') return false;
  return true;
}

function parseRunMarks(rPr: Element | null): MarkAttrs[] {
  const marks: MarkAttrs[] = [];
  if (!rPr) return marks;
  if (isWordToggleOn(firstByLocalName(rPr, 'b'))) marks.push({ type: 'bold' });
  if (isWordToggleOn(firstByLocalName(rPr, 'i'))) marks.push({ type: 'italic' });
  if (isUnderlineOn(firstByLocalName(rPr, 'u'))) marks.push({ type: 'underline' });
  if (isWordToggleOn(firstByLocalName(rPr, 'strike')) || isWordToggleOn(firstByLocalName(rPr, 'dstrike'))) {
    marks.push({ type: 'strikethrough' });
  }

  const sz = firstByLocalName(rPr, 'sz');
  const szVal = sz ? wAttr(sz, 'val') : null;
  if (szVal) {
    const half = parseInt(szVal, 10);
    if (half > 0) marks.push({ type: 'fontSize', value: halfPointsToPx(half) });
  }

  const color = firstByLocalName(rPr, 'color');
  const colorVal = color ? wAttr(color, 'val') : null;
  if (colorVal) {
    const css = wordColorToCss(colorVal);
    if (css) marks.push({ type: 'color', value: css });
  }

  const highlight = firstByLocalName(rPr, 'highlight');
  const hlVal = highlight ? wAttr(highlight, 'val') : null;
  if (hlVal && hlVal !== 'none') {
    marks.push({ type: 'background', value: HIGHLIGHT_COLORS[hlVal] ?? hlVal });
  }

  return marks;
}

/** 从 w:p 解析段落对齐与缩进 */
export function parseParagraphLayout(p: Element): ParagraphLayout {
  const layout: ParagraphLayout = {};
  const pPr = firstByLocalName(p, 'pPr');
  if (!pPr) return layout;

  const jc = firstByLocalName(pPr, 'jc');
  const jcVal = jc ? wAttr(jc, 'val') : null;
  if (jcVal === 'center') layout.align = 'center';
  else if (jcVal === 'right' || jcVal === 'end') layout.align = 'right';
  else if (jcVal === 'left' || jcVal === 'start') layout.align = 'left';

  const ind = firstByLocalName(pPr, 'ind');
  if (ind) {
    const left = ind ? wAttr(ind, 'left') : null;
    if (left) {
      const twips = parseInt(left, 10);
      if (Number.isFinite(twips)) layout.indentLevel = twipsToIndentLevel(twips);
    }
    const firstLine = wAttr(ind, 'firstLine');
    const firstLineChars = wAttr(ind, 'firstLineChars');
    if (firstLine && parseInt(firstLine, 10) > 0) layout.firstLineIndent = true;
    if (firstLineChars && parseInt(firstLineChars, 10) > 0) layout.firstLineIndent = true;
  }

  return layout;
}

/** 从 w:p 解析行内文字与格式（字号、颜色等） */
export function parseParagraphInline(p: Element): { text: string; marks: TextMark[] } {
  let text = '';
  const marks: TextMark[] = [];

  const appendText = (chunk: string, runMarks: MarkAttrs[]) => {
    if (!chunk) return;
    const start = text.length;
    text += chunk;
    const end = text.length;
    for (const m of runMarks) {
      marks.push({ type: m.type!, start, end, value: m.value });
    }
  };

  const processRun = (r: Element) => {
    const runMarks = parseRunMarks(firstByLocalName(r, 'rPr'));
    for (const sub of Array.from(r.children)) {
      const tag = sub.localName;
      if (tag === 't') appendText(sub.textContent ?? '', runMarks);
      else if (tag === 'tab') appendText('\t', runMarks);
      else if (tag === 'br') appendText('\n', runMarks);
    }
  };

  const walkInline = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const tag = child.localName;
      if (tag === 'r') processRun(child);
      else if (tag === 'hyperlink') walkInline(child);
    }
  };

  walkInline(p);
  return { text: text.replace(/\n+$/, ''), marks };
}

async function loadImageDataUri(
  zip: JSZip,
  rels: Map<string, string>,
  relId: string,
): Promise<string | null> {
  const target = rels.get(relId);
  if (!target) return null;
  const path = resolveDocxPath('word', target);
  const bytes = await readZipBytes(zip, path);
  if (!bytes?.length) return null;
  const mime = guessMime(path);
  if (mime === 'image/emf' || mime === 'image/wmf') return null;
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

function drawingExtentPx(drawingRoot: Element): number | undefined {
  const extent = firstByLocalName(drawingRoot, 'extent');
  if (!extent) return undefined;
  return emuToPx(extent.getAttribute('cx'));
}

function findFallbackImageRelId(root: Element): string | null {
  for (const imagedata of elementsByLocalName(root, 'imagedata')) {
    const rid = imagedata.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
      ?? imagedata.getAttribute('r:id');
    if (rid) return rid;
  }
  return null;
}

function findBlipEmbedId(root: Element): string | null {
  for (const blip of elementsByLocalName(root, 'blip')) {
    const embed = blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed')
      ?? blip.getAttribute('r:embed');
    if (embed) return embed;
  }
  return null;
}

function makeImageBlock(src: string, width?: number, alt?: string): DocBlock {
  return {
    type: 'image',
    id: genBlockId(),
    url: src,
    alt,
    width: width ?? 480,
    align: 'center',
  };
}

function findImageRelId(root: Element): string | null {
  return findBlipEmbedId(root) ?? findFallbackImageRelId(root);
}

/** 提取图表预览图或旧版 VML 图片；图表以图片形式保留，不转为表格 */
async function extractChartOrLegacyImageBlock(
  zip: JSZip,
  rels: Map<string, string>,
  drawingRoot: Element,
): Promise<DocBlock | null> {
  const width = drawingExtentPx(drawingRoot);

  const blipId = findBlipEmbedId(drawingRoot);
  if (blipId) {
    const src = await loadImageDataUri(zip, rels, blipId);
    if (src) return makeImageBlock(src, width, '图表');
  }

  const fallbackId = findFallbackImageRelId(drawingRoot);
  if (fallbackId) {
    const src = await loadImageDataUri(zip, rels, fallbackId);
    if (src) return makeImageBlock(src, width, '图片');
  }

  return null;
}

async function extractParagraphExtraBlocks(
  zip: JSZip,
  rels: Map<string, string>,
  paragraph: Element,
): Promise<DocBlock[]> {
  const blocks: DocBlock[] = [];
  const seenRelIds = new Set<string>();
  const seenUrls = new Set<string>();

  const tryAdd = async (root: Element) => {
    const relId = findImageRelId(root);
    if (relId && seenRelIds.has(relId)) return;
    const block = await extractChartOrLegacyImageBlock(zip, rels, root);
    if (!block || block.type !== 'image') return;
    if (seenUrls.has(block.url)) return;
    if (relId) seenRelIds.add(relId);
    seenUrls.add(block.url);
    blocks.push(block);
  };

  for (const drawing of elementsByLocalName(paragraph, 'drawing')) {
    await tryAdd(drawing);
  }
  for (const pict of elementsByLocalName(paragraph, 'pict')) {
    await tryAdd(pict);
  }
  return blocks;
}

function paragraphHasInlineImage(paragraph: Element): boolean {
  for (const drawing of elementsByLocalName(paragraph, 'drawing')) {
    if (elementsByLocalName(drawing, 'blip').length > 0) return true;
  }
  return false;
}

/** 解析 docx 正文结构，并提取 mammoth 无法处理的图表/绘图 */
export async function parseDocxBodySegments(arrayBuffer: ArrayBuffer): Promise<DocxBodySegment[]> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(arrayBuffer);
  const documentXml = await readZipText(zip, 'word/document.xml');
  const relsXml = await readZipText(zip, 'word/_rels/document.xml.rels');
  if (!documentXml) return [];

  const rels = relsXml ? parseRelationships(relsXml) : new Map<string, string>();
  const doc = new DOMParser().parseFromString(documentXml, 'text/xml');
  const body = firstByLocalName(doc, 'body');
  if (!body) return [];

  const segments: DocxBodySegment[] = [];

  for (const child of Array.from(body.children)) {
    const tag = child.localName;
    if (tag === 'p') {
      const inline = parseParagraphInline(child);
      const layout = parseParagraphLayout(child);
      const numInfo = parseNumPr(child) ?? undefined;
      const pStyle = parseParagraphStyle(child) ?? undefined;
      const extraBlocks = await extractParagraphExtraBlocks(zip, rels, child);
      const hasImage = paragraphHasInlineImage(child);
      const isEmpty = !inline.text.trim() && !extraBlocks.length && !hasImage;
      if (isEmpty) continue;

      segments.push({
        kind: 'paragraph',
        extraBlocks: extraBlocks.length ? extraBlocks : undefined,
        layout,
        inline,
        numInfo,
        pStyle,
      });
    } else if (tag === 'tbl') {
      segments.push({ kind: 'table' });
    }
  }

  return segments;
}

function applyParagraphLayout(block: DocBlock, layout: ParagraphLayout): void {
  if (block.type === 'paragraph' || block.type === 'heading') {
    if (layout.align) block.align = layout.align;
    if (layout.indentLevel !== undefined) block.indentLevel = layout.indentLevel;
    if (layout.firstLineIndent) block.firstLineIndent = layout.firstLineIndent;
  } else if (block.type === 'quote') {
    if (layout.indentLevel !== undefined) block.indentLevel = layout.indentLevel;
    if (layout.firstLineIndent) block.firstLineIndent = layout.firstLineIndent;
  } else if (block.type === 'list' && layout.align) {
    block.items = block.items.map(item => ({ ...item, align: layout.align }));
  }
}

function isDuplicateImage(block: DocBlock, seenUrls: Set<string>): boolean {
  return block.type === 'image' && seenUrls.has(block.url);
}

function trackImage(block: DocBlock, seenUrls: Set<string>): void {
  if (block.type === 'image') seenUrls.add(block.url);
}

function pushBlock(out: DocBlock[], block: DocBlock, seenUrls: Set<string>): void {
  if (isDuplicateImage(block, seenUrls)) return;
  trackImage(block, seenUrls);
  out.push(block);
}

function normalizeCompareText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

const XML_ENHANCED_MARK_TYPES = new Set<TextMark['type']>(['color', 'fontSize', 'background']);

function mergeXmlVisualMarks(block: DocBlock, inline: { text: string; marks: TextMark[] }): void {
  if (block.type !== 'paragraph' && block.type !== 'heading') return;

  const xmlVisual = inline.marks.filter(m => XML_ENHANCED_MARK_TYPES.has(m.type));
  if (!xmlVisual.length) return;

  const preserved = block.marks.filter(m => !XML_ENHANCED_MARK_TYPES.has(m.type));
  block.marks = [...preserved, ...xmlVisual];
}

function applyXmlInlineToBlock(block: DocBlock, inline: { text: string; marks: TextMark[] }): void {
  if (block.type !== 'paragraph' && block.type !== 'heading') return;

  const xmlText = inline.text;
  const mammothText = block.text;
  const xmlNorm = normalizeCompareText(xmlText);
  const mammothNorm = normalizeCompareText(mammothText);

  if (!xmlNorm && !inline.marks.length) return;

  if (xmlNorm && !mammothNorm) {
    block.text = xmlText;
  }

  mergeXmlVisualMarks(block, inline);
}

function consumeParagraphMammothBlocks(mammothBlocks: DocBlock[], mIdx: number): { blocks: DocBlock[]; nextIdx: number } {
  const blocks: DocBlock[] = [];
  if (mIdx >= mammothBlocks.length) return { blocks, nextIdx: mIdx };

  const first = mammothBlocks[mIdx];
  if (first.type === 'table') return { blocks, nextIdx: mIdx };

  blocks.push(mammothBlocks[mIdx++]);

  while (mIdx < mammothBlocks.length && mammothBlocks[mIdx].type === 'image') {
    blocks.push(mammothBlocks[mIdx++]);
  }

  return { blocks, nextIdx: mIdx };
}

/** 按 docx 正文顺序合并 mammoth 块与图表块 */
export function mergeDocxBlocks(mammothBlocks: DocBlock[], segments: DocxBodySegment[]): DocBlock[] {
  if (!segments.length) return mammothBlocks;

  const out: DocBlock[] = [];
  const seenImageUrls = new Set<string>();
  let mIdx = 0;

  for (const seg of segments) {
    if (seg.kind === 'table') {
      while (mIdx < mammothBlocks.length && mammothBlocks[mIdx].type !== 'table') {
        const pending = mammothBlocks[mIdx];
        if (pending.type === 'image') {
          mIdx++;
          continue;
        }
        pushBlock(out, mammothBlocks[mIdx++], seenImageUrls);
      }
      if (mIdx < mammothBlocks.length && mammothBlocks[mIdx].type === 'table') {
        pushBlock(out, mammothBlocks[mIdx++], seenImageUrls);
      }
      continue;
    }

    const { blocks: consumed, nextIdx } = consumeParagraphMammothBlocks(mammothBlocks, mIdx);
    mIdx = nextIdx;

    for (const block of consumed) {
      const isEmptyParagraph = block.type === 'paragraph' && !block.text.trim() && !block.marks.length;
      const hasImage = consumed.some(b => b.type === 'image') || !!seg.extraBlocks?.some(b => b.type === 'image');
      if (isEmptyParagraph && hasImage) continue;
      if (seg.layout) applyParagraphLayout(block, seg.layout);
      if (seg.inline) applyXmlInlineToBlock(block, seg.inline);
      pushBlock(out, block, seenImageUrls);
    }

    if (seg.extraBlocks?.length) {
      for (const extra of seg.extraBlocks) {
        pushBlock(out, extra, seenImageUrls);
      }
    }
  }

  while (mIdx < mammothBlocks.length) {
    pushBlock(out, mammothBlocks[mIdx++], seenImageUrls);
  }

  return out.length ? out : mammothBlocks;
}

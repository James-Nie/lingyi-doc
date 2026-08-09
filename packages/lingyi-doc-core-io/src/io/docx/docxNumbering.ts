import type { DocBlock, ListItem, ListType, TextMark } from '@lingyi-doc/core-doc';
import { genBlockId, toChineseNumber } from '@lingyi-doc/core-doc';
import { firstByLocalName, readZipText } from './docxZip';
import type { DocxBodySegment, ParagraphLayout } from './docxStructure';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export interface NumPrInfo {
  numId: number;
  ilvl: number;
}

export interface NumLevelInfo {
  numFmt: string;
  listType: ListType;
}

export type NumberingFormats = Map<number, Map<number, NumLevelInfo>>;

type ParagraphSegment = Extract<DocxBodySegment, { kind: 'paragraph' }>;

type OpenList = {
  numId: number;
  listType: ListType;
  items: ListItem[];
};

function wAttr(el: Element, localName: string): string | null {
  return el.getAttributeNS(W_NS, localName) ?? el.getAttribute(`w:${localName}`) ?? el.getAttribute(localName);
}

/** 从 w:p 解析编号属性 */
export function parseNumPr(p: Element): NumPrInfo | null {
  const pPr = firstByLocalName(p, 'pPr');
  const numPr = pPr ? firstByLocalName(pPr, 'numPr') : null;
  if (!numPr) return null;

  const numIdEl = firstByLocalName(numPr, 'numId');
  const numIdRaw = numIdEl ? wAttr(numIdEl, 'val') : null;
  if (!numIdRaw) return null;

  const numId = parseInt(numIdRaw, 10);
  if (!Number.isFinite(numId)) return null;

  const ilvlEl = firstByLocalName(numPr, 'ilvl');
  const ilvlRaw = ilvlEl ? wAttr(ilvlEl, 'val') : null;
  const ilvl = parseInt(ilvlRaw ?? '0', 10);
  return { numId, ilvl: Number.isFinite(ilvl) ? ilvl : 0 };
}

function numFmtToListType(numFmt: string): ListType {
  return numFmt === 'bullet' ? 'bullet' : 'ordered';
}

export async function loadNumberingFormats(zip: import('jszip')): Promise<NumberingFormats> {
  const xml = await readZipText(zip, 'word/numbering.xml');
  const result: NumberingFormats = new Map();
  if (!xml) return result;

  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const numIdToAbstract = new Map<number, number>();

  for (const num of Array.from(doc.getElementsByTagName('*')).filter(el => el.localName === 'num')) {
    const numId = parseInt(wAttr(num, 'numId') ?? '', 10);
    const abstractNumEl = firstByLocalName(num, 'abstractNumId');
    const abstractId = abstractNumEl ? parseInt(wAttr(abstractNumEl, 'val') ?? '', 10) : NaN;
    if (Number.isFinite(numId) && Number.isFinite(abstractId)) {
      numIdToAbstract.set(numId, abstractId);
    }
  }

  const abstractFormats = new Map<number, Map<number, NumLevelInfo>>();
  for (const abs of Array.from(doc.getElementsByTagName('*')).filter(el => el.localName === 'abstractNum')) {
    const abstractId = parseInt(wAttr(abs, 'abstractNumId') ?? '', 10);
    if (!Number.isFinite(abstractId)) continue;

    const levelMap = new Map<number, NumLevelInfo>();
    for (const lvl of Array.from(abs.children).filter(el => el.localName === 'lvl')) {
      const ilvl = parseInt(wAttr(lvl, 'ilvl') ?? '0', 10);
      const numFmtEl = firstByLocalName(lvl, 'numFmt');
      const numFmt = numFmtEl ? (wAttr(numFmtEl, 'val') ?? 'decimal') : 'decimal';
      levelMap.set(ilvl, { numFmt, listType: numFmtToListType(numFmt) });
    }
    abstractFormats.set(abstractId, levelMap);
  }

  for (const [numId, abstractId] of numIdToAbstract) {
    result.set(numId, abstractFormats.get(abstractId) ?? new Map());
  }

  return result;
}

export function getNumLevelInfo(
  numFormats: NumberingFormats,
  numInfo: NumPrInfo,
): NumLevelInfo {
  const fmt = numFormats.get(numInfo.numId)?.get(numInfo.ilvl);
  return fmt ?? { numFmt: 'decimal', listType: 'ordered' };
}

/** @deprecated 使用 getNumLevelInfo */
export function getListTypeForNum(numFormats: NumberingFormats, numInfo: NumPrInfo): ListType {
  return getNumLevelInfo(numFormats, numInfo).listType;
}

const CHINESE_SECTION_RE = /^[一二三四五六七八九十百千]+、/;
const TIMELINE_RE = /^\d+\s*点\s*\d+\s*分\s*[：:]/;
const KEY_INFO_RE = /^(影响范围|处置时长|处置过程|整体处置过程)[：:]?/;

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function hasBoldMark(marks: TextMark[]): boolean {
  return marks.some(m => m.type === 'bold');
}

function maxFontSizePx(marks: TextMark[]): number {
  let max = 0;
  for (const m of marks) {
    if (m.type !== 'fontSize' || !m.value) continue;
    const px = parseInt(m.value, 10);
    if (Number.isFinite(px)) max = Math.max(max, px);
  }
  return max;
}

function headingLevelFromStyle(pStyle: string | undefined): 1 | 2 | 3 | 4 | null {
  if (!pStyle) return null;
  const lower = pStyle.toLowerCase();
  if (lower.includes('title') || lower.includes('标题')) return 1;
  const m = lower.match(/heading\s*(\d)/);
  if (m) return Math.min(4, Math.max(1, parseInt(m[1], 10))) as 1 | 2 | 3 | 4;
  if (lower.includes('heading1') || lower.includes('标题1')) return 1;
  if (lower.includes('heading2') || lower.includes('标题2')) return 2;
  if (lower.includes('heading3') || lower.includes('标题3')) return 3;
  if (lower.includes('heading4') || lower.includes('标题4')) return 4;
  return null;
}

type ClassifiedKind = 'heading' | 'paragraph' | 'list-item';

function classifySegment(
  seg: ParagraphSegment,
  levelInfo: NumLevelInfo,
): ClassifiedKind {
  const text = normalizeText(seg.inline?.text ?? '');
  const marks = seg.inline?.marks ?? [];

  const styleLevel = headingLevelFromStyle(seg.pStyle);
  if (styleLevel != null) return 'heading';

  if (seg.layout?.align === 'center' && (hasBoldMark(marks) || maxFontSizePx(marks) >= 20)) {
    return 'heading';
  }

  if (
    (levelInfo.numFmt === 'chineseCounting' || levelInfo.numFmt === 'chineseCountingThousand')
    && seg.numInfo!.ilvl === 0
  ) {
    return 'heading';
  }

  if (CHINESE_SECTION_RE.test(text)) return 'heading';
  if (TIMELINE_RE.test(text)) return 'paragraph';
  if (KEY_INFO_RE.test(text)) return 'paragraph';

  return 'list-item';
}

function headingLevelForSegment(seg: ParagraphSegment, levelInfo: NumLevelInfo): 1 | 2 | 3 | 4 {
  const styleLevel = headingLevelFromStyle(seg.pStyle);
  if (styleLevel != null) return styleLevel;
  if (seg.layout?.align === 'center') return 1;
  if (levelInfo.numFmt === 'chineseCounting' || levelInfo.numFmt === 'chineseCountingThousand') return 2;
  if (seg.numInfo!.ilvl === 0) return 2;
  if (seg.numInfo!.ilvl === 1) return 3;
  return 4;
}

function applyLayout(block: DocBlock, layout: ParagraphLayout | undefined): void {
  if (!layout) return;
  if (block.type === 'paragraph' || block.type === 'heading') {
    if (layout.align) block.align = layout.align;
    if (layout.indentLevel !== undefined) block.indentLevel = layout.indentLevel;
    if (layout.firstLineIndent) block.firstLineIndent = layout.firstLineIndent;
  }
}

function makeTextBlock(
  kind: 'heading' | 'paragraph',
  seg: ParagraphSegment,
  level?: 1 | 2 | 3 | 4,
  prefix?: string,
): DocBlock {
  const text = seg.inline?.text ?? '';
  const marks = seg.inline?.marks ?? [];
  const fullText = prefix ? prefix + text : text;
  const prefixLen = prefix?.length ?? 0;
  const adjustedMarks = prefixLen > 0
    ? marks.map(m => ({ ...m, start: m.start + prefixLen, end: m.end + prefixLen }))
    : marks;

  const block: DocBlock = kind === 'heading'
    ? { type: 'heading', id: genBlockId(), level: level ?? 2, text: fullText, marks: adjustedMarks }
    : { type: 'paragraph', id: genBlockId(), text: fullText, marks: adjustedMarks };

  applyLayout(block, seg.layout);
  return block;
}

type CounterKey = string;

class ListCounter {
  private counters = new Map<CounterKey, number>();

  next(numId: number, ilvl: number): number {
    for (const key of [...this.counters.keys()]) {
      const keyIlvl = parseInt(key.split(':')[1], 10);
      if (keyIlvl > ilvl) this.counters.delete(key);
    }
    const k = `${numId}:${ilvl}`;
    const n = (this.counters.get(k) ?? 0) + 1;
    this.counters.set(k, n);
    return n;
  }

  format(numFmt: string, numId: number, ilvl: number): string {
    const n = this.next(numId, ilvl);
    switch (numFmt) {
      case 'chineseCounting':
      case 'chineseCountingThousand':
        return `${toChineseNumber(n)}、`;
      case 'lowerLetter':
        return `${String.fromCharCode(96 + ((n - 1) % 26) + 1)}. `;
      case 'upperLetter':
        return `${String.fromCharCode(64 + ((n - 1) % 26) + 1)}. `;
      default:
        return `${n}. `;
    }
  }
}

function shouldStartNewList(open: OpenList | null, numInfo: NumPrInfo, listType: ListType): boolean {
  if (!open) return true;
  if (open.numId !== numInfo.numId) return true;
  if (open.listType !== listType) return true;
  return false;
}

function makeListItem(seg: ParagraphSegment, levelInfo: NumLevelInfo): ListItem {
  const layout = seg.layout;
  return {
    text: seg.inline?.text ?? '',
    marks: seg.inline?.marks ?? [],
    level: seg.numInfo!.ilvl + 1,
    align: layout?.align,
    numFmt: levelInfo.numFmt,
  };
}

function flushList(open: OpenList | null, out: DocBlock[]): OpenList | null {
  if (open?.items.length) {
    out.push({ type: 'list', id: genBlockId(), listType: open.listType, items: open.items });
  }
  return null;
}

/** 从 XML segments 重建文档块（列表结构以 XML 为准） */
export function buildBlocksFromSegments(
  segments: DocxBodySegment[],
  numFormats: NumberingFormats,
  mammothBlocks: DocBlock[],
): DocBlock[] {
  if (!segments.length) return mammothBlocks;

  const out: DocBlock[] = [];
  let openList: OpenList | null = null;
  let mIdx = 0;
  const headingCounter = new ListCounter();

  for (const seg of segments) {
    if (seg.kind === 'table') {
      openList = flushList(openList, out);
      while (mIdx < mammothBlocks.length && mammothBlocks[mIdx].type !== 'table') mIdx += 1;
      const table = mIdx < mammothBlocks.length ? mammothBlocks[mIdx++] : null;
      if (table) out.push(table);
      continue;
    }

    if (seg.extraBlocks?.length) {
      openList = flushList(openList, out);
      out.push(...seg.extraBlocks);
    }

    const text = normalizeText(seg.inline?.text ?? '');
    if (!text && !seg.extraBlocks?.length) continue;

    if (!seg.numInfo) {
      openList = flushList(openList, out);
      if (!text) continue;
      const marks = seg.inline?.marks ?? [];
      const styleLevel = headingLevelFromStyle(seg.pStyle);
      if (styleLevel != null) {
        out.push(makeTextBlock('heading', seg, styleLevel));
      } else if (seg.layout?.align === 'center' && (hasBoldMark(marks) || maxFontSizePx(marks) >= 18)) {
        out.push(makeTextBlock('heading', seg, 1));
      } else {
        out.push(makeTextBlock('paragraph', seg));
      }
      continue;
    }

    const levelInfo = getNumLevelInfo(numFormats, seg.numInfo);
    const kind = classifySegment(seg, levelInfo);

    if (kind === 'heading') {
      openList = flushList(openList, out);
      const level = headingLevelForSegment(seg, levelInfo);
      let prefix = '';
      if (
        (levelInfo.numFmt === 'chineseCounting' || levelInfo.numFmt === 'chineseCountingThousand')
        && !CHINESE_SECTION_RE.test(text)
      ) {
        prefix = headingCounter.format(levelInfo.numFmt, seg.numInfo.numId, seg.numInfo.ilvl);
      }
      out.push(makeTextBlock('heading', seg, level, prefix));
      continue;
    }

    if (kind === 'paragraph') {
      openList = flushList(openList, out);
      out.push(makeTextBlock('paragraph', seg));
      continue;
    }

    if (shouldStartNewList(openList, seg.numInfo, levelInfo.listType)) {
      openList = flushList(openList, out);
      openList = { numId: seg.numInfo.numId, listType: levelInfo.listType, items: [] };
    }

    openList!.items.push(makeListItem(seg, levelInfo));
  }

  flushList(openList, out);
  return out.length ? out : mammothBlocks;
}

/** @deprecated 保留兼容；新导入请用 buildBlocksFromSegments */
export function coalesceAdjacentLists(blocks: DocBlock[]): DocBlock[] {
  const out: DocBlock[] = [];
  for (const block of blocks) {
    const prev = out[out.length - 1];
    if (block.type === 'list' && prev?.type === 'list' && prev.listType === block.listType) {
      out[out.length - 1] = { ...prev, items: [...prev.items, ...block.items] };
      continue;
    }
    out.push(block);
  }
  return out;
}

/** @deprecated 保留兼容；新导入请用 buildBlocksFromSegments */
export function postProcessDocxNumbering(
  blocks: DocBlock[],
  segments: DocxBodySegment[],
  numFormats: NumberingFormats,
): DocBlock[] {
  if (!segments.some(s => s.kind === 'paragraph' && s.numInfo)) return coalesceAdjacentLists(blocks);
  return buildBlocksFromSegments(segments, numFormats, blocks);
}

import type { DocBlock, TextMark } from './types';
import { normalizeMarks } from './utils';

/** 当前匹配：橙色；其余匹配：黄色 */
export const DOC_FIND_ACTIVE_BG = '#F5B075';
export const DOC_FIND_MATCH_BG = '#FFF066';

export interface FindHighlightRange {
  start: number;
  end: number;
  active?: boolean;
}

export type FindMatchTarget =
  | { kind: 'title' }
  | { kind: 'block'; blockIndex: number }
  | { kind: 'list'; blockIndex: number; itemIndex: number }
  | { kind: 'table'; blockIndex: number; row: number; col: number }
  | { kind: 'code'; blockIndex: number };

export interface FindMatch {
  target: FindMatchTarget;
  start: number;
  end: number;
}

export interface FindReplaceOptions {
  /** 默认不区分大小写 */
  caseSensitive?: boolean;
}

function collectOffsets(haystack: string, needle: string, caseSensitive: boolean): Array<{ start: number; end: number }> {
  if (!needle) return [];
  const result: Array<{ start: number; end: number }> = [];
  if (caseSensitive) {
    let from = 0;
    while (from <= haystack.length - needle.length) {
      const idx = haystack.indexOf(needle, from);
      if (idx < 0) break;
      result.push({ start: idx, end: idx + needle.length });
      from = idx + Math.max(1, needle.length);
    }
    return result;
  }
  const lowerHay = haystack.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  let from = 0;
  while (from <= lowerHay.length - lowerNeedle.length) {
    const idx = lowerHay.indexOf(lowerNeedle, from);
    if (idx < 0) break;
    result.push({ start: idx, end: idx + needle.length });
    from = idx + Math.max(1, lowerNeedle.length);
  }
  return result;
}

/** 在标题 + 文档块中查找全部匹配（文档顺序） */
export function findInDocument(
  title: string,
  blocks: DocBlock[],
  query: string,
  options?: FindReplaceOptions,
): FindMatch[] {
  const needle = query;
  if (!needle) return [];
  const caseSensitive = !!options?.caseSensitive;
  const matches: FindMatch[] = [];

  for (const offset of collectOffsets(title, needle, caseSensitive)) {
    matches.push({ target: { kind: 'title' }, ...offset });
  }

  blocks.forEach((block, blockIndex) => {
    if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'quote') {
      for (const offset of collectOffsets(block.text, needle, caseSensitive)) {
        matches.push({ target: { kind: 'block', blockIndex }, ...offset });
      }
      return;
    }
    if (block.type === 'code' || block.type === 'mermaid') {
      for (const offset of collectOffsets(block.text, needle, caseSensitive)) {
        matches.push({ target: { kind: 'code', blockIndex }, ...offset });
      }
      return;
    }
    if (block.type === 'list') {
      block.items.forEach((item, itemIndex) => {
        for (const offset of collectOffsets(item.text, needle, caseSensitive)) {
          matches.push({ target: { kind: 'list', blockIndex, itemIndex }, ...offset });
        }
      });
      return;
    }
    if (block.type === 'table') {
      block.cells.forEach((row, rowIndex) => {
        row.forEach((cell, colIndex) => {
          for (const offset of collectOffsets(cell.text, needle, caseSensitive)) {
            matches.push({
              target: { kind: 'table', blockIndex, row: rowIndex, col: colIndex },
              ...offset,
            });
          }
        });
      });
    }
  });

  return matches;
}

/** 按目标聚合高亮区间（供 marksToHtml / 标题渲染） */
export function groupFindHighlights(
  matches: FindMatch[],
  activeIndex: number,
): {
  title: FindHighlightRange[];
  byBlock: Map<number, FindHighlightRange[]>;
  byListItem: Map<string, FindHighlightRange[]>;
  byTableCell: Map<string, FindHighlightRange[]>;
  byCode: Map<number, FindHighlightRange[]>;
} {
  const title: FindHighlightRange[] = [];
  const byBlock = new Map<number, FindHighlightRange[]>();
  const byListItem = new Map<string, FindHighlightRange[]>();
  const byTableCell = new Map<string, FindHighlightRange[]>();
  const byCode = new Map<number, FindHighlightRange[]>();

  matches.forEach((match, i) => {
    const range: FindHighlightRange = {
      start: match.start,
      end: match.end,
      active: i === activeIndex,
    };
    const { target } = match;
    if (target.kind === 'title') {
      title.push(range);
      return;
    }
    if (target.kind === 'block') {
      const list = byBlock.get(target.blockIndex) ?? [];
      list.push(range);
      byBlock.set(target.blockIndex, list);
      return;
    }
    if (target.kind === 'list') {
      const key = `${target.blockIndex}:${target.itemIndex}`;
      const list = byListItem.get(key) ?? [];
      list.push(range);
      byListItem.set(key, list);
      return;
    }
    if (target.kind === 'table') {
      const key = `${target.blockIndex}:${target.row}:${target.col}`;
      const list = byTableCell.get(key) ?? [];
      list.push(range);
      byTableCell.set(key, list);
      return;
    }
    if (target.kind === 'code') {
      const list = byCode.get(target.blockIndex) ?? [];
      list.push(range);
      byCode.set(target.blockIndex, list);
    }
  });

  return { title, byBlock, byListItem, byTableCell, byCode };
}

/** 替换文本区间并同步 marks */
export function replaceTextRange(
  text: string,
  marks: TextMark[],
  start: number,
  end: number,
  replacement: string,
): { text: string; marks: TextMark[] } {
  const lo = Math.max(0, Math.min(start, end, text.length));
  const hi = Math.max(lo, Math.min(Math.max(start, end), text.length));
  const removed = hi - lo;
  const nextText = text.slice(0, lo) + replacement + text.slice(hi);
  const delta = replacement.length - removed;

  const nextMarks = marks
    .filter(m => m.end <= lo || m.start >= hi)
    .map(m => {
      if (m.start >= hi) {
        return { ...m, start: m.start + delta, end: m.end + delta };
      }
      return m;
    });

  return { text: nextText, marks: normalizeMarks(nextMarks, nextText.length) };
}

export function replaceMatchInDocument(
  title: string,
  blocks: DocBlock[],
  match: FindMatch,
  replacement: string,
): { title: string; blocks: DocBlock[] } {
  const { target, start, end } = match;

  if (target.kind === 'title') {
    return {
      title: title.slice(0, start) + replacement + title.slice(end),
      blocks,
    };
  }

  const next = [...blocks];
  const block = next[target.blockIndex];
  if (!block) return { title, blocks };

  if (target.kind === 'block' && (block.type === 'heading' || block.type === 'paragraph' || block.type === 'quote')) {
    const replaced = replaceTextRange(block.text, block.marks, start, end, replacement);
    next[target.blockIndex] = { ...block, text: replaced.text, marks: replaced.marks };
    return { title, blocks: next };
  }

  if (target.kind === 'code' && (block.type === 'code' || block.type === 'mermaid')) {
    next[target.blockIndex] = {
      ...block,
      text: block.text.slice(0, start) + replacement + block.text.slice(end),
    };
    return { title, blocks: next };
  }

  if (target.kind === 'list' && block.type === 'list') {
    const item = block.items[target.itemIndex];
    if (!item) return { title, blocks };
    const replaced = replaceTextRange(item.text, item.marks ?? [], start, end, replacement);
    const items = block.items.map((it, i) =>
      i === target.itemIndex ? { ...it, text: replaced.text, marks: replaced.marks } : it,
    );
    next[target.blockIndex] = { ...block, items };
    return { title, blocks: next };
  }

  if (target.kind === 'table' && block.type === 'table') {
    const cell = block.cells[target.row]?.[target.col];
    if (!cell) return { title, blocks };
    const replaced = replaceTextRange(cell.text, cell.marks ?? [], start, end, replacement);
    const cells = block.cells.map((row, r) =>
      row.map((c, cIdx) =>
        r === target.row && cIdx === target.col
          ? { ...c, text: replaced.text, marks: replaced.marks }
          : c,
      ),
    );
    next[target.blockIndex] = { ...block, cells };
    return { title, blocks: next };
  }

  return { title, blocks };
}

/** 从后往前全部替换，避免偏移失效 */
export function replaceAllInDocument(
  title: string,
  blocks: DocBlock[],
  query: string,
  replacement: string,
  options?: FindReplaceOptions,
): { title: string; blocks: DocBlock[]; count: number } {
  const matches = findInDocument(title, blocks, query, options);
  if (!matches.length) return { title, blocks, count: 0 };

  let nextTitle = title;
  let nextBlocks = blocks;
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const result = replaceMatchInDocument(nextTitle, nextBlocks, matches[i], replacement);
    nextTitle = result.title;
    nextBlocks = result.blocks;
  }
  return { title: nextTitle, blocks: nextBlocks, count: matches.length };
}

/** 将纯文本按查找高亮渲染为 HTML（用于标题等无 marks 场景） */
export function textToFindHighlightHtml(text: string, highlights: FindHighlightRange[]): string {
  if (!text) return '';
  if (!highlights.length) {
    return escapeHtml(text);
  }

  const boundaries = new Set<number>([0, text.length]);
  for (const h of highlights) {
    if (h.start < h.end && h.start >= 0 && h.end <= text.length) {
      boundaries.add(h.start);
      boundaries.add(h.end);
    }
  }
  const points = [...boundaries].sort((a, b) => a - b);
  let html = '';
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    if (start >= end) continue;
    const segment = escapeHtml(text.slice(start, end));
    const hit = highlights.find(h => h.start <= start && h.end >= end);
    if (hit) {
      const bg = hit.active ? DOC_FIND_ACTIVE_BG : DOC_FIND_MATCH_BG;
      html += `<span data-doc-find="${hit.active ? 'active' : 'match'}" style="background:${bg}">${segment}</span>`;
    } else {
      html += segment;
    }
  }
  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

import { useCallback, useEffect, useMemo } from 'react';
import type { DocBlock, FindMatch } from '@lingyi-doc/core-doc';
import {
  findInDocument,
  groupFindHighlights,
  replaceMatchInDocument,
  replaceAllInDocument,
  selectTextOffsetsInEditable,
  computeRichDocumentTextStats,
  getListItemTextEl,
} from '@lingyi-doc/core-doc';

interface FindReplaceDeps {
  readOnly: boolean;
  title: string;
  blocksRef: React.MutableRefObject<DocBlock[]>;
  blockRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  editorRef: React.MutableRefObject<HTMLDivElement | null>;
  showFindReplace: boolean;
  findQuery: string;
  replaceQuery: string;
  findMatches: FindMatch[];
  findMatchIndex: number;
  findMatchIndexRef: React.MutableRefObject<number>;
  setFindMatches: (matches: FindMatch[] | ((prev: FindMatch[]) => FindMatch[])) => void;
  setFindMatchIndex: (idx: number | ((prev: number) => number)) => void;
  setShowFindReplace: (show: boolean) => void;
  setFindReplaceTab: (tab: import('../DocFindReplacePanel').FindReplaceTab) => void;
  onTitleChange?: (title: string) => void;
  onBlocksChange: (blocks: DocBlock[], recordHistory?: boolean) => void;
}

export function useEditorFindReplace(deps: FindReplaceDeps) {
  const {
    readOnly,
    title,
    blocksRef,
    blockRefs,
    editorRef,
    showFindReplace,
    findQuery,
    replaceQuery,
    findMatches,
    findMatchIndex,
    findMatchIndexRef,
    setFindMatches,
    setFindMatchIndex,
    setShowFindReplace,
    setFindReplaceTab,
    onTitleChange,
    onBlocksChange,
  } = deps;

  const refreshFindMatches = useCallback((query: string, preferIndex?: number) => {
    const next = findInDocument(title, blocksRef.current, query);
    setFindMatches(next);
    if (!next.length) {
      setFindMatchIndex(0);
      return next;
    }
    const idx = preferIndex != null
      ? Math.min(Math.max(0, preferIndex), next.length - 1)
      : Math.min(findMatchIndexRef.current, next.length - 1);
    setFindMatchIndex(idx);
    return next;
  }, [title, setFindMatches, setFindMatchIndex, findMatchIndexRef]);

  const scrollToActiveFindMatch = useCallback(() => {
    requestAnimationFrame(() => {
      const el = editorRef.current?.querySelector('[data-doc-find="active"]') as HTMLElement | null;
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [editorRef]);

  const focusFindMatch = useCallback((match: FindMatch | undefined) => {
    if (!match) return;
    const { target, start, end } = match;
    if (target.kind === 'title') {
      const titleEl = editorRef.current?.querySelector('[data-doc-title][contenteditable]') as HTMLElement | null;
      if (titleEl) {
        selectTextOffsetsInEditable(titleEl, start, end);
        titleEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    const block = blocksRef.current[target.blockIndex];
    if (!block) return;
    const blockEl = blockRefs.current.get(block.id);
    if (!blockEl) {
      scrollToActiveFindMatch();
      return;
    }
    if (target.kind === 'block' || target.kind === 'code') {
      selectTextOffsetsInEditable(blockEl, start, end);
      blockEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (target.kind === 'list') {
      const textEl = getListItemTextEl(blockEl, target.itemIndex);
      if (textEl) {
        selectTextOffsetsInEditable(textEl, start, end);
        textEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        scrollToActiveFindMatch();
      }
      return;
    }
    if (target.kind === 'table') {
      const cellEl = blockEl.querySelector(
        `[data-table-cell][data-row="${target.row}"][data-col="${target.col}"]`,
      ) as HTMLElement | null
        ?? blockEl.querySelector(`[data-row="${target.row}"][data-col="${target.col}"]`) as HTMLElement | null;
      if (cellEl) {
        selectTextOffsetsInEditable(cellEl, start, end);
        cellEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        scrollToActiveFindMatch();
      }
    }
  }, [scrollToActiveFindMatch, blocksRef, blockRefs]);

  // Auto-refresh find matches
  useEffect(() => {
    if (!showFindReplace) {
      setFindMatches([]);
      setFindMatchIndex(0);
      return;
    }
    refreshFindMatches(findQuery);
  }, [showFindReplace, findQuery, title, refreshFindMatches]);

  // Auto-scroll to active match
  useEffect(() => {
    if (!showFindReplace || !findMatches.length) return;
    scrollToActiveFindMatch();
  }, [showFindReplace, findMatchIndex, scrollToActiveFindMatch]);

  const openFindReplace = useCallback((tab: import('../DocFindReplacePanel').FindReplaceTab = 'find') => {
    setFindReplaceTab(readOnly ? 'find' : tab);
    setShowFindReplace(true);
  }, [readOnly, setFindReplaceTab, setShowFindReplace]);

  const closeFindReplace = useCallback(() => {
    setShowFindReplace(false);
  }, [setShowFindReplace]);

  const handleFindPrev = useCallback(() => {
    if (!findMatches.length) return;
    const nextIdx = (findMatchIndexRef.current - 1 + findMatches.length) % findMatches.length;
    setFindMatchIndex(nextIdx);
    focusFindMatch(findMatches[nextIdx]);
  }, [findMatches, focusFindMatch, findMatchIndexRef, setFindMatchIndex]);

  const handleFindNext = useCallback(() => {
    if (!findMatches.length) return;
    const nextIdx = (findMatchIndexRef.current + 1) % findMatches.length;
    setFindMatchIndex(nextIdx);
    focusFindMatch(findMatches[nextIdx]);
  }, [findMatches, focusFindMatch, findMatchIndexRef, setFindMatchIndex]);

  const handleReplaceOne = useCallback(() => {
    if (readOnly || !findQuery || !findMatches.length) return;
    const match = findMatches[findMatchIndexRef.current];
    if (!match) return;
    const result = replaceMatchInDocument(title, blocksRef.current, match, replaceQuery);
    if (result.title !== title) onTitleChange?.(result.title);
    onBlocksChange(result.blocks, true);
  }, [readOnly, findQuery, findMatches, title, replaceQuery, onTitleChange, onBlocksChange]);

  const handleReplaceAll = useCallback(() => {
    if (readOnly || !findQuery) return;
    const result = replaceAllInDocument(title, blocksRef.current, findQuery, replaceQuery);
    if (!result.count) return;
    if (result.title !== title) onTitleChange?.(result.title);
    onBlocksChange(result.blocks, true);
    setFindMatches([]);
    setFindMatchIndex(0);
  }, [readOnly, findQuery, title, replaceQuery, onTitleChange, onBlocksChange]);

  // Ctrl+F/H
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.isComposing) return;
      const key = e.key.toLowerCase();
      if (key !== 'f' && key !== 'h') return;
      const root = editorRef.current;
      const inEditor = !!(root && (root.contains(document.activeElement) || document.activeElement?.closest?.('[data-doc-find-replace-panel]')));
      const inToolbar = false; // anchor ref is managed in the main component
      if (!inEditor && document.activeElement !== document.body) {
        if (!root?.contains(e.target as Node)) return;
      }
      e.preventDefault();
      e.stopPropagation();
      openFindReplace(key === 'h' && !readOnly ? 'replace' : 'find');
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [openFindReplace, readOnly]);

  const findHighlightGroups = useMemo(() => {
    if (!showFindReplace || !findQuery || findMatches.length === 0) {
      return groupFindHighlights([], -1);
    }
    return groupFindHighlights(findMatches, findMatchIndex);
  }, [showFindReplace, findQuery, findMatches, findMatchIndex]);

  const docWordCount = useMemo(
    () => computeRichDocumentTextStats(blocksRef.current).wordCount,
    [blocksRef.current],
  );

  const listHighlightsByBlock = useMemo(() => {
    const result = new Map<number, Map<number, import('@lingyi-doc/core').FindHighlightRange[]>>();
    findHighlightGroups.byListItem.forEach((ranges, key) => {
      const [bi, ii] = key.split(':').map(Number);
      if (Number.isNaN(bi) || Number.isNaN(ii)) return;
      let map = result.get(bi);
      if (!map) {
        map = new Map();
        result.set(bi, map);
      }
      map.set(ii, ranges);
    });
    return result;
  }, [findHighlightGroups]);

  return {
    refreshFindMatches,
    scrollToActiveFindMatch,
    focusFindMatch,
    openFindReplace,
    closeFindReplace,
    handleFindPrev,
    handleFindNext,
    handleReplaceOne,
    handleReplaceAll,
    findHighlightGroups,
    docWordCount,
    listHighlightsByBlock,
  };
}

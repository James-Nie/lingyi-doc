import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { TableBlock, TableCell, BlockAlign, TableCellStyle, TableCellVerticalAlign, PendingCaret } from '@lingyi-doc/core-doc';
import { addTableColumn, addTableRow, ensureTableSizes, extractContentFromEditable, extractPlainText, getTableCellTypography, getCaretOffset, marksEqual, marksToHtml, removeTableColumns, removeTableRows, selectElementContents, setCaretOffset, resolveCaretOffset, insertTextWithMarks, deleteTabBeforeCaret, normalizeMarks, DOC_TABLE_MIN_COL_WIDTH, DOC_TABLE_MIN_ROW_HEIGHT, DOC_TABLE_GUTTER_WIDTH, DOC_TABLE_INSERT_BTN_SIZE } from '@lingyi-doc/core-doc';
import { DOC_COLORS } from './styles';
import { DocTableToolbar, type TableSelectionKind } from './DocTableToolbar';
import { useNativePasteHandler } from './useNativePasteHandler';
import { useDocHistoryRevision } from './DocHistoryContext';

const GUTTER = DOC_TABLE_GUTTER_WIDTH;
const INSERT_HIT = 20;
const INSERT_BTN = DOC_TABLE_INSERT_BTN_SIZE;
const RESIZE_HIT = 6;
const SELECT_BLUE = '#165DFF';
const SELECT_BG = 'rgba(22, 93, 255, 0.06)';

interface DocTableBlockProps {
  block: TableBlock;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onFocus: () => void;
  onChange: (block: TableBlock, recordHistory?: boolean) => void;
  onRegisterRef: (id: string, el: HTMLElement | null) => void;
  onNativePaste?: (e: ClipboardEvent, el: HTMLElement) => void;
  consumePendingCaret?: (blockId: string, tableCell?: { row: number; col: number }) => PendingCaret | null;
  releasePendingCaret?: (pending: PendingCaret) => void;
  applyPendingCaret?: (pending: PendingCaret) => void;
  readOnly?: boolean;
}

function toggleIndex(set: Set<number>, index: number, multi: boolean): Set<number> {
  if (multi) {
    const next = new Set(set);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    return next;
  }
  return new Set([index]);
}

function InsertTip({ label }: { label: string }) {
  return (
    <div style={{
      position: 'absolute',
      top: -30,
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '4px 10px',
      background: '#1D2129',
      color: '#fff',
      fontSize: 12,
      borderRadius: 4,
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      zIndex: 8,
    }}>
      {label}
      <div style={{
        position: 'absolute',
        left: '50%',
        bottom: -4,
        transform: 'translateX(-50%)',
        width: 0,
        height: 0,
        borderLeft: '4px solid transparent',
        borderRight: '4px solid transparent',
        borderTop: '4px solid #1D2129',
      }} />
    </div>
  );
}

function TableCellEditor({
  cell,
  row,
  col,
  rows,
  cols,
  height,
  showChrome,
  selectedRows,
  selectedCols,
  onUpdate,
  onFocus,
  onPaste,
  onRegisterCell,
  onNavigateCell,
  blockId,
  consumePendingCaret,
  releasePendingCaret,
  readOnly = false,
}: {
  cell: TableCell;
  row: number;
  col: number;
  rows: number;
  cols: number;
  height: number;
  showChrome: boolean;
  selectedRows: Set<number>;
  selectedCols: Set<number>;
  onUpdate: (cell: TableCell) => void;
  onFocus: () => void;
  onPaste?: (e: ClipboardEvent, el: HTMLElement) => void;
  onRegisterCell: (key: string, el: HTMLElement | null) => void;
  onNavigateCell: (row: number, col: number) => void;
  blockId: string;
  consumePendingCaret?: (blockId: string, tableCell?: { row: number; col: number }) => PendingCaret | null;
  releasePendingCaret?: (pending: PendingCaret) => void;
  applyPendingCaret?: (pending: PendingCaret) => void;
  readOnly?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useNativePasteHandler(ref, onPaste);
  const historyRevision = useDocHistoryRevision();
  const lastHistoryRevisionRef = useRef(historyRevision);
  const highlighted = selectedRows.has(row) || selectedCols.has(col);

  useEffect(() => {
    const key = `${row}-${col}`;
    onRegisterCell(key, ref.current);
    return () => onRegisterCell(key, null);
  }, [row, col, onRegisterCell]);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const forceSync = historyRevision !== lastHistoryRevisionRef.current;
    if (forceSync) lastHistoryRevisionRef.current = historyRevision;

    const pending = consumePendingCaret?.(blockId, { row, col }) ?? null;
    const domContent = extractContentFromEditable(ref.current);
    const domMatches = domContent.text === cell.text && marksEqual(domContent.marks, cell.marks);

    if (document.activeElement === ref.current && !forceSync && !pending && domMatches) {
      return;
    }

    const html = marksToHtml(cell.text, cell.marks);
    if (ref.current.innerHTML !== html) ref.current.innerHTML = html || '';

    if (pending) {
      ref.current.focus();
      setCaretOffset(ref.current, resolveCaretOffset(pending.position, cell.text.length));
      releasePendingCaret?.(pending);
    }
  }, [cell.text, cell.marks, cell.align, cell.verticalAlign, cell.cellStyle, historyRevision, blockId, row, col, consumePendingCaret, releasePendingCaret]);

  const handleInput = () => {
    if (readOnly || !ref.current) return;
    const { text, marks } = extractContentFromEditable(ref.current);
    onUpdate({ ...cell, text, marks });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (readOnly) return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;

    // Ctrl/Cmd+Tab：单元格内插入制表符，不跳格
    if (e.key === 'Tab' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      const el = ref.current;
      if (!el) return;
      const { text, marks } = extractContentFromEditable(el);
      const offset = getCaretOffset(el);
      const inserted = insertTextWithMarks(text, marks, offset, '\t');
      el.innerHTML = marksToHtml(inserted.text, inserted.marks) || '';
      setCaretOffset(el, offset + 1);
      onUpdate({ ...cell, text: inserted.text, marks: inserted.marks });
      return;
    }

    // Backspace 删除制表符 span
    if (e.key === 'Backspace') {
      const el = ref.current;
      if (!el) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      const { text, marks } = extractContentFromEditable(el);
      const offset = getCaretOffset(el);
      if (offset > 0 && text[offset - 1] === '\t') {
        e.preventDefault();
        e.stopPropagation();
        const deleted = deleteTabBeforeCaret(text, marks, offset);
        if (deleted) {
          const nextMarks = normalizeMarks(deleted.marks, deleted.text.length);
          el.innerHTML = marksToHtml(deleted.text, nextMarks) || '';
          setCaretOffset(el, deleted.caret);
          onUpdate({ ...cell, text: deleted.text, marks: nextMarks });
        }
        return;
      }
    }

    if (e.key !== 'Tab') return;

    e.preventDefault();
    e.stopPropagation();

    let nextRow = row;
    let nextCol = col;
    if (e.shiftKey) {
      if (col > 0) {
        nextCol = col - 1;
      } else if (row > 0) {
        nextRow = row - 1;
        nextCol = cols - 1;
      } else {
        return; // 已在首格
      }
    } else if (col < cols - 1) {
      nextCol = col + 1;
    } else if (row < rows - 1) {
      nextRow = row + 1;
      nextCol = 0;
    } else {
      return; // 已在末格，不把焦点 Tab 出编辑器
    }
    onNavigateCell(nextRow, nextCol);
  };

  const align = cell.align ?? 'left';
  const verticalAlign = cell.verticalAlign ?? 'top';
  const typography = getTableCellTypography(cell.cellStyle ?? 'paragraph');
  const justifyContent =
    verticalAlign === 'middle' ? 'center' : verticalAlign === 'bottom' ? 'flex-end' : 'flex-start';
  const cellBg = highlighted
    ? SELECT_BG
    : (typography.background ?? (showChrome ? '#fff' : '#FAF9F5'));

  return (
    <div
      style={{
        minHeight: height,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent,
        background: cellBg,
        borderRight: `1px solid ${DOC_COLORS.border}`,
        borderBottom: `1px solid ${DOC_COLORS.border}`,
        ...(row === 0 && !showChrome ? { borderTop: `1px solid ${DOC_COLORS.border}` } : null),
        ...(col === 0 && !showChrome ? { borderLeft: `1px solid ${DOC_COLORS.border}` } : null),
        overflow: 'visible',
      }}
    >
      <div
        ref={ref}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        data-doc-editable=""
        data-table-cell={`${row}-${col}`}
        onFocus={readOnly ? undefined : onFocus}
        onInput={readOnly ? undefined : handleInput}
        onKeyDown={readOnly ? undefined : handleKeyDown}
        onMouseDown={e => e.stopPropagation()}
        style={{
          flex: 1,
          minHeight: Math.max(0, height - 16),
          boxSizing: 'border-box',
          padding: typography.paddingLeft != null ? `8px 10px 8px ${typography.paddingLeft}px` : '8px 10px',
          outline: 'none',
          fontSize: typography.fontSize,
          fontWeight: typography.fontWeight,
          fontFamily: typography.fontFamily,
          lineHeight: typography.lineHeight,
          textAlign: align,
          color: DOC_COLORS.text,
          background: 'transparent',
          overflow: 'visible',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          userSelect: 'text',
          width: '100%',
          cursor: readOnly ? 'default' : 'text',
        }}
      />
    </div>
  );
}

export const DocTableBlock: React.FC<DocTableBlockProps> = ({
  block,
  index,
  selected,
  onSelect,
  onFocus,
  onChange,
  onRegisterRef,
  onNativePaste,
  consumePendingCaret,
  releasePendingCaret,
  applyPendingCaret,
  readOnly = false,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const tableBodyRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [selectedRows, setSelectedRows] = useState<Set<number>>(() => new Set());
  const [selectedCols, setSelectedCols] = useState<Set<number>>(() => new Set());
  const [insertColHover, setInsertColHover] = useState<number | null>(null);
  const [insertRowHover, setInsertRowHover] = useState<number | null>(null);
  const [toolbarAnchor, setToolbarAnchor] = useState<DOMRect | null>(null);
  const [hovered, setHovered] = useState(false);
  const [cellFocused, setCellFocused] = useState(false);

  const showChrome = !readOnly && (selected || hovered || cellFocused
    || selectedRows.size > 0 || selectedCols.size > 0);

  const { columnWidths, rowHeights } = useMemo(() => ensureTableSizes(block), [block]);

  const gridTemplateColumns = useMemo(
    () => columnWidths.map(w => `${w}px`).join(' '),
    [columnWidths],
  );

  const selectionKind: TableSelectionKind = useMemo(() => {
    if (selectedCols.size > 0) return 'col';
    if (selectedRows.size > 0) return 'row';
    return null;
  }, [selectedCols.size, selectedRows.size]);

  useEffect(() => {
    onRegisterRef(block.id, rootRef.current);
    return () => onRegisterRef(block.id, null);
  }, [block.id, onRegisterRef]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onFocusIn = () => {
      if (root.contains(document.activeElement)) setCellFocused(true);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!root.contains(e.relatedTarget as Node)) setCellFocused(false);
    };
    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('focusout', onFocusOut);
    return () => {
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  useEffect(() => {
    if (!showChrome) {
      setSelectedRows(new Set());
      setSelectedCols(new Set());
      setInsertColHover(null);
      setInsertRowHover(null);
    }
  }, [showChrome]);

  const registerCell = useCallback((key: string, el: HTMLElement | null) => {
    if (el) cellRefs.current.set(key, el);
    else cellRefs.current.delete(key);
  }, []);

  const navigateCell = useCallback((row: number, col: number) => {
    const el = cellRefs.current.get(`${row}-${col}`);
    if (!el) return;
    el.focus();
    setCaretOffset(el, extractPlainText(el).length);
    onFocus();
  }, [onFocus]);

  const applyBlock = useCallback((next: TableBlock, recordHistory = true) => {
    if (readOnly) return;
    onChange(next, recordHistory);
  }, [onChange, readOnly]);

  const updateCell = useCallback((row: number, col: number, cell: TableCell) => {
    const cells = block.cells.map((r, ri) =>
      r.map((c, ci) => (ri === row && ci === col ? cell : c)),
    );
    applyBlock({ ...block, cells }, false);
  }, [block, applyBlock]);

  const forEachSelectedCell = useCallback((
    fn: (cell: TableCell) => TableCell,
    recordHistory = true,
  ) => {
    if (selectedCols.size === 0 && selectedRows.size === 0) return;
    const cells = block.cells.map(row => [...row]);
    if (selectedCols.size > 0) {
      selectedCols.forEach(ci => {
        for (let ri = 0; ri < block.rows; ri++) {
          cells[ri][ci] = fn(cells[ri][ci]);
        }
      });
    } else {
      selectedRows.forEach(ri => {
        for (let ci = 0; ci < block.cols; ci++) {
          cells[ri][ci] = fn(cells[ri][ci]);
        }
      });
    }
    applyBlock({ ...block, cells }, recordHistory);
  }, [block, selectedCols, selectedRows, applyBlock]);

  const sampleCell = useMemo((): TableCell | null => {
    if (selectedCols.size > 0) {
      const ci = [...selectedCols].sort((a, b) => a - b)[0];
      return block.cells[0]?.[ci] ?? null;
    }
    if (selectedRows.size > 0) {
      const ri = [...selectedRows].sort((a, b) => a - b)[0];
      return block.cells[ri]?.[0] ?? null;
    }
    return null;
  }, [block.cells, selectedCols, selectedRows]);

  const clearAxisSelection = useCallback(() => {
    setSelectedRows(new Set());
    setSelectedCols(new Set());
    setToolbarAnchor(null);
  }, []);

  const insertColAfter = useCallback((afterCol: number) => {
    applyBlock(addTableColumn(block, afterCol), true);
    setInsertColHover(null);
  }, [block, applyBlock]);

  const insertRowAfter = useCallback((afterRow: number) => {
    applyBlock(addTableRow(block, afterRow), true);
    setInsertRowHover(null);
  }, [block, applyBlock]);

  const handleColSelect = useCallback((ci: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    setSelectedRows(new Set());
    setSelectedCols(prev => toggleIndex(prev, ci, e.metaKey || e.ctrlKey));
  }, [onSelect]);

  const handleRowSelect = useCallback((ri: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    setSelectedCols(new Set());
    setSelectedRows(prev => toggleIndex(prev, ri, e.metaKey || e.ctrlKey));
  }, [onSelect]);

  const colBorderRight = useCallback((colIndex: number) => {
    let x = 0;
    for (let i = 0; i <= colIndex; i++) x += columnWidths[i];
    return x;
  }, [columnWidths]);

  const rowBorderBottom = useCallback((rowIndex: number) => {
    let y = 0;
    for (let i = 0; i <= rowIndex; i++) y += rowHeights[i];
    return y;
  }, [rowHeights]);

  const tableWidth = columnWidths.reduce((a, b) => a + b, 0);
  const tableHeight = rowHeights.reduce((a, b) => a + b, 0);
  const chromeFrameWidth = tableWidth + GUTTER;
  const chromeFrameHeight = tableHeight + GUTTER;

  const updateToolbarAnchor = useCallback(() => {
    const body = tableBodyRef.current;
    if (!body) return;
    const bodyRect = body.getBoundingClientRect();

    if (selectedCols.size > 0) {
      const indices = [...selectedCols].sort((a, b) => a - b);
      const first = indices[0];
      const last = indices[indices.length - 1];
      let left = GUTTER;
      for (let i = 0; i < first; i++) left += columnWidths[i];
      let width = 0;
      for (let i = first; i <= last; i++) width += columnWidths[i];
      setToolbarAnchor(new DOMRect(bodyRect.left + left, bodyRect.top, width, GUTTER));
      return;
    }

    if (selectedRows.size > 0) {
      const indices = [...selectedRows].sort((a, b) => a - b);
      const first = indices[0];
      const last = indices[indices.length - 1];
      let top = GUTTER;
      for (let i = 0; i < first; i++) top += rowHeights[i];
      let height = 0;
      for (let i = first; i <= last; i++) height += rowHeights[i];
      setToolbarAnchor(new DOMRect(bodyRect.left, bodyRect.top + top, chromeFrameWidth, height));
      return;
    }

    setToolbarAnchor(null);
  }, [selectedCols, selectedRows, columnWidths, rowHeights, chromeFrameWidth]);

  useEffect(() => {
    updateToolbarAnchor();
    const onScrollOrResize = () => updateToolbarAnchor();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [updateToolbarAnchor]);

  const startColResize = useCallback((colIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setInsertColHover(null);
    const startX = e.clientX;
    const startWidth = columnWidths[colIndex];
    let latestWidths = [...columnWidths];

    const onMove = (ev: MouseEvent) => {
      latestWidths[colIndex] = Math.round(Math.max(DOC_TABLE_MIN_COL_WIDTH, startWidth + ev.clientX - startX));
      applyBlock({ ...block, columnWidths: [...latestWidths], rowHeights }, false);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      applyBlock({ ...block, columnWidths: latestWidths, rowHeights }, true);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [block, columnWidths, rowHeights, applyBlock]);

  const startRowResize = useCallback((rowIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setInsertRowHover(null);
    const startY = e.clientY;
    const startHeight = rowHeights[rowIndex];
    let latestHeights = [...rowHeights];

    const onMove = (ev: MouseEvent) => {
      latestHeights[rowIndex] = Math.round(Math.max(DOC_TABLE_MIN_ROW_HEIGHT, startHeight + ev.clientY - startY));
      applyBlock({ ...block, columnWidths, rowHeights: [...latestHeights] }, false);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      applyBlock({ ...block, columnWidths, rowHeights: latestHeights }, true);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [block, columnWidths, rowHeights, applyBlock]);

  const applyFormatToSelection = useCallback((cmd: 'bold' | 'italic' | 'underline' | 'strikeThrough') => {
    const formatCell = (ri: number, ci: number) => {
      const el = cellRefs.current.get(`${ri}-${ci}`);
      if (!el) return;
      el.focus();
      selectElementContents(el);
      document.execCommand(cmd, false);
      const { text, marks } = extractContentFromEditable(el);
      updateCell(ri, ci, { ...block.cells[ri][ci], text, marks });
    };

    if (selectedCols.size > 0) {
      selectedCols.forEach(ci => {
        for (let ri = 0; ri < block.rows; ri++) formatCell(ri, ci);
      });
    } else if (selectedRows.size > 0) {
      selectedRows.forEach(ri => {
        for (let ci = 0; ci < block.cols; ci++) formatCell(ri, ci);
      });
    }
  }, [block.rows, block.cols, block.cells, selectedCols, selectedRows, updateCell]);

  const handleToolbarCellStyle = useCallback((style: TableCellStyle) => {
    forEachSelectedCell(cell => ({ ...cell, cellStyle: style }));
  }, [forEachSelectedCell]);

  const handleToolbarAlign = useCallback((align: BlockAlign) => {
    forEachSelectedCell(cell => ({ ...cell, align }));
  }, [forEachSelectedCell]);

  const handleToolbarVerticalAlign = useCallback((verticalAlign: TableCellVerticalAlign) => {
    forEachSelectedCell(cell => ({ ...cell, verticalAlign }));
  }, [forEachSelectedCell]);

  const handleToolbarInsertCol = useCallback(() => {
    const indices = [...selectedCols].sort((a, b) => b - a);
    let next = block;
    indices.forEach(ci => { next = addTableColumn(next, ci); });
    applyBlock(next, true);
  }, [block, selectedCols, applyBlock]);

  const handleToolbarInsertRow = useCallback(() => {
    const indices = [...selectedRows].sort((a, b) => b - a);
    let next = block;
    indices.forEach(ri => { next = addTableRow(next, ri); });
    applyBlock(next, true);
  }, [block, selectedRows, applyBlock]);

  const handleToolbarDelete = useCallback(() => {
    if (selectedCols.size > 0) {
      applyBlock(removeTableColumns(block, [...selectedCols]), true);
      clearAxisSelection();
    } else if (selectedRows.size > 0) {
      applyBlock(removeTableRows(block, [...selectedRows]), true);
      clearAxisSelection();
    }
  }, [block, selectedCols, selectedRows, applyBlock, clearAxisSelection]);

  return (
    <div
      ref={rootRef}
      data-block-id={block.id}
      data-block-index={index}
      data-doc-table-ui
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={e => {
        e.stopPropagation();
        onSelect();
      }}
      style={{
        margin: 0,
        padding: '12px 0',
        position: 'relative',
        overflow: 'visible',
      }}
    >
      <DocTableToolbar
        open={selectionKind != null}
        anchorRect={toolbarAnchor}
        selectionKind={selectionKind}
        cellStyle={sampleCell?.cellStyle ?? 'paragraph'}
        align={sampleCell?.align ?? 'left'}
        verticalAlign={sampleCell?.verticalAlign ?? 'top'}
        onInsertCol={handleToolbarInsertCol}
        onInsertRow={handleToolbarInsertRow}
        onDelete={handleToolbarDelete}
        onFormat={applyFormatToSelection}
        onCellStyle={handleToolbarCellStyle}
        onAlign={handleToolbarAlign}
        onVerticalAlign={handleToolbarVerticalAlign}
      />

      <div
        ref={tableBodyRef}
        style={{
          position: 'relative',
          paddingTop: showChrome ? GUTTER : 0,
          paddingLeft: showChrome ? GUTTER : 0,
          marginTop: showChrome ? -GUTTER : 0,
          marginLeft: showChrome ? -GUTTER : 0,
          width: showChrome ? chromeFrameWidth : tableWidth,
          maxWidth: '100%',
          overflow: 'visible',
        }}
      >
        {showChrome && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: chromeFrameWidth,
              height: chromeFrameHeight,
              borderRadius: 6,
              boxSizing: 'border-box',
              boxShadow: selected
                ? `0 0 0 2px ${DOC_COLORS.primary}`
                : `0 0 0 1px ${DOC_COLORS.border}`,
              pointerEvents: 'none',
              zIndex: 4,
            }}
          />
        )}

        <div style={{ display: 'grid', gridTemplateColumns, width: tableWidth }}>
          {block.cells.map((row, ri) => (
            <React.Fragment key={`row-${ri}`}>
              {row.map((cell, ci) => (
                <TableCellEditor
                  key={`c-${ri}-${ci}`}
                  cell={cell}
                  row={ri}
                  col={ci}
                  rows={block.rows}
                  cols={block.cols}
                  height={rowHeights[ri]}
                  showChrome={showChrome}
                  selectedRows={selectedRows}
                  selectedCols={selectedCols}
                  onUpdate={c => updateCell(ri, ci, c)}
                  onFocus={() => {
                    clearAxisSelection();
                    onFocus();
                  }}
                  onPaste={readOnly ? undefined : onNativePaste}
                  onRegisterCell={registerCell}
                  onNavigateCell={navigateCell}
                  blockId={block.id}
                  consumePendingCaret={consumePendingCaret}
                  releasePendingCaret={releasePendingCaret}
                  applyPendingCaret={applyPendingCaret}
                  readOnly={readOnly}
                />
              ))}
            </React.Fragment>
          ))}
        </div>

        {showChrome && (
          <>
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: GUTTER,
              height: GUTTER,
              background: '#F2F3F5',
              borderBottom: `1px solid ${DOC_COLORS.border}`,
              borderRight: `1px solid ${DOC_COLORS.border}`,
              zIndex: 3,
            }} />

            {columnWidths.map((w, ci) => {
              const colSelected = selectedCols.has(ci);
              let left = GUTTER;
              for (let i = 0; i < ci; i++) left += columnWidths[i];
              return (
                <div
                  key={`ch-${ci}`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left,
                    width: w,
                    height: GUTTER,
                    background: colSelected ? SELECT_BG : '#F2F3F5',
                    borderBottom: `1px solid ${DOC_COLORS.border}`,
                    borderTop: colSelected ? `2px solid ${SELECT_BLUE}` : '2px solid transparent',
                    boxSizing: 'border-box',
                    zIndex: 3,
                  }}
                >
                  <button
                    type="button"
                    title={`选择第 ${ci + 1} 列`}
                    onMouseDown={e => handleColSelect(ci, e)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                    }}
                  >
                    <span style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: colSelected ? SELECT_BLUE : '#C9CDD4',
                    }} />
                  </button>
                  <div
                    role="presentation"
                    onMouseDown={e => startColResize(ci, e)}
                    style={{
                      position: 'absolute',
                      right: -RESIZE_HIT / 2,
                      top: 0,
                      width: RESIZE_HIT,
                      height: GUTTER,
                      cursor: 'col-resize',
                      zIndex: 2,
                    }}
                  />
                </div>
              );
            })}

            {block.cells.map((_, ri) => {
              const rowSelected = selectedRows.has(ri);
              let top = GUTTER;
              for (let i = 0; i < ri; i++) top += rowHeights[i];
              return (
                <div
                  key={`rh-${ri}`}
                  style={{
                    position: 'absolute',
                    top,
                    left: 0,
                    width: GUTTER,
                    height: rowHeights[ri],
                    background: rowSelected ? SELECT_BG : '#F2F3F5',
                    borderLeft: rowSelected ? `2px solid ${SELECT_BLUE}` : '2px solid transparent',
                    borderRight: `1px solid ${DOC_COLORS.border}`,
                    borderBottom: ri < block.rows - 1 ? 'none' : `1px solid ${DOC_COLORS.border}`,
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 3,
                  }}
                >
                  <button
                    type="button"
                    title={`选择第 ${ri + 1} 行`}
                    onMouseDown={e => handleRowSelect(ri, e)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                    }}
                  >
                    <span style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: rowSelected ? SELECT_BLUE : '#C9CDD4',
                    }} />
                  </button>
                  <div
                    role="presentation"
                    onMouseDown={e => startRowResize(ri, e)}
                    style={{
                      position: 'absolute',
                      left: 0,
                      bottom: -RESIZE_HIT / 2,
                      height: RESIZE_HIT,
                      width: GUTTER,
                      cursor: 'row-resize',
                      zIndex: 2,
                    }}
                  />
                </div>
              );
            })}
          </>
        )}

        {showChrome && columnWidths.map((_, ci) => (
          <div
            key={`col-insert-${ci}`}
            data-doc-table-ui
            onMouseEnter={() => setInsertColHover(ci)}
            onMouseLeave={e => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setInsertColHover(v => (v === ci ? null : v));
              }
            }}
            style={{
              position: 'absolute',
              left: GUTTER + colBorderRight(ci) - INSERT_HIT / 2,
              top: 0,
              width: INSERT_HIT,
              height: chromeFrameHeight,
              zIndex: insertColHover === ci ? 6 : 3,
              pointerEvents: 'auto',
            }}
          >
              {insertColHover === ci && (
                <>
                  <div style={{
                    position: 'absolute',
                    left: INSERT_HIT / 2 - 1,
                    top: 0,
                    width: 2,
                    height: '100%',
                    background: SELECT_BLUE,
                    pointerEvents: 'none',
                  }} />
                  <button
                    type="button"
                    title="插入列"
                    onMouseDown={e => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={e => {
                      e.stopPropagation();
                      insertColAfter(ci);
                    }}
                    style={{
                      position: 'absolute',
                      top: GUTTER / 2 - INSERT_BTN / 2,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: INSERT_BTN,
                      height: INSERT_BTN,
                      borderRadius: '50%',
                      border: `2px solid ${SELECT_BLUE}`,
                      background: '#fff',
                      color: SELECT_BLUE,
                      fontSize: 12,
                      lineHeight: 1,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      zIndex: 7,
                    }}
                  >
                    +
                  </button>
                  <InsertTip label="插入列" />
                  <div
                    role="presentation"
                    onMouseDown={e => startColResize(ci, e)}
                    style={{
                      position: 'absolute',
                      left: INSERT_HIT / 2 - RESIZE_HIT / 2,
                      top: GUTTER,
                      width: RESIZE_HIT,
                      height: tableHeight,
                      cursor: 'col-resize',
                    }}
                  />
                </>
              )}
            </div>
          ))}

          {showChrome && rowHeights.map((_, ri) => (
            <div
              key={`row-insert-${ri}`}
              data-doc-table-ui
              onMouseEnter={() => setInsertRowHover(ri)}
              onMouseLeave={e => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setInsertRowHover(v => (v === ri ? null : v));
                }
              }}
              style={{
                position: 'absolute',
                left: 0,
                top: GUTTER + rowBorderBottom(ri) - INSERT_HIT / 2,
                width: chromeFrameWidth,
                height: INSERT_HIT,
                zIndex: insertRowHover === ri ? 6 : 3,
                pointerEvents: 'auto',
              }}
            >
              {insertRowHover === ri && (
                <>
                  <div style={{
                    position: 'absolute',
                    left: GUTTER,
                    top: INSERT_HIT / 2 - 1,
                    width: tableWidth,
                    height: 2,
                    background: SELECT_BLUE,
                    pointerEvents: 'none',
                  }} />
                  <button
                    type="button"
                    title="插入行"
                    onMouseDown={e => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={e => {
                      e.stopPropagation();
                      insertRowAfter(ri);
                    }}
                    style={{
                      position: 'absolute',
                      left: GUTTER / 2 - INSERT_BTN / 2,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: INSERT_BTN,
                      height: INSERT_BTN,
                      borderRadius: '50%',
                      border: `2px solid ${SELECT_BLUE}`,
                      background: '#fff',
                      color: SELECT_BLUE,
                      fontSize: 12,
                      lineHeight: 1,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      zIndex: 7,
                    }}
                  >
                    +
                  </button>
                  <InsertTip label="插入行" />
                  <div
                    role="presentation"
                    onMouseDown={e => startRowResize(ri, e)}
                    style={{
                      position: 'absolute',
                      left: GUTTER,
                      top: INSERT_HIT / 2 - RESIZE_HIT / 2,
                      width: tableWidth,
                      height: RESIZE_HIT,
                      cursor: 'row-resize',
                    }}
                  />
                </>
              )}
            </div>
          ))}
      </div>
    </div>
  );
};

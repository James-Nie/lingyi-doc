import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MindNode } from '@lingyi-doc/core-types';
import { countMindDescendants, findMindNode, MIND_NODE_MAX_WIDTH } from '@lingyi-doc/core-mindmap';
import { MindNoteNodeImage } from './MindNoteNodeImage';
import { MindNoteOutlineSelectionPanel } from './MindNoteOutlineSelectionPanel';
import {
  collectOutlineNodeIds,
  countSelectedChars,
  hitTestOutlineRows,
  normalizeRect,
} from './outlineSelectionUtils';
import { MN_COLORS } from './styles';

const OUTLINE_INDENT = 0;
const OUTLINE_LINE_HEIGHT = 30;
const OUTLINE_FONT_SIZE = 15;
const TOGGLE_SIZE = 20;
const BULLET_SIZE = 5;
const GUTTER_INNER_GAP = 4;
const TEXT_GAP = 6;
const GUIDE_LINE_OFFSET = TOGGLE_SIZE + GUTTER_INNER_GAP + Math.round(BULLET_SIZE / 2);
const MULTI_SELECT_BG = 'rgba(123, 102, 255, 0.12)';

const HEADING_STYLES: Record<1 | 2 | 3, { fontSize: number; fontWeight: number }> = {
  1: { fontSize: 20, fontWeight: 600 },
  2: { fontSize: 17, fontWeight: 600 },
  3: { fontSize: 15, fontWeight: 600 },
};

interface MindNoteOutlineViewProps {
  root: MindNode;
  activeNodeId: string | null;
  readOnly?: boolean;
  onSelectNode: (id: string) => void;
  onUpdateText: (id: string, text: string) => void;
  onToggleCollapse: (id: string) => void;
  onKeyCommand: (id: string, cmd: MindNoteOutlineCommand, e: React.KeyboardEvent) => void;
  onRemoveImage?: (id: string) => void;
  onBulkPatch?: (ids: string[], patch: Partial<MindNode>) => void;
  onBulkDelete?: (ids: string[]) => void;
}

export type MindNoteOutlineCommand =
  | 'sibling'
  | 'child'
  | 'parent'
  | 'delete'
  | 'expand'
  | 'duplicate';

interface OutlineItemProps {
  node: MindNode;
  depth: number;
  isRoot: boolean;
  activeNodeId: string | null;
  selectedIds: Set<string>;
  multiSelectMode: boolean;
  onSelectNode: (id: string) => void;
  onToggleSelect: (id: string, additive: boolean) => void;
  onUpdateText: (id: string, text: string) => void;
  onToggleCollapse: (id: string) => void;
  onKeyCommand: (id: string, cmd: MindNoteOutlineCommand, e: React.KeyboardEvent) => void;
  onRemoveImage?: (id: string) => void;
  onClearMultiSelect?: () => void;
  readOnly?: boolean;
}

function OutlineBullet() {
  const offset = (OUTLINE_LINE_HEIGHT - BULLET_SIZE) / 2;
  return (
    <span
      aria-hidden
      style={{
        width: BULLET_SIZE,
        height: BULLET_SIZE,
        borderRadius: '50%',
        background: '#BBBFC4',
        flexShrink: 0,
        marginTop: offset,
      }}
    />
  );
}

function CollapseToggle({
  collapsed,
  onClick,
}: {
  collapsed: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const label = collapsed ? '展开' : '折叠';

  return (
    <div
      style={{ position: 'relative', flexShrink: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {hovered && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '100%',
            transform: 'translateX(-50%)',
            marginBottom: 6,
            padding: '5px 8px',
            background: '#1F2329',
            color: '#fff',
            fontSize: 12,
            lineHeight: '18px',
            borderRadius: 6,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 20,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          {label}
        </div>
      )}
      <button
        type="button"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onMouseDown={(e) => e.preventDefault()}
        style={{
          width: TOGGLE_SIZE,
          height: TOGGLE_SIZE,
          border: 'none',
          borderRadius: '50%',
          background: hovered ? '#E8E9EB' : 'transparent',
          cursor: 'pointer',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.15s ease',
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          {collapsed ? (
            <path d="M3.2 1.8 L7.4 5 L3.2 8.2 Z" fill="#646A73" />
          ) : (
            <path d="M1.8 3.2 L5 7.4 L8.2 3.2 Z" fill="#646A73" />
          )}
        </svg>
      </button>
    </div>
  );
}

function getTextStyle(node: MindNode) {
  const heading = node.headingLevel ? HEADING_STYLES[node.headingLevel] : null;
  return {
    fontSize: heading?.fontSize ?? OUTLINE_FONT_SIZE,
    fontWeight: node.bold ? 700 : (heading?.fontWeight ?? 400),
    fontStyle: node.italic ? 'italic' as const : undefined,
    textDecoration: [
      node.completed ? 'line-through' : '',
      node.underline ? 'underline' : '',
    ].filter(Boolean).join(' ') || undefined,
    color: node.completed ? MN_COLORS.completed : (node.color ?? MN_COLORS.text),
  };
}

function OutlineItem({
  node,
  depth,
  isRoot,
  activeNodeId,
  selectedIds,
  multiSelectMode,
  onSelectNode,
  onToggleSelect,
  onUpdateText,
  onToggleCollapse,
  onKeyCommand,
  onRemoveImage,
  onClearMultiSelect,
  readOnly = false,
}: OutlineItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const active = activeNodeId === node.id;
  const selected = selectedIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const hiddenCount = node.collapsed ? countMindDescendants(node) : 0;
  const hasImage = !!node.image;
  const contentOffset = !isRoot ? TOGGLE_SIZE + GUTTER_INNER_GAP + BULLET_SIZE + TEXT_GAP : 0;
  const textStyle = getTextStyle(node);

  useEffect(() => {
    if (active && !multiSelectMode && ref.current) {
      ref.current.focus();
    }
  }, [active, multiSelectMode]);

  useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    el.textContent = node.text;
  }, [node.text]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (readOnly) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'a') return;
    if (e.key === 'Enter' && !mod) {
      e.preventDefault();
      onKeyCommand(node.id, 'sibling', e);
      return;
    }
    if (e.key === 'Tab' && !e.shiftKey && !mod) {
      e.preventDefault();
      onKeyCommand(node.id, 'child', e);
      return;
    }
    if (e.key === 'Tab' && e.shiftKey && !mod) {
      e.preventDefault();
      onKeyCommand(node.id, 'parent', e);
      return;
    }
    if (e.key === 'Backspace' && !(ref.current?.textContent?.length)) {
      e.preventDefault();
      onKeyCommand(node.id, 'delete', e);
      return;
    }
    if (mod && e.key === 'd') {
      e.preventDefault();
      onKeyCommand(node.id, 'duplicate', e);
      return;
    }
    if (mod && e.key === '.') {
      e.preventDefault();
      onKeyCommand(node.id, 'expand', e);
    }
  }, [node.id, onKeyCommand, readOnly]);

  const handleRowMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) {
      e.stopPropagation();
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    if (mod) {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelect(node.id, true);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <div
        data-outline-row={node.id}
        onMouseDown={handleRowMouseDown}
        style={{
          display: 'flex',
          alignItems: 'stretch',
          background: selected && multiSelectMode ? MULTI_SELECT_BG : 'transparent',
          borderRadius: selected && multiSelectMode ? 4 : 0,
          margin: selected && multiSelectMode ? '0 -4px' : 0,
          padding: selected && multiSelectMode ? '0 4px' : 0,
          paddingLeft: (selected && multiSelectMode ? 4 : 0) + depth * OUTLINE_INDENT,
        }}
      >
        {active && hasImage && !multiSelectMode && (
          <div
            aria-hidden
            style={{
              width: 3,
              marginRight: 8,
              borderRadius: 2,
              background: MN_COLORS.primary,
              flexShrink: 0,
            }}
          />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: TEXT_GAP,
            marginBottom: 0,
            position: 'relative',
            minHeight: OUTLINE_LINE_HEIGHT,
          }}>
            {!isRoot && (
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: GUTTER_INNER_GAP,
                flexShrink: 0,
                width: TOGGLE_SIZE + GUTTER_INNER_GAP + BULLET_SIZE,
              }}>
                {hasChildren ? (
                  <CollapseToggle
                    collapsed={!!node.collapsed}
                    onClick={() => onToggleCollapse(node.id)}
                  />
                ) : (
                  <span style={{ width: TOGGLE_SIZE, flexShrink: 0 }} />
                )}
                <OutlineBullet />
              </div>
            )}

            <div
              ref={ref}
              contentEditable={!readOnly}
              suppressContentEditableWarning
              data-node-id={node.id}
              onFocus={() => {
                if (multiSelectMode) onClearMultiSelect?.();
                onSelectNode(node.id);
              }}
              onInput={() => {
                if (readOnly) return;
                onUpdateText(node.id, ref.current?.textContent ?? '');
              }}
              onKeyDown={handleKeyDown}
              style={{
                flex: 1,
                outline: 'none',
                maxWidth: MIND_NODE_MAX_WIDTH,
                lineHeight: `${OUTLINE_LINE_HEIGHT}px`,
                minHeight: OUTLINE_LINE_HEIGHT,
                padding: '0 2px',
                borderRadius: 4,
                background: active && !hasImage && !multiSelectMode ? 'rgba(91, 143, 249, 0.06)' : 'transparent',
                wordBreak: 'break-word',
                ...textStyle,
              }}
            />

            {node.collapsed && hiddenCount > 0 && (
              <span style={{
                fontSize: 12,
                color: MN_COLORS.muted,
                background: '#F2F3F5',
                borderRadius: 10,
                padding: '0 6px',
                lineHeight: '20px',
                marginTop: 1,
                flexShrink: 0,
              }}>
                {hiddenCount}
              </span>
            )}
          </div>

          {hasImage && (
            <div style={{ paddingLeft: contentOffset }}>
              <MindNoteNodeImage
                src={node.image!}
                width={node.imageWidth}
                height={node.imageHeight}
                onRemove={onRemoveImage ? () => onRemoveImage(node.id) : undefined}
              />
            </div>
          )}
        </div>
      </div>

      {hasChildren && !node.collapsed && (
        <div style={{
          marginLeft: depth * OUTLINE_INDENT + GUIDE_LINE_OFFSET,
          borderLeft: `1px solid ${MN_COLORS.border}`,
          paddingLeft: OUTLINE_INDENT - 8,
        }}>
          {node.children.map(child => (
            <OutlineItem
              key={child.id}
              node={child}
              depth={depth + 1}
              isRoot={false}
              activeNodeId={activeNodeId}
              selectedIds={selectedIds}
              multiSelectMode={multiSelectMode}
              onSelectNode={onSelectNode}
              onToggleSelect={onToggleSelect}
              onUpdateText={onUpdateText}
              onToggleCollapse={onToggleCollapse}
              onKeyCommand={onKeyCommand}
              onRemoveImage={onRemoveImage}
              onClearMultiSelect={onClearMultiSelect}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export const MindNoteOutlineView: React.FC<MindNoteOutlineViewProps> = ({
  root,
  activeNodeId,
  readOnly = false,
  onSelectNode,
  onUpdateText,
  onToggleCollapse,
  onKeyCommand,
  onRemoveImage,
  onBulkPatch,
  onBulkDelete,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dragRect, setDragRect] = useState<ReturnType<typeof normalizeRect> | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const multiSelectMode = selectedIds.length >= 2;

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const selectedNodes = useMemo(() => {
    return selectedIds
      .map(id => findMindNode(root, id)?.node)
      .filter((n): n is MindNode => !!n);
  }, [root, selectedIds]);

  const applySelection = useCallback((ids: string[]) => {
    const unique = [...new Set(ids)];
    setSelectedIds(unique);
    if (unique.length === 1) {
      onSelectNode(unique[0]);
    }
  }, [onSelectNode]);

  const handleToggleSelect = useCallback((id: string, additive: boolean) => {
    if (additive) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        const arr = [...next];
        if (arr.length === 1) onSelectNode(arr[0]);
        return arr;
      });
      return;
    }
    applySelection([id]);
  }, [applySelection, onSelectNode]);

  const handleBulkPatch = useCallback((patch: Partial<MindNode>) => {
    if (!onBulkPatch || selectedIds.length === 0) return;
    onBulkPatch(selectedIds, patch);
  }, [onBulkPatch, selectedIds]);

  const handleBulkComplete = useCallback(() => {
    if (!onBulkPatch || selectedIds.length === 0) return;
    const allDone = selectedNodes.every(n => n.completed);
    onBulkPatch(selectedIds, { completed: !allDone });
  }, [onBulkPatch, selectedIds, selectedNodes]);

  const handleBulkDelete = useCallback(() => {
    if (!onBulkDelete || selectedIds.length === 0) return;
    onBulkDelete(selectedIds);
    setSelectedIds([]);
  }, [onBulkDelete, selectedIds]);

  useEffect(() => {
    if (selectedIds.length < 2) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setSelectedIds([]);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [selectedIds.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const inOutline = containerRef.current?.contains(document.activeElement);
      const titleEl = document.querySelector(`[data-node-id="${root.id}"]`);
      const titleFocused = titleEl && document.activeElement === titleEl;

      if (mod && e.key.toLowerCase() === 'a' && (inOutline || titleFocused)) {
        e.preventDefault();
        applySelection(collectOutlineNodeIds(root));
        return;
      }

      if (selectedIds.length < 2) return;
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        handleBulkComplete();
      }
      if (mod && e.shiftKey && e.key === 'Delete') {
        e.preventDefault();
        handleBulkDelete();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [applySelection, handleBulkComplete, handleBulkDelete, root, selectedIds.length]);

  const handleContainerMouseDownCapture = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    if (target.closest('[data-outline-selection-panel]')) return;
    if ((e.metaKey || e.ctrlKey) && target.closest('[data-outline-row]')) return;

    const startX = e.clientX;
    const startY = e.clientY;
    dragStartRef.current = { x: startX, y: startY };
    isDraggingRef.current = false;
    setIsDragging(false);

    const onMove = (ev: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = Math.abs(ev.clientX - dragStartRef.current.x);
      const dy = Math.abs(ev.clientY - dragStartRef.current.y);
      if (!isDraggingRef.current) {
        if (dx <= 4 && dy <= 4) return;
        isDraggingRef.current = true;
        setIsDragging(true);
        window.getSelection()?.removeAllRanges();
        document.body.style.userSelect = 'none';
      }
      ev.preventDefault();
      setDragRect(normalizeRect(
        dragStartRef.current.x,
        dragStartRef.current.y,
        ev.clientX,
        ev.clientY,
      ));
    };

    const onUp = (ev: MouseEvent) => {
      document.body.style.userSelect = '';
      if (!dragStartRef.current) return;

      if (isDraggingRef.current && containerRef.current) {
        ev.preventDefault();
        const rect = normalizeRect(
          dragStartRef.current.x,
          dragStartRef.current.y,
          ev.clientX,
          ev.clientY,
        );
        const ids = hitTestOutlineRows(containerRef.current, rect);
        applySelection(ids);
        (document.activeElement as HTMLElement | null)?.blur();
      } else {
        const t = ev.target as HTMLElement;
        const row = t.closest<HTMLElement>('[data-outline-row]');
        const rowId = row?.dataset.outlineRow;
        if (rowId && containerRef.current?.contains(t)) {
          applySelection([rowId]);
        } else if (containerRef.current?.contains(t)) {
          clearSelection();
        }
      }

      dragStartRef.current = null;
      isDraggingRef.current = false;
      setIsDragging(false);
      setDragRect(null);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div ref={rootRef} data-outline-root="" style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
      <div
        ref={containerRef}
        data-outline-drag-area=""
        onMouseDownCapture={handleContainerMouseDownCapture}
        style={{
          flex: 1,
          minWidth: 0,
          position: 'relative',
          padding: '4px 0 48px',
          userSelect: isDragging || dragRect ? 'none' : undefined,
        }}
      >
        {root.children.map(child => (
          <OutlineItem
            key={child.id}
            node={child}
            depth={0}
            isRoot={false}
            activeNodeId={activeNodeId}
            selectedIds={selectedSet}
            multiSelectMode={multiSelectMode}
            onSelectNode={onSelectNode}
            onToggleSelect={handleToggleSelect}
            onUpdateText={onUpdateText}
            onToggleCollapse={onToggleCollapse}
            onKeyCommand={onKeyCommand}
            onRemoveImage={onRemoveImage}
            onClearMultiSelect={clearSelection}
            readOnly={readOnly}
          />
        ))}

        {dragRect && (
          <div
            style={{
              position: 'fixed',
              left: dragRect.left,
              top: dragRect.top,
              width: dragRect.right - dragRect.left,
              height: dragRect.bottom - dragRect.top,
              border: `1px solid ${MN_COLORS.primary}`,
              background: 'rgba(91, 143, 249, 0.12)',
              pointerEvents: 'none',
              zIndex: 50,
            }}
          />
        )}
      </div>

      {multiSelectMode && onBulkPatch && (
        <MindNoteOutlineSelectionPanel
          selectedIds={selectedIds}
          totalChars={countSelectedChars(root, selectedIds)}
          nodes={selectedNodes}
          onPatch={handleBulkPatch}
          onComplete={handleBulkComplete}
          onDelete={handleBulkDelete}
        />
      )}
    </div>
  );
};

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MindNode, MindNoteBranchStyle, MindNoteStructure } from '@lingyi-doc/core';
import { findMindNode, updateMindNode, commitMindmapNodeText, isMindNodePlaceholder, MIND_NODE_PLACEHOLDER } from '@lingyi-doc/core';
import {
  MindmapEngine,
  applyMindmapAction,
  childActionForGrowDirection,
  collectMindmapImageSrcs,
  getMindmapQuickActionLayout,
  preloadMindmapImages,
  resolveMindmapTextEditStyle,
  resolveTheme,
  type MindmapNodeAction,
  type MindmapTextEditStyle,
  type MindmapThemeId,
  type MindmapViewport,
} from '@lingyi-doc/mind-map';
import { MindmapNodeQuickActions } from './MindmapNodeQuickActions';
import { isImeComposing } from './ime';

export interface MindmapViewApi {
  goTargetNode: (id: string) => void;
  startTextEdit: (id: string) => void;
  fitView: () => void;
  engine: MindmapEngine;
}

export interface MindmapViewProps {
  root: MindNode;
  structure: MindNoteStructure;
  branchStyle: MindNoteBranchStyle;
  mode?: 'standalone' | 'embedded';
  themeId?: MindmapThemeId;
  zoom?: number;
  activeNodeId?: string | null;
  readOnly?: boolean;
  interactive?: boolean;
  background?: string;
  fitOnInit?: boolean;
  enableMouseWheel?: boolean;
  lockZoom?: boolean;
  onSelectNode?: (id: string | null) => void;
  onNodeTextChange?: (nodeId: string, text: string, recordHistory?: boolean) => void;
  onRootChange?: (root: MindNode, recordHistory?: boolean) => void;
  /** Tab/Enter/Delete 等节点树操作 */
  onAction?: (action: MindmapNodeAction, nodeId: string) => void;
  onZoomChange?: (zoom: number) => void;
  onReady?: (api: MindmapViewApi) => void;
  onContentSizeChange?: (size: { width: number; height: number }) => void;
  /** embedded：外层画布缩放 */
  canvasZoom?: number;
  /** 选中节点时显示「添加图片」 */
  onAddImage?: () => void;
}

function clampZoom(z: number): number {
  return Math.min(200, Math.max(25, z));
}

export const MindmapTextEditOverlay: React.FC<{
  node: MindNode;
  rect: { left: number; top: number; width: number; height: number };
  textStyle: MindmapTextEditStyle;
  readOnly?: boolean;
  onDraftChange?: (text: string) => void;
  onCommit: (text: string) => void;
  onCancel: () => void;
}> = ({ node, rect, textStyle, readOnly, onDraftChange, onCommit, onCancel }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const committedRef = useRef(false);

  const readDraft = useCallback(() => ref.current?.value ?? '', []);

  const commit = useCallback(() => {
    if (committedRef.current || composingRef.current) return;
    committedRef.current = true;
    onCommit(commitMindmapNodeText(readDraft()));
  }, [onCommit, readDraft]);

  useLayoutEffect(() => {
    committedRef.current = false;
    composingRef.current = false;
    const el = ref.current;
    if (!el) return;
    el.value = node.text ?? '';
    el.focus();
    el.select();
  }, [node.id]);

  const { textAlign, lineHeight, padding, outline: _outline, ...restTextStyle } = textStyle;

  return (
    <textarea
      ref={ref}
      readOnly={readOnly}
      placeholder={MIND_NODE_PLACEHOLDER}
      onCompositionStart={() => { composingRef.current = true; }}
      onCompositionEnd={() => {
        composingRef.current = false;
        if (!committedRef.current) onDraftChange?.(readDraft());
      }}
      onChange={() => {
        if (composingRef.current || committedRef.current) return;
        onDraftChange?.(readDraft());
      }}
      onBlur={() => commit()}
      onKeyDown={e => {
        if (isImeComposing(e)) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          committedRef.current = true;
          onCancel();
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          commit();
        }
        e.stopPropagation();
      }}
      style={{
        position: 'absolute',
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        margin: 0,
        zIndex: 10050,
        overflow: 'hidden',
        resize: 'none',
        outline: 'none',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        cursor: readOnly ? 'default' : 'text',
        textAlign,
        lineHeight: `${lineHeight}px`,
        padding,
        caretColor: textStyle.color,
        ...restTextStyle,
      }}
    />
  );
};

export const MindmapView: React.FC<MindmapViewProps> = ({
  root,
  structure,
  branchStyle,
  mode = 'standalone',
  themeId,
  zoom = 100,
  activeNodeId = null,
  readOnly = false,
  interactive = true,
  background,
  fitOnInit = true,
  enableMouseWheel = true,
  lockZoom = false,
  onSelectNode,
  onNodeTextChange,
  onRootChange,
  onAction,
  onZoomChange,
  onReady,
  onContentSizeChange,
  canvasZoom = 1,
  onAddImage,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<MindmapEngine | null>(null);
  const panRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editDraftText, setEditDraftText] = useState<string | null>(null);
  const [editRect, setEditRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [overlayTick, setOverlayTick] = useState(0);
  const lastOverlayKeyRef = useRef('');
  const rootRef = useRef(root);
  rootRef.current = root;
  const activeNodeIdRef = useRef(activeNodeId);
  activeNodeIdRef.current = activeNodeId;
  const editingNodeIdRef = useRef(editingNodeId);
  editingNodeIdRef.current = editingNodeId;
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;
  const onRootChangeRef = useRef(onRootChange);
  onRootChangeRef.current = onRootChange;
  const onSelectNodeRef = useRef(onSelectNode);
  onSelectNodeRef.current = onSelectNode;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  if (!engineRef.current) {
    engineRef.current = new MindmapEngine({
      mode,
      root,
      structure,
      branchStyle,
      themeId: themeId ?? (mode === 'embedded' ? 'whiteboard' : 'default'),
    });
  }

  const engine = engineRef.current;

  const layoutRoot = useMemo(() => {
    if (!editingNodeId || editDraftText === null) return root;
    return updateMindNode(root, editingNodeId, { text: editDraftText });
  }, [root, editingNodeId, editDraftText]);

  useEffect(() => {
    preloadMindmapImages(collectMindmapImageSrcs(root), () => {
      engine.layout(true);
    });
  }, [engine, root]);

  const dispatchAction = useCallback((action: MindmapNodeAction, nodeId: string) => {
    if (readOnlyRef.current) return;
    const handler = onActionRef.current;
    if (handler) {
      handler(action, nodeId);
      return;
    }
    const res = applyMindmapAction(rootRef.current, nodeId, action);
    if (!res) return;
    onRootChangeRef.current?.(res.root, true);
    if (res.nextActiveId) onSelectNodeRef.current?.(res.nextActiveId);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (readOnlyRef.current) return;
      if (editingNodeIdRef.current) return;
      if (e.isComposing || e.keyCode === 229) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable]')) return;

      const nodeId = activeNodeIdRef.current;
      if (!nodeId) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        dispatchAction('sibling', nodeId);
        return;
      }
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        dispatchAction('child', nodeId);
        return;
      }
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        dispatchAction('parent', nodeId);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (nodeId === rootRef.current.id) {
          startTextEdit(nodeId);
          return;
        }
        dispatchAction('delete', nodeId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatchAction]);

  useEffect(() => {
    engine.setRoot(layoutRoot);
    engine.setStructure(structure);
    engine.setBranchStyle(branchStyle);
    if (themeId) engine.setThemeId(themeId);
    if (editingNodeId && editDraftText !== null) {
      engine.layout(true);
    }
  }, [engine, layoutRoot, structure, branchStyle, themeId, editingNodeId, editDraftText]);

  useEffect(() => {
    if (mode !== 'standalone' || lockZoom) return;
    engine.setViewport({ zoom: zoom / 100 });
  }, [engine, mode, lockZoom, zoom]);

  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w <= 0 || h <= 0) return;

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (mode === 'standalone') {
      engine.paintStandalone(ctx, w, h, {
        activeNodeId,
        hideNodeTextId: editingNodeId,
      });
    } else {
      ctx.clearRect(0, 0, w, h);
      engine.paintEmbedded(ctx, {
        activeNodeId,
        hideNodeTextId: editingNodeId,
      });
    }

    const trackId = editingNodeId ?? activeNodeId;
    if (trackId) {
      const nodeRect = engine.getNodeRect(trackId);
      if (nodeRect) {
        const vp = engine.getViewport();
        const scale = mode === 'standalone' ? vp.zoom : canvasZoom;
        const overlayKey = mode === 'standalone'
          ? `${trackId}|${vp.x}|${vp.y}|${vp.zoom}|${nodeRect.x}|${nodeRect.y}|${nodeRect.width}|${nodeRect.height}`
          : `${trackId}|${canvasZoom}|${nodeRect.x}|${nodeRect.y}|${nodeRect.width}|${nodeRect.height}`;
        if (overlayKey !== lastOverlayKeyRef.current) {
          lastOverlayKeyRef.current = overlayKey;
          setOverlayTick(v => v + 1);
        }
      }
    } else if (lastOverlayKeyRef.current) {
      lastOverlayKeyRef.current = '';
      setOverlayTick(v => v + 1);
    }
  }, [engine, mode, activeNodeId, editingNodeId, canvasZoom]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      renderFrame();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [renderFrame]);

  useEffect(() => {
    if (mode !== 'embedded' || !onContentSizeChange) return;
    const bounds = engine.measureElementSize();
    onContentSizeChange({ width: bounds.width, height: bounds.height });
  }, [engine, mode, onContentSizeChange, root, structure, branchStyle]);

  useEffect(() => {
    if (mode !== 'standalone' || !fitOnInit) return;
    const container = containerRef.current;
    if (!container) return;
    engine.fitView(container.clientWidth, container.clientHeight);
    const vp = engine.getViewport();
    onZoomChange?.(Math.round(vp.zoom * 100));
  }, [engine, mode, fitOnInit, structure, branchStyle]);

  const screenToLocal = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (mode === 'standalone') {
      const vp = engine.getViewport();
      return {
        x: (x - vp.x) / vp.zoom,
        y: (y - vp.y) / vp.zoom,
      };
    }
    return { x: x / canvasZoom, y: y / canvasZoom };
  }, [engine, mode, canvasZoom]);

  const startTextEdit = useCallback((nodeId: string) => {
    if (readOnly) return;
    const container = containerRef.current;
    if (!container) return;
    const nodeRect = engine.getNodeRect(nodeId);
    if (!nodeRect) return;

    if (mode === 'standalone') {
      const vp = engine.getViewport();
      setEditRect({
        left: vp.x + nodeRect.x * vp.zoom,
        top: vp.y + nodeRect.y * vp.zoom,
        width: nodeRect.width * vp.zoom,
        height: nodeRect.height * vp.zoom,
      });
    } else {
      setEditRect({
        left: nodeRect.x * canvasZoom,
        top: nodeRect.y * canvasZoom,
        width: nodeRect.width * canvasZoom,
        height: nodeRect.height * canvasZoom,
      });
    }
    setEditingNodeId(nodeId);
    const found = findMindNode(rootRef.current, nodeId);
    const nodeText = found?.node.text ?? '';
    setEditDraftText(isMindNodePlaceholder(nodeText) ? '' : nodeText);
    onSelectNode?.(nodeId);
  }, [engine, mode, readOnly, canvasZoom, onSelectNode]);

  useEffect(() => {
    onReady?.({
      goTargetNode: (id: string) => onSelectNode?.(id),
      startTextEdit,
      fitView: () => {
        const container = containerRef.current;
        if (!container) return;
        engine.fitView(container.clientWidth, container.clientHeight);
        onZoomChange?.(Math.round(engine.getViewport().zoom * 100));
      },
      engine,
    });
  }, [onReady, onSelectNode, startTextEdit, engine, onZoomChange]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!interactive || readOnly) return;
    if (e.button !== 0) return;
    const local = screenToLocal(e.clientX, e.clientY);
    if (!local) return;

    const hit = engine.hitTest(local.x, local.y);
    if (hit.kind === 'collapseButton' && hit.nodeId) {
      dispatchAction('toggleCollapse', hit.nodeId);
      onSelectNode?.(hit.nodeId);
      return;
    }
    if (hit.kind === 'node' && hit.nodeId) {
      if (editingNodeIdRef.current && editingNodeIdRef.current !== hit.nodeId) {
        setEditingNodeId(null);
        setEditRect(null);
        setEditDraftText(null);
      }
      onSelectNode?.(hit.nodeId);
      return;
    }

    if (editingNodeIdRef.current) {
      setEditingNodeId(null);
      setEditRect(null);
      setEditDraftText(null);
    }
    onSelectNode?.(null);

    if (mode === 'standalone' && !lockZoom) {
      panRef.current = { x: e.clientX, y: e.clientY, startX: engine.getViewport().x, startY: engine.getViewport().y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const pan = panRef.current;
    if (!pan) return;
    const dx = e.clientX - pan.x;
    const dy = e.clientY - pan.y;
    engine.setViewport({ x: pan.startX + dx, y: pan.startY + dy });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (panRef.current) {
      panRef.current = null;
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!interactive || readOnly) return;
    const local = screenToLocal(e.clientX, e.clientY);
    if (!local) return;
    const hit = engine.hitTest(local.x, local.y);
    if (hit.kind === 'node' && hit.nodeId) {
      startTextEdit(hit.nodeId);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!interactive || !enableMouseWheel || lockZoom || mode !== 'standalone') return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -5 : 5;
    const next = clampZoom(Math.round(engine.getViewport().zoom * 100) + delta);
    engine.setViewport({ zoom: next / 100 });
    onZoomChange?.(next);
  };

  const editingNode = editingNodeId ? findMindNode(root, editingNodeId)?.node : null;
  const theme = resolveTheme(themeId ?? (mode === 'embedded' ? 'whiteboard' : 'default'));
  void overlayTick;

  const getNodeScreenRect = (nodeId: string) => {
    const nodeRect = engine.getNodeRect(nodeId);
    if (!nodeRect) return null;
    if (mode === 'standalone') {
      const vp = engine.getViewport();
      return {
        left: vp.x + nodeRect.x * vp.zoom,
        top: vp.y + nodeRect.y * vp.zoom,
        width: nodeRect.width * vp.zoom,
        height: nodeRect.height * vp.zoom,
        zoom: vp.zoom,
      };
    }
    return {
      left: nodeRect.x * canvasZoom,
      top: nodeRect.y * canvasZoom,
      width: nodeRect.width * canvasZoom,
      height: nodeRect.height * canvasZoom,
      zoom: canvasZoom,
    };
  };

  const editingLayoutNode = editingNodeId
    ? engine.layout().nodes.find(n => n.id === editingNodeId) ?? null
    : null;
  const editingTextStyle = editingNode && editingLayoutNode
    ? resolveMindmapTextEditStyle(
      editingNode,
      editingLayoutNode,
      theme,
      getNodeScreenRect(editingNodeId!)?.zoom ?? 1,
    )
    : null;

  const activeLayoutNode = activeNodeId && !editingNodeId
    ? engine.layout().nodes.find(n => n.id === activeNodeId) ?? null
    : null;
  const selectionScreenRect = activeLayoutNode ? getNodeScreenRect(activeNodeId!) : null;
  const quickActions = activeLayoutNode
    ? getMindmapQuickActionLayout(activeLayoutNode, structure)
    : null;
  const showQuickActions = !!(
    selectionScreenRect
    && quickActions
    && activeLayoutNode
    && interactive
    && !readOnly
    && (onAction || onActionRef.current || onRootChange || onRootChangeRef.current)
  );

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: mode === 'embedded' ? 'visible' : 'hidden',
        background: background ?? (mode === 'embedded' ? 'transparent' : '#F7F8FA'),
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onWheel={handleWheel}
      tabIndex={interactive && !readOnly ? 0 : undefined}
      onKeyDown={e => e.stopPropagation()}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      {showQuickActions && selectionScreenRect && quickActions && activeLayoutNode && (
        <MindmapNodeQuickActions
          actions={quickActions}
          screenRect={selectionScreenRect}
          layoutOrigin={{ x: activeLayoutNode.x, y: activeLayoutNode.y }}
          accent={theme.accent}
          onAddSiblingBefore={() => activeNodeId && dispatchAction('siblingBefore', activeNodeId)}
          onAddSiblingAfter={() => activeNodeId && dispatchAction('siblingAfter', activeNodeId)}
          onAddChild={dir => activeNodeId && dispatchAction(childActionForGrowDirection(dir), activeNodeId)}
        />
      )}
      {editingNode && editRect && editingTextStyle && (
        <MindmapTextEditOverlay
          node={editingNode}
          rect={editRect}
          textStyle={editingTextStyle}
          readOnly={readOnly}
          onDraftChange={setEditDraftText}
          onCommit={text => {
            setEditingNodeId(null);
            setEditRect(null);
            setEditDraftText(null);
            if (editingNodeId) onNodeTextChange?.(editingNodeId, text);
          }}
          onCancel={() => {
            setEditingNodeId(null);
            setEditRect(null);
            setEditDraftText(null);
          }}
        />
      )}
    </div>
  );
};

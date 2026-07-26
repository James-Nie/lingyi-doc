import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MindNode, MindNoteBranchStyle, MindNoteStructure } from '@lingyi-doc/core-mindmap';
import {
  findMindNode,
  updateMindNode,
  commitMindmapNodeText,
  isMindNodePlaceholder,
  MIND_NODE_PLACEHOLDER,
} from '@lingyi-doc/core-mindmap';
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
} from '@lingyi-doc/mind-map';
import { MindmapNodeQuickActions } from './MindmapNodeQuickActions';
import {
  MindmapNodeImageSelection,
  type MindmapImageResizeHandle,
} from './MindmapNodeImageSelection';
import {
  DEFAULT_MINDMAP_CONTEXT_MENU_PLUGINS,
  MindmapContextMenu,
  buildContextMenuRuntimeFlags,
  createMindmapContextMenuRegistry,
  executeBuiltinContextMenuAction,
  type MindmapContextMenuPlugin,
  type MindmapContextTarget,
} from './contextMenu';
import { isImeComposing } from './ime';

export interface MindmapViewApi {
  goTargetNode: (id: string) => void;
  startTextEdit: (id: string) => void;
  /** 提交进行中的文本编辑（切视图前调用，避免丢草稿） */
  flushTextEdit: () => void;
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
  /**
   * 右键菜单插件。默认使用内置插件；传入时完全替换。
   * 若只需追加，请用 `extraContextMenuPlugins`。
   */
  contextMenuPlugins?: MindmapContextMenuPlugin[];
  /** 追加到默认插件之后（可插拔扩展点） */
  extraContextMenuPlugins?: MindmapContextMenuPlugin[];
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
  contextMenuPlugins,
  extraContextMenuPlugins,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<MindmapEngine | null>(null);
  const panRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editDraftText, setEditDraftText] = useState<string | null>(null);
  const [editRect, setEditRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [selectedImageNodeId, setSelectedImageNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: MindmapContextTarget;
    nodeId: string;
  } | null>(null);
  const [menuFlags, setMenuFlags] = useState(buildContextMenuRuntimeFlags);
  const [imageResizeDraft, setImageResizeDraft] = useState<{
    nodeId: string;
    width: number;
    height: number;
  } | null>(null);
  const [overlayTick, setOverlayTick] = useState(0);
  const lastOverlayKeyRef = useRef('');
  const imageResizeRef = useRef<{
    nodeId: string;
    handle: MindmapImageResizeHandle;
    startClientX: number;
    startClientY: number;
    startW: number;
    startH: number;
    aspect: number;
    zoom: number;
  } | null>(null);
  const selectedImageNodeIdRef = useRef<string | null>(null);
  selectedImageNodeIdRef.current = selectedImageNodeId;
  const imageResizeDraftRef = useRef(imageResizeDraft);
  imageResizeDraftRef.current = imageResizeDraft;
  const rootRef = useRef(root);
  rootRef.current = root;
  const activeNodeIdRef = useRef(activeNodeId);
  activeNodeIdRef.current = activeNodeId;
  const editingNodeIdRef = useRef(editingNodeId);
  editingNodeIdRef.current = editingNodeId;
  const editDraftTextRef = useRef(editDraftText);
  editDraftTextRef.current = editDraftText;
  const onNodeTextChangeRef = useRef(onNodeTextChange);
  onNodeTextChangeRef.current = onNodeTextChange;
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;
  const onRootChangeRef = useRef(onRootChange);
  onRootChangeRef.current = onRootChange;
  const onSelectNodeRef = useRef(onSelectNode);
  onSelectNodeRef.current = onSelectNode;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const startTextEditRef = useRef<(nodeId: string) => void>(() => {});

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
    let next = root;
    if (editingNodeId && editDraftText !== null) {
      next = updateMindNode(next, editingNodeId, { text: editDraftText });
    }
    if (imageResizeDraft) {
      next = updateMindNode(next, imageResizeDraft.nodeId, {
        imageWidth: imageResizeDraft.width,
        imageHeight: imageResizeDraft.height,
      });
    }
    return next;
  }, [root, editingNodeId, editDraftText, imageResizeDraft]);

  useEffect(() => {
    if (!selectedImageNodeId) return;
    const found = findMindNode(root, selectedImageNodeId);
    if (!found?.node.image) setSelectedImageNodeId(null);
  }, [root, selectedImageNodeId]);

  useEffect(() => {
    preloadMindmapImages(collectMindmapImageSrcs(root), () => {
      engine.layout(true);
    });
  }, [engine, root]);

  const patchNodeImage = useCallback((nodeId: string, patch: Partial<MindNode>, recordHistory = true) => {
    if (readOnlyRef.current) return;
    onRootChangeRef.current?.(updateMindNode(rootRef.current, nodeId, patch), recordHistory);
  }, []);

  const clearNodeImage = useCallback((nodeId: string) => {
    patchNodeImage(nodeId, {
      image: undefined,
      imageWidth: undefined,
      imageHeight: undefined,
      imageFlipH: undefined,
      imageFlipV: undefined,
    });
    setSelectedImageNodeId(null);
    setContextMenu(null);
  }, [patchNodeImage]);

  const contextMenuRegistry = useMemo(
    () => createMindmapContextMenuRegistry([
      ...(contextMenuPlugins ?? DEFAULT_MINDMAP_CONTEXT_MENU_PLUGINS),
      ...(extraContextMenuPlugins ?? []),
    ]),
    [contextMenuPlugins, extraContextMenuPlugins],
  );

  const buildMenuContext = useCallback((target: MindmapContextTarget, nodeId: string) => {
    const found = findMindNode(rootRef.current, nodeId);
    const flags = buildContextMenuRuntimeFlags();
    return {
      target,
      nodeId,
      node: found?.node ?? null,
      root: rootRef.current,
      readOnly: readOnlyRef.current,
      // 允许尝试粘贴（内存剪贴板或系统图片）
      canPaste: true,
      canPasteStyle: flags.canPasteStyle,
    };
  }, []);

  const openContextMenu = useCallback((
    clientX: number,
    clientY: number,
    target: MindmapContextTarget,
    nodeId: string,
  ) => {
    setMenuFlags(buildContextMenuRuntimeFlags());
    setContextMenu({ x: clientX, y: clientY, target, nodeId });
  }, []);

  const handleContextMenuAction = useCallback(async (actionId: string) => {
    if (!contextMenu) return;
    const ctx = buildMenuContext(contextMenu.target, contextMenu.nodeId);
    const handled = await contextMenuRegistry.execute(actionId, ctx);
    if (!handled) {
      await executeBuiltinContextMenuAction(actionId, ctx, {
        dispatchNodeAction: (action, nodeId) => dispatchActionRef.current(action, nodeId),
        onRootChange: (next, record) => onRootChangeRef.current?.(next, record),
        onSelectNode: id => onSelectNodeRef.current?.(id),
        clearNodeImage,
        setSelectedImageNodeId,
      });
    }
    setMenuFlags(buildContextMenuRuntimeFlags());
    setContextMenu(null);
  }, [buildMenuContext, clearNodeImage, contextMenu, contextMenuRegistry]);

  const dispatchActionRef = useRef<(action: MindmapNodeAction, nodeId: string) => void>(() => {});

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
  dispatchActionRef.current = dispatchAction;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (readOnlyRef.current) return;
      if (editingNodeIdRef.current) return;
      if (e.isComposing || e.keyCode === 229) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable]')) return;

      const imageNodeId = selectedImageNodeIdRef.current;
      const mod = e.metaKey || e.ctrlKey;
      const alt = e.altKey;

      if (imageNodeId) {
        const run = (actionId: string) => {
          e.preventDefault();
          const ctx = buildMenuContext('nodeImage', imageNodeId);
          void (async () => {
            const handled = await contextMenuRegistry.execute(actionId, ctx);
            if (!handled) {
              await executeBuiltinContextMenuAction(actionId, ctx, {
                dispatchNodeAction: (a, id) => dispatchActionRef.current(a, id),
                onRootChange: (next, record) => onRootChangeRef.current?.(next, record),
                onSelectNode: id => onSelectNodeRef.current?.(id),
                clearNodeImage,
                setSelectedImageNodeId,
              });
            }
          })();
        };
        if (mod && e.key.toLowerCase() === 'c') {
          run(e.shiftKey ? 'copyImage' : 'copy');
          return;
        }
        if (mod && e.key.toLowerCase() === 'v') {
          run('paste');
          return;
        }
        if (mod && e.key.toLowerCase() === 'd') {
          run('duplicate');
          return;
        }
        if (e.shiftKey && !mod && e.key.toLowerCase() === 'h') {
          run('flipH');
          return;
        }
        if (e.shiftKey && !mod && e.key.toLowerCase() === 'v') {
          run('flipV');
          return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          run('deleteImage');
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setSelectedImageNodeId(null);
          setContextMenu(null);
          return;
        }
      }

      const nodeId = activeNodeIdRef.current;
      if (!nodeId) return;

      if (mod && alt && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        const ctx = buildMenuContext('node', nodeId);
        void executeBuiltinContextMenuAction('copyStyle', ctx, {
          dispatchNodeAction: (a, id) => dispatchActionRef.current(a, id),
          onRootChange: (next, record) => onRootChangeRef.current?.(next, record),
          onSelectNode: id => onSelectNodeRef.current?.(id),
        });
        return;
      }
      if (mod && alt && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        const ctx = buildMenuContext('node', nodeId);
        void executeBuiltinContextMenuAction('pasteStyle', ctx, {
          dispatchNodeAction: (a, id) => dispatchActionRef.current(a, id),
          onRootChange: (next, record) => onRootChangeRef.current?.(next, record),
          onSelectNode: id => onSelectNodeRef.current?.(id),
        });
        return;
      }
      if (mod && alt && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        const ctx = buildMenuContext('node', nodeId);
        void executeBuiltinContextMenuAction('lock', ctx, {
          dispatchNodeAction: (a, id) => dispatchActionRef.current(a, id),
          onRootChange: (next, record) => onRootChangeRef.current?.(next, record),
          onSelectNode: id => onSelectNodeRef.current?.(id),
        });
        return;
      }

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
        const found = findMindNode(rootRef.current, nodeId);
        if (found?.node.locked) return;
        if (nodeId === rootRef.current.id) {
          startTextEditRef.current(nodeId);
          return;
        }
        dispatchAction('delete', nodeId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [buildMenuContext, clearNodeImage, contextMenuRegistry, dispatchAction]);

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
        activeNodeId: selectedImageNodeId ? null : activeNodeId,
        hideNodeTextId: editingNodeId,
      });
    } else {
      ctx.clearRect(0, 0, w, h);
      engine.paintEmbedded(ctx, {
        activeNodeId: selectedImageNodeId ? null : activeNodeId,
        hideNodeTextId: editingNodeId,
      });
    }

    const trackId = editingNodeId ?? selectedImageNodeId ?? activeNodeId;
    if (trackId) {
      const nodeRect = selectedImageNodeId
        ? engine.getNodeImageRect(selectedImageNodeId)
        : engine.getNodeRect(trackId);
      if (nodeRect) {
        const vp = engine.getViewport();
        const scale = mode === 'standalone' ? vp.zoom : canvasZoom;
        const overlayKey = mode === 'standalone'
          ? `${selectedImageNodeId ? 'img:' : ''}${trackId}|${vp.x}|${vp.y}|${vp.zoom}|${nodeRect.x}|${nodeRect.y}|${nodeRect.width}|${nodeRect.height}`
          : `${selectedImageNodeId ? 'img:' : ''}${trackId}|${canvasZoom}|${nodeRect.x}|${nodeRect.y}|${nodeRect.width}|${nodeRect.height}`;
        if (overlayKey !== lastOverlayKeyRef.current) {
          lastOverlayKeyRef.current = overlayKey;
          setOverlayTick(v => v + 1);
        }
      }
    } else if (lastOverlayKeyRef.current) {
      lastOverlayKeyRef.current = '';
      setOverlayTick(v => v + 1);
    }
  }, [engine, mode, activeNodeId, editingNodeId, selectedImageNodeId, canvasZoom]);

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
    const locked = findMindNode(rootRef.current, nodeId)?.node.locked;
    if (locked) return;
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
  startTextEditRef.current = startTextEdit;

  const flushTextEdit = useCallback(() => {
    const id = editingNodeIdRef.current;
    const draft = editDraftTextRef.current;
    if (!id || draft === null) {
      setEditingNodeId(null);
      setEditRect(null);
      setEditDraftText(null);
      return;
    }
    onNodeTextChangeRef.current?.(id, commitMindmapNodeText(draft));
    setEditingNodeId(null);
    setEditRect(null);
    setEditDraftText(null);
  }, []);

  useEffect(() => {
    onReady?.({
      goTargetNode: (id: string) => onSelectNode?.(id),
      startTextEdit,
      flushTextEdit,
      fitView: () => {
        const container = containerRef.current;
        if (!container) return;
        engine.fitView(container.clientWidth, container.clientHeight);
        onZoomChange?.(Math.round(engine.getViewport().zoom * 100));
      },
      engine,
    });
  }, [onReady, onSelectNode, startTextEdit, flushTextEdit, engine, onZoomChange]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!interactive || readOnly) return;
    if (e.button !== 0) return;
    const local = screenToLocal(e.clientX, e.clientY);
    if (!local) return;

    const hit = engine.hitTest(local.x, local.y);
    if (hit.kind === 'collapseButton' && hit.nodeId) {
      setSelectedImageNodeId(null);
      setContextMenu(null);
      dispatchAction('toggleCollapse', hit.nodeId);
      onSelectNode?.(hit.nodeId);
      return;
    }
    if (hit.kind === 'nodeImage' && hit.nodeId) {
      if (editingNodeIdRef.current) {
        setEditingNodeId(null);
        setEditRect(null);
        setEditDraftText(null);
      }
      setSelectedImageNodeId(hit.nodeId);
      setContextMenu(null);
      onSelectNode?.(hit.nodeId);
      return;
    }
    if (hit.kind === 'node' && hit.nodeId) {
      setSelectedImageNodeId(null);
      setContextMenu(null);
      if (editingNodeIdRef.current && editingNodeIdRef.current !== hit.nodeId) {
        setEditingNodeId(null);
        setEditRect(null);
        setEditDraftText(null);
      }
      onSelectNode?.(hit.nodeId);
      return;
    }

    setSelectedImageNodeId(null);
    setContextMenu(null);
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
    const resize = imageResizeRef.current;
    if (resize) {
      const dx = (e.clientX - resize.startClientX) / resize.zoom;
      const dy = (e.clientY - resize.startClientY) / resize.zoom;
      let w = resize.startW;
      let h = resize.startH;
      const { handle } = resize;
      if (handle.includes('e')) w = resize.startW + dx;
      if (handle.includes('w')) w = resize.startW - dx;
      if (handle.includes('s')) h = resize.startH + dy;
      if (handle.includes('n')) h = resize.startH - dy;
      if (handle.length === 2) {
        w = Math.max(24, w);
        h = Math.max(24, Math.round(w / resize.aspect));
      } else {
        w = Math.max(24, w);
        h = Math.max(24, h);
      }
      setImageResizeDraft({
        nodeId: resize.nodeId,
        width: Math.round(w),
        height: Math.round(h),
      });
      return;
    }
    const pan = panRef.current;
    if (!pan) return;
    const dx = e.clientX - pan.x;
    const dy = e.clientY - pan.y;
    engine.setViewport({ x: pan.startX + dx, y: pan.startY + dy });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const resize = imageResizeRef.current;
    if (resize) {
      imageResizeRef.current = null;
      const draft = imageResizeDraftRef.current;
      if (draft && draft.nodeId === resize.nodeId) {
        patchNodeImage(draft.nodeId, {
          imageWidth: draft.width,
          imageHeight: draft.height,
        }, true);
      }
      setImageResizeDraft(null);
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      return;
    }
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
    if (hit.kind === 'nodeImage') return;
    if (hit.kind === 'node' && hit.nodeId) {
      setSelectedImageNodeId(null);
      startTextEdit(hit.nodeId);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!interactive || readOnly) return;
    const local = screenToLocal(e.clientX, e.clientY);
    if (!local) return;
    const hit = engine.hitTest(local.x, local.y);
    if (hit.kind === 'nodeImage' && hit.nodeId) {
      e.preventDefault();
      setSelectedImageNodeId(hit.nodeId);
      onSelectNode?.(hit.nodeId);
      openContextMenu(e.clientX, e.clientY, 'nodeImage', hit.nodeId);
      return;
    }
    if (hit.kind === 'node' && hit.nodeId) {
      e.preventDefault();
      setSelectedImageNodeId(null);
      onSelectNode?.(hit.nodeId);
      openContextMenu(e.clientX, e.clientY, 'node', hit.nodeId);
    }
  };

  const handleImageResizeStart = (handle: MindmapImageResizeHandle, e: React.PointerEvent) => {
    if (!selectedImageNodeId || readOnly) return;
    const imgRect = engine.getNodeImageRect(selectedImageNodeId);
    if (!imgRect) return;
    const zoom = mode === 'standalone' ? engine.getViewport().zoom : canvasZoom;
    imageResizeRef.current = {
      nodeId: selectedImageNodeId,
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startW: imgRect.width,
      startH: imgRect.height,
      aspect: imgRect.width / Math.max(1, imgRect.height),
      zoom,
    };
    setImageResizeDraft({
      nodeId: selectedImageNodeId,
      width: imgRect.width,
      height: imgRect.height,
    });
    (containerRef.current as HTMLElement | null)?.setPointerCapture(e.pointerId);
  };

  const handleWheel = useCallback((e: WheelEvent) => {
    if (!interactive || !enableMouseWheel || lockZoom || mode !== 'standalone') return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -5 : 5;
    const next = clampZoom(Math.round(engine.getViewport().zoom * 100) + delta);
    engine.setViewport({ zoom: next / 100 });
    onZoomChange?.(next);
  }, [interactive, enableMouseWheel, lockZoom, mode, engine, onZoomChange]);

  // React onWheel 为 passive，无法 preventDefault；需原生非 passive 监听
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

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

  const getImageScreenRect = (nodeId: string) => {
    const imgRect = engine.getNodeImageRect(nodeId);
    if (!imgRect) return null;
    if (mode === 'standalone') {
      const vp = engine.getViewport();
      return {
        left: vp.x + imgRect.x * vp.zoom,
        top: vp.y + imgRect.y * vp.zoom,
        width: imgRect.width * vp.zoom,
        height: imgRect.height * vp.zoom,
      };
    }
    return {
      left: imgRect.x * canvasZoom,
      top: imgRect.y * canvasZoom,
      width: imgRect.width * canvasZoom,
      height: imgRect.height * canvasZoom,
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

  const activeLayoutNode = activeNodeId && !editingNodeId && !selectedImageNodeId
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
  const imageScreenRect = selectedImageNodeId && !editingNodeId
    ? getImageScreenRect(selectedImageNodeId)
    : null;

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
      onContextMenu={handleContextMenu}
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
      {imageScreenRect && selectedImageNodeId && (
        <MindmapNodeImageSelection
          rect={imageScreenRect}
          accent={theme.accent}
          readOnly={readOnly}
          onResizeStart={handleImageResizeStart}
          onContextMenu={e => {
            e.preventDefault();
            e.stopPropagation();
            openContextMenu(e.clientX, e.clientY, 'nodeImage', selectedImageNodeId);
          }}
        />
      )}
      {contextMenu && (() => {
        const ctx = buildMenuContext(contextMenu.target, contextMenu.nodeId);
        // 打开瞬间刷新样式粘贴可用性
        ctx.canPasteStyle = menuFlags.canPasteStyle;
        const entries = contextMenuRegistry.resolve(ctx);
        if (!entries.length) return null;
        return (
          <MindmapContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            entries={entries}
            onClose={() => setContextMenu(null)}
            onAction={actionId => { void handleContextMenuAction(actionId); }}
          />
        );
      })()}
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

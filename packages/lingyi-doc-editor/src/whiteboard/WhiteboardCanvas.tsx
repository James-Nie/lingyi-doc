import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AnchorId,
  ConnectorBind,
  ConnectorElement,
  MindmapElement,
  SectionElement,
  ShapeElement,
  TextElement,
  WhiteboardElement,
  WhiteboardPoint,
  WhiteboardViewport,
} from '@lingyi-doc/core';
import {
  createConnectorElement,
  createMindmapElement,
  createPenStroke,
  createSectionElement,
  createShapeElement,
  createStickyElement,
  createTableElement,
  createTextElement,
  cloneWhiteboardElement,
  getSectionAspectRatio,
  makeConnectorBind,
  genWhiteboardId,
  nextZIndex,
  isFixedSectionAspect,
} from '@lingyi-doc/core';
import { getBoardConnectorEndpoints, syncBoardConnectors } from './boardConnector';
import { WbMindmapCanvasLayer } from './mindmap/WbMindmapCanvasLayer';
import { hitMindmapNodeAtPoint } from './canvas/mindmapHitTest';
import { hitShapeQuickAdd, createAdjacentShape, createQuickAddConnector, type ShapeQuickAddSide } from './canvas/shapeQuickAdd';
import { createWhiteboardImageElement, loadImageFromBlob } from './pasteImage';
import type { WbMindmapEditProps } from './mindmap/WbMindmapView';
import type { MindmapBoundsUpdate } from './mindmap/syncMindmapBounds';
import type { WhiteboardToolState } from './WhiteboardToolbar';
import { WB_COLORS } from './styles';
import {
  CanvasInlineEditor,
  elementBoxFromVisualBounds,
  getShapeVisualBounds,
  hitConnectorEndpoint,
  hitElementAtPoint,
  hitResizeHandle,
  resizeHandleCursor,
  findConnectionSnap,
  findHoverConnectable,
  isAlignableElementType,
  paintWhiteboard,
  preloadElementImages,
  snapBoxBounds,
  snapBoxPosition,
  snapResizeBox,
  unionBounds,
  type AlignmentGuide,
} from './canvas';
import { ShapeFormatToolbar } from './ShapeFormatToolbar';
import { SelectionLockBadge } from './SelectionLockBadge';
import { selectionBounds } from './elementActions';
import {
  constrainRectToAspectRatio,
  expandIdsWithSectionContents,
  findElementsInSection,
  sectionCreateLockAspect,
  sectionResizeLockAspect,
} from './sectionUtils';
import {
  clampZoom,
  elementBounds,
  fitViewportToElements,
  normalizeWheelDelta,
  panViewport,
  rectsIntersect,
  resizeElement,
  screenToCanvasPoint,
  snapToGrid,
  translateElement,
  zoomAtPointer,
  type ResizeHandle,
} from './viewportUtils';

interface WhiteboardCanvasProps {
  elements: WhiteboardElement[];
  viewport: WhiteboardViewport;
  selectedIds: string[];
  toolState: WhiteboardToolState;
  panMode: boolean;
  spaceHeld?: boolean;
  readOnly?: boolean;
  onViewportChange: (vp: Partial<WhiteboardViewport>) => void;
  onElementsChange: (elements: WhiteboardElement[], recordHistory?: boolean) => void;
  onSelectionChange: (ids: string[]) => void;
  onElementUpdate: (id: string, patch: Partial<WhiteboardElement>, recordHistory?: boolean) => void;
  onToolChange?: (patch: Partial<WhiteboardToolState>) => void;
  onFitView?: () => void;
  mindmapEditElementId?: string | null;
  mindmapActiveNodeId?: string | null;
  onMindmapEditElementChange?: (id: string | null) => void;
  onMindmapActiveNodeChange?: (id: string | null) => void;
  onMindmapFocus?: (id: string) => void;
  onMindmapDragStart?: (e: React.PointerEvent, id: string) => void;
  buildMindmapEditProps?: (el: MindmapElement) => WbMindmapEditProps | undefined;
  suppressFloatingToolbar?: boolean;
  onToggleLock?: () => void;
  onContextMenu?: (payload: {
    clientX: number;
    clientY: number;
    targetId: string | null;
  }) => void;
}

type DragState =
  | { kind: 'pan'; startX: number; startY: number; originVp: WhiteboardViewport }
  | { kind: 'move'; startX: number; startY: number; origins: Map<string, WhiteboardElement>; snap: boolean; active: boolean }
  | { kind: 'resize'; handle: ResizeHandle; startX: number; startY: number; id: string; origin: { x: number; y: number; w: number; h: number }; lockAspect: boolean; shapeKind?: import('@lingyi-doc/core').ShapeKind; sectionChildOrigins?: Map<string, WhiteboardElement> }
  | { kind: 'marquee'; start: WhiteboardPoint; current: WhiteboardPoint }
  | { kind: 'create'; start: WhiteboardPoint; lockAspect: boolean; sectionAspect?: import('@lingyi-doc/core').SectionAspect }
  | { kind: 'pen'; points: WhiteboardPoint[] }
  | { kind: 'connector'; start: WhiteboardPoint; current: WhiteboardPoint; startBind?: ConnectorBind }
  | { kind: 'connector-endpoint'; connectorId: string; end: 'start' | 'end'; origin: ConnectorElement };

const DRAG_THRESHOLD = 4;

function isTextEditableElement(el: WhiteboardElement): boolean {
  return el.type === 'shape' || el.type === 'text' || el.type === 'sticky';
}

function dist(a: WhiteboardPoint, b: WhiteboardPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizeRect(a: WhiteboardPoint, b: WhiteboardPoint) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}

export const WhiteboardCanvas = React.forwardRef<HTMLDivElement, WhiteboardCanvasProps>(function WhiteboardCanvas({
  elements,
  viewport,
  selectedIds,
  toolState,
  panMode,
  spaceHeld = false,
  readOnly,
  onViewportChange,
  onElementsChange,
  onSelectionChange,
  onElementUpdate,
  onToolChange,
  mindmapEditElementId = null,
  mindmapActiveNodeId = null,
  onMindmapEditElementChange,
  onMindmapActiveNodeChange,
  onMindmapFocus,
  onMindmapDragStart,
  buildMindmapEditProps,
  suppressFloatingToolbar = false,
  onToggleLock,
  onContextMenu,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEditFocus, setInlineEditFocus] = useState<'select-all' | 'end'>('select-all');
  const [paintTick, setPaintTick] = useState(0);
  const elementsRef = useRef(elements);
  const viewportRef = useRef(viewport);
  const selectedRef = useRef(selectedIds);
  elementsRef.current = elements;
  viewportRef.current = viewport;
  selectedRef.current = selectedIds;

  const dragRef = useRef<DragState | null>(null);
  const mindmapLayerNodesRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [draftElements, setDraftElements] = useState<WhiteboardElement[] | null>(null);
  const [draftViewport, setDraftViewport] = useState<WhiteboardViewport | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [livePenPoints, setLivePenPoints] = useState<WhiteboardPoint[] | null>(null);
  const [liveConnector, setLiveConnector] = useState<{ start: WhiteboardPoint; end: WhiteboardPoint } | null>(null);
  const [createPreview, setCreatePreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [connectTarget, setConnectTarget] = useState<{ elementId: string; anchor: AnchorId } | null>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);
  const [shapeQuickAddHover, setShapeQuickAddHover] = useState<ShapeQuickAddSide | null>(null);
  const [resizeHoverHandle, setResizeHoverHandle] = useState<ResizeHandle | null>(null);

  const isPanTool = panMode || toolState.tool === 'pan' || spaceHeld;

  const revertToSelectAfterCreate = useCallback(() => {
    if (toolState.tool !== 'select' && toolState.tool !== 'pan') {
      onToolChange?.({ tool: 'select' });
    }
  }, [toolState.tool, onToolChange]);

  const renderElements = draftElements ?? elements;
  const renderViewport = draftViewport ? { ...viewport, ...draftViewport } : viewport;

  const getCanvasPoint = useCallback((clientX: number, clientY: number): WhiteboardPoint => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return screenToCanvasPoint(clientX, clientY, rect, renderViewport);
  }, [renderViewport]);

  const cursor = useMemo(() => {
    if (resizeHoverHandle) return resizeHandleCursor(resizeHoverHandle);
    if (shapeQuickAddHover) return 'pointer';
    if (isDragging && (dragRef.current?.kind === 'pan' || isPanTool)) return 'grabbing';
    if (isPanTool) return 'grab';
    if (toolState.tool === 'pen') return 'crosshair';
    if (toolState.tool === 'select') return 'default';
    return 'crosshair';
  }, [isDragging, isPanTool, resizeHoverHandle, shapeQuickAddHover, toolState.tool]);

  const openTextEdit = useCallback((id: string, focus: 'select-all' | 'end' = 'select-all') => {
    onSelectionChange([id]);
    setInlineEditFocus(focus);
    setInlineEditId(id);
    lastClickRef.current = null;
  }, [onSelectionChange]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (readOnly) return;
      if (inlineEditId) return;
      if (mindmapEditElementId) return;
      if (spaceHeld || isPanTool) return;
      if (toolState.tool !== 'select') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable]')) return;
      if (target?.closest('.smm-text-edit')) return;

      if (selectedRef.current.length !== 1) return;
      const el = elementsRef.current.find(item => item.id === selectedRef.current[0]);
      if (!el || el.type !== 'shape' || el.locked) return;

      if (e.isComposing) {
        e.preventDefault();
        e.stopPropagation();
        openTextEdit(el.id, 'end');
        return;
      }

      if (e.key.length !== 1 || e.key === ' ') return;

      e.preventDefault();
      e.stopPropagation();

      const nextText = `${el.text ?? ''}${e.key}`;
      onElementUpdate(el.id, { text: nextText } as Partial<WhiteboardElement>, false);
      openTextEdit(el.id, 'end');
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    readOnly,
    inlineEditId,
    mindmapEditElementId,
    spaceHeld,
    isPanTool,
    toolState.tool,
    openTextEdit,
    onElementUpdate,
  ]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setCanvasSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setCanvasSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    preloadElementImages(renderElements, () => setPaintTick(v => v + 1));
  }, [renderElements]);

  useEffect(() => {
    void paintTick;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(canvasSize.w * dpr));
    canvas.height = Math.max(1, Math.floor(canvasSize.h * dpr));
    canvas.style.width = `${canvasSize.w}px`;
    canvas.style.height = `${canvasSize.h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const connectTargetEl = connectTarget
      ? renderElements.find(e => e.id === connectTarget.elementId) ?? null
      : null;

    const selectedConnectorEndpoints = (() => {
      if (selectedIds.length !== 1) return null;
      const el = renderElements.find(e => e.id === selectedIds[0]);
      if (!el || el.type !== 'connector') return null;
      const [start, end] = getBoardConnectorEndpoints(el, renderElements);
      return { start, end };
    })();

    const hideShapeTextIds = inlineEditId
      ? new Set([inlineEditId])
      : undefined;

    paintWhiteboard(ctx, canvasSize.w, canvasSize.h, dpr, {
      elements: renderElements,
      viewport: renderViewport,
      hoveredId,
      hideShapeTextIds,
      overlay: {
        selectedIds,
        marquee,
        createPreview,
        createPreviewShapeKind: toolState.tool === 'shape' ? toolState.shapeKind : null,
        liveConnector,
        livePenPoints,
        connectorStyle: toolState.connectorStyle,
        penColor: toolState.penColor,
        penWidth: toolState.penWidth,
        penMode: toolState.penMode,
        connectTarget: connectTargetEl && connectTarget
          ? { element: connectTargetEl, anchor: connectTarget.anchor }
          : null,
        connectorEndpoints: selectedConnectorEndpoints,
        alignmentGuides,
        zoom: renderViewport.zoom,
        readOnly,
        shapeQuickAddHover,
      },
    });
  }, [
    renderElements,
    renderViewport,
    selectedIds,
    hoveredId,
    marquee,
    createPreview,
    liveConnector,
    livePenPoints,
    connectTarget,
    alignmentGuides,
    toolState,
    readOnly,
    canvasSize,
    mindmapEditElementId,
    inlineEditId,
    paintTick,
    shapeQuickAddHover,
  ]);

  const handleMindmapBoundsChange = useCallback((elementId: string, bounds: MindmapBoundsUpdate) => {
    const el = elementsRef.current.find(e => e.id === elementId);
    if (!el || el.type !== 'mindmap') return;
    if (el.width === bounds.width && el.height === bounds.height) {
      return;
    }
    onElementUpdate(elementId, {
      width: bounds.width,
      height: bounds.height,
    }, false);
  }, [onElementUpdate]);

  const syncMindmapLayerPositions = useCallback((items: WhiteboardElement[], ids: Set<string>) => {
    for (const id of ids) {
      const el = items.find(item => item.id === id);
      const node = mindmapLayerNodesRef.current.get(id);
      if (!el || el.type !== 'mindmap' || !node) continue;
      node.style.left = `${el.x}px`;
      node.style.top = `${el.y}px`;
    }
  }, []);

  const beginElementDrag = (e: React.PointerEvent, id: string) => {
    if (readOnly || toolState.tool !== 'select' || spaceHeld) return;
    const hitEl = elementsRef.current.find(x => x.id === id);
    if (hitEl?.locked) return;
    let workingElements = elementsRef.current;
    let dragIds: string[];

    if (e.altKey) {
      const idsToClone = expandIdsWithSectionContents(
        selectedRef.current.includes(id) ? selectedRef.current : [id],
        workingElements,
      );
      const clones: WhiteboardElement[] = [];
      const newIds: string[] = [];
      let z = nextZIndex(workingElements);
      for (const sid of idsToClone) {
        const src = workingElements.find(x => x.id === sid);
        if (!src) continue;
        const clone = cloneWhiteboardElement(src);
        clone.id = genWhiteboardId();
        clone.zIndex = z++;
        clones.push(clone);
        newIds.push(clone.id);
      }
      if (clones.length) {
        workingElements = [...workingElements, ...clones];
        onElementsChange(workingElements, true);
        elementsRef.current = workingElements;
        onSelectionChange(newIds);
        dragIds = newIds;
      } else {
        dragIds = [id];
      }
    } else {
      const additive = e.shiftKey || e.metaKey;
      const nextSel = additive
        ? (selectedRef.current.includes(id) ? selectedRef.current : [...selectedRef.current, id])
        : selectedRef.current.includes(id) ? selectedRef.current : [id];
      onSelectionChange(nextSel);
      dragIds = nextSel;
    }

    dragIds = expandIdsWithSectionContents(dragIds, workingElements);

    const origins = new Map<string, WhiteboardElement>();
    dragIds.forEach(sid => {
      const el = workingElements.find(x => x.id === sid);
      if (el) origins.set(sid, cloneWhiteboardElement(el));
    });

    dragRef.current = {
      kind: 'move',
      startX: e.clientX,
      startY: e.clientY,
      origins,
      snap: e.shiftKey,
      active: false,
    };
    containerRef.current?.setPointerCapture(e.pointerId);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const delta = normalizeWheelDelta(e);
      const base = viewportRef.current;
      const vp = draftViewport ? { ...base, ...draftViewport } : base;
      if (e.ctrlKey || e.metaKey) {
        const next = zoomAtPointer(vp, e.clientX, e.clientY, rect, delta);
        onViewportChange(next);
        return;
      }
      onViewportChange(panViewport(vp, -e.deltaX, -e.deltaY));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onViewportChange]);

  const getAlignmentRefBoxes = useCallback((
    elements: WhiteboardElement[],
    excludeIds: Set<string>,
  ) => elements
    .filter(el => !excludeIds.has(el.id) && isAlignableElementType(el.type))
    .map(el => elementBounds(el)), []);

  const endDrag = useCallback(() => {
    mindmapLayerNodesRef.current.forEach(node => {
      node.style.left = '';
      node.style.top = '';
    });
    dragRef.current = null;
    setIsDragging(false);
    setDraftElements(null);
    setDraftViewport(null);
    setLivePenPoints(null);
    setLiveConnector(null);
    setCreatePreview(null);
    setMarquee(null);
    setConnectTarget(null);
    setAlignmentGuides([]);
  }, []);

  const applyMove = useCallback((
    clientX: number,
    clientY: number,
    gridSnap: boolean,
    commit: boolean,
  ) => {
    const drag = dragRef.current;
    if (!drag || drag.kind !== 'move') return;
    const vp = draftViewport ?? viewportRef.current;
    const dx = (clientX - drag.startX) / vp.zoom;
    const dy = (clientY - drag.startY) / vp.zoom;
    const base = commit ? elementsRef.current : (draftElements ?? elementsRef.current);
    const movingIds = new Set(drag.origins.keys());

    const movedBoxes = [...movingIds]
      .map(id => {
        const origin = drag.origins.get(id);
        if (!origin) return null;
        const moved = translateElement(origin, dx, dy);
        return elementBounds(moved);
      })
      .filter((b): b is { x: number; y: number; w: number; h: number } => b != null);

    const union = unionBounds(movedBoxes);
    const refBoxes = getAlignmentRefBoxes(base, movingIds);
    let snapDx = 0;
    let snapDy = 0;
    let guides: AlignmentGuide[] = [];

    if (union && refBoxes.length) {
      const snap = snapBoxPosition(union, refBoxes, undefined, vp.zoom);
      snapDx = snap.box.x - union.x;
      snapDy = snap.box.y - union.y;
      guides = snap.guides;
    }

    const next = base.map(el => {
      const origin = drag.origins.get(el.id);
      if (!origin) return el;
      let moved = translateElement(origin, dx + snapDx, dy + snapDy);
      if (gridSnap) {
        if (moved.type === 'connector' || moved.type === 'pen') {
          moved = {
            ...moved,
            points: moved.points.map(p => ({ x: snapToGrid(p.x), y: snapToGrid(p.y) })),
          };
        } else {
          moved = { ...moved, x: snapToGrid(moved.x), y: snapToGrid(moved.y) };
        }
      }
      return moved;
    });

    setAlignmentGuides(guides);
    syncMindmapLayerPositions(next, movingIds);
    if (commit) {
      onElementsChange(syncBoardConnectors(next), true);
      setDraftElements(null);
    } else {
      setDraftElements(syncBoardConnectors(next));
    }
  }, [draftElements, draftViewport, getAlignmentRefBoxes, onElementsChange, syncMindmapLayerPositions]);

  const handleMindmapDragStart = useCallback((e: React.PointerEvent, id: string) => {
    if (readOnly || toolState.tool !== 'select' || spaceHeld) return;
    onMindmapEditElementChange?.(null);
    onMindmapActiveNodeChange?.(null);
    beginElementDrag(e, id);
  }, [readOnly, spaceHeld, toolState.tool, onMindmapEditElementChange, onMindmapActiveNodeChange]);

  const resolveMindmapActiveNode = (el: MindmapElement, pt: WhiteboardPoint): string =>
    hitMindmapNodeAtPoint(el, pt) ?? el.root.id;

  const activateMindmapAtPoint = (el: MindmapElement, pt: WhiteboardPoint) => {
    onMindmapEditElementChange?.(el.id);
    onMindmapActiveNodeChange?.(resolveMindmapActiveNode(el, pt));
    onSelectionChange([]);
  };

  const handleResizeStart = (handle: ResizeHandle, e: React.PointerEvent) => {
    if (readOnly || selectedIds.length !== 1) return;
    const id = selectedIds[0];
    const base = draftElements ?? elementsRef.current;
    const el = base.find(x => x.id === id);
    if (!el || el.type === 'connector' || el.type === 'pen' || el.type === 'mindmap') return;
    if (el.locked) return;
    const isShape = el.type === 'shape';
    const isSection = el.type === 'section';
    const b = isShape
      ? getShapeVisualBounds(el.shapeKind, el.x, el.y, el.width, el.height)
      : elementBounds(el);
    const sectionChildOrigins = isSection
      ? new Map(
        findElementsInSection(el as SectionElement, base).map(child => [
          child.id,
          cloneWhiteboardElement(child),
        ]),
      )
      : undefined;
    dragRef.current = {
      kind: 'resize',
      handle,
      startX: e.clientX,
      startY: e.clientY,
      id,
      origin: { x: b.x, y: b.y, w: b.w, h: b.h },
      lockAspect: isSection
        ? sectionResizeLockAspect((el as SectionElement).aspect, e.shiftKey)
        : e.shiftKey,
      shapeKind: isShape ? el.shapeKind : undefined,
      sectionChildOrigins,
    };
    setIsDragging(true);
    containerRef.current?.setPointerCapture(e.pointerId);
  };

  const handleConnectorEndpointStart = (end: 'start' | 'end', e: React.PointerEvent) => {
    if (readOnly || selectedIds.length !== 1) return;
    const conn = (draftElements ?? elementsRef.current).find(
      x => x.id === selectedIds[0] && x.type === 'connector',
    ) as ConnectorElement | undefined;
    if (!conn) return;
    dragRef.current = {
      kind: 'connector-endpoint',
      connectorId: conn.id,
      end,
      origin: cloneWhiteboardElement(conn) as ConnectorElement,
    };
    setIsDragging(true);
    containerRef.current?.setPointerCapture(e.pointerId);
  };

  const tryDoubleClickTextEdit = (
    hit: WhiteboardElement,
    opts?: { detail?: number; onPointerUp?: boolean },
  ): boolean => {
    if (!isTextEditableElement(hit)) return false;
    if (opts?.detail && opts.detail >= 2) {
      openTextEdit(hit.id);
      return true;
    }
    if (!opts?.onPointerUp) return false;

    const now = Date.now();
    const last = lastClickRef.current;
    if (last && last.id === hit.id && now - last.time <= 450) {
      openTextEdit(hit.id);
      return true;
    }
    lastClickRef.current = { id: hit.id, time: now };
    return false;
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (readOnly) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-wb-mindmap-layer]')) return;

    e.preventDefault();
    e.stopPropagation();

    const pt = getCanvasPoint(e.clientX, e.clientY);
    const hit = hitElementAtPoint(elementsRef.current, pt);

    if (hit?.type === 'mindmap') {
      activateMindmapAtPoint(hit as MindmapElement, pt);
      onContextMenu?.({ clientX: e.clientX, clientY: e.clientY, targetId: hit.id });
      return;
    }

    if (hit) {
      if (!selectedRef.current.includes(hit.id)) {
        onSelectionChange([hit.id]);
      }
      onMindmapEditElementChange?.(null);
      onMindmapActiveNodeChange?.(null);
    }

    onContextMenu?.({ clientX: e.clientX, clientY: e.clientY, targetId: hit?.id ?? null });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (readOnly) return;
    if (e.button !== 0 && e.button !== 1) return;

    const target = e.target as HTMLElement;
    if (target.closest('[data-wb-mindmap-layer]')) {
      return;
    }

    const pt = getCanvasPoint(e.clientX, e.clientY);
    const panByMiddle = e.button === 1;
    const panBySpace = spaceHeld && e.button === 0;
    const panByTool = isPanTool && e.button === 0 && !panBySpace;
    const panByAlt = e.altKey && e.button === 0;

    if (panByMiddle || panBySpace || panByTool || panByAlt) {
      dragRef.current = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        originVp: { ...viewportRef.current },
      };
      setIsDragging(true);
      containerRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    if (toolState.tool === 'select') {
      const quickAddTarget = selectedIds.length === 1
        ? elementsRef.current.find(e => e.id === selectedIds[0])
        : null;
      if (quickAddTarget?.type === 'shape' && !quickAddTarget.locked) {
        const quickDir = hitShapeQuickAdd(quickAddTarget as ShapeElement, pt);
        if (quickDir) {
          e.preventDefault();
          e.stopPropagation();
          const sourceShape = quickAddTarget as ShapeElement;
          const baseZ = nextZIndex(elementsRef.current);
          const newShape = createAdjacentShape(sourceShape, quickDir, baseZ);
          const connector = createQuickAddConnector(sourceShape.id, newShape.id, quickDir, baseZ + 1);
          onElementsChange(
            syncBoardConnectors([...elementsRef.current, newShape, connector]),
            true,
          );
          onSelectionChange([newShape.id]);
          setShapeQuickAddHover(null);
          openTextEdit(newShape.id);
          return;
        }
      }

      const resizeHit = hitResizeHandle(elementsRef.current, selectedRef.current, pt);
      if (resizeHit) {
        handleResizeStart(resizeHit.handle, e);
        return;
      }

      const endpoint = hitConnectorEndpoint(
        elementsRef.current,
        selectedRef.current,
        pt,
        conn => getBoardConnectorEndpoints(conn, elementsRef.current),
      );
      if (endpoint) {
        handleConnectorEndpointStart(endpoint, e);
        return;
      }

      const hit = hitElementAtPoint(elementsRef.current, pt);

      if (hit?.type === 'mindmap') {
        handleMindmapDragStart(e, hit.id);
        return;
      }

      onMindmapEditElementChange?.(null);
      onMindmapActiveNodeChange?.(null);

      if (hit && tryDoubleClickTextEdit(hit, { detail: e.detail })) {
        return;
      }

      setInlineEditId(null);
      setInlineEditFocus('select-all');

      if (hit) {
        beginElementDrag(e, hit.id);
        return;
      }

      dragRef.current = { kind: 'marquee', start: pt, current: pt };
      setMarquee({ x: pt.x, y: pt.y, w: 0, h: 0 });
      setIsDragging(true);
      containerRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    if (toolState.tool === 'pen') {
      dragRef.current = { kind: 'pen', points: [pt] };
      setLivePenPoints([pt]);
      setIsDragging(true);
      containerRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    if (toolState.tool === 'connector') {
      const startSnap = findConnectionSnap(elementsRef.current, pt);
      const startPt = startSnap?.point ?? pt;
      const startBind = startSnap
        ? makeConnectorBind(startSnap.elementId, startSnap.anchor)
        : undefined;
      dragRef.current = { kind: 'connector', start: startPt, current: startPt, startBind };
      setLiveConnector({ start: startPt, end: startPt });
      if (startSnap) {
        setConnectTarget({ elementId: startSnap.elementId, anchor: startSnap.anchor });
      }
      setIsDragging(true);
      containerRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    if (toolState.tool === 'shape' || toolState.tool === 'section') {
      const sectionAspect = toolState.tool === 'section' ? toolState.sectionAspect : undefined;
      const lockAspect = toolState.tool === 'section' && sectionAspect
        ? sectionCreateLockAspect(sectionAspect, e.shiftKey)
        : e.shiftKey;
      dragRef.current = { kind: 'create', start: pt, lockAspect, sectionAspect };
      setCreatePreview({ x: pt.x, y: pt.y, w: 0, h: 0 });
      setIsDragging(true);
      containerRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    if (toolState.tool === 'text') {
      const el = createTextElement(pt.x, pt.y, elementsRef.current.length);
      onElementsChange([...elementsRef.current, el]);
      onSelectionChange([el.id]);
      revertToSelectAfterCreate();
      return;
    }

    if (toolState.tool === 'sticky') {
      const el = createStickyElement(pt.x, pt.y, toolState.stickyColor, elementsRef.current.length);
      onElementsChange([...elementsRef.current, el]);
      onSelectionChange([el.id]);
      revertToSelectAfterCreate();
      return;
    }

    if (toolState.tool === 'table') {
      const el = createTableElement(pt.x, pt.y, elementsRef.current.length);
      onElementsChange([...elementsRef.current, el]);
      onSelectionChange([el.id]);
      revertToSelectAfterCreate();
      return;
    }

    if (toolState.tool === 'mindmap') {
      const el = createMindmapElement(toolState.mindmapLayout, pt.x, pt.y, elementsRef.current.length) as MindmapElement;
      onElementsChange([...elementsRef.current, el]);
      onSelectionChange([]);
      onMindmapEditElementChange?.(el.id);
      onMindmapActiveNodeChange?.(el.root.id);
      revertToSelectAfterCreate();
      return;
    }

    if (toolState.tool === 'image') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        void loadImageFromBlob(file).then(({ src, width, height }) => {
          const newEl = createWhiteboardImageElement(
            pt,
            elementsRef.current.length,
            src,
            width,
            height,
            'topLeft',
          );
          onElementsChange([...elementsRef.current, newEl]);
          onSelectionChange([newEl.id]);
          revertToSelectAfterCreate();
        }).catch(() => {
          // ignore
        });
      };
      input.click();
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (readOnly || toolState.tool !== 'select' || spaceHeld) return;
    e.preventDefault();
    e.stopPropagation();
    const pt = getCanvasPoint(e.clientX, e.clientY);
    const hit = hitElementAtPoint(elementsRef.current, pt);
    if (!hit) return;
    dragRef.current = null;
    endDrag();
    if (hit.type === 'mindmap') {
      activateMindmapAtPoint(hit as MindmapElement, pt);
    } else if (isTextEditableElement(hit)) {
      openTextEdit(hit.id);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const pt = getCanvasPoint(e.clientX, e.clientY);

    if (!drag) {
      if (readOnly || spaceHeld || isPanTool) {
        setHoveredId(null);
        setShapeQuickAddHover(null);
        setResizeHoverHandle(null);
        return;
      }
      if (toolState.tool === 'select') {
        const resizeHit = hitResizeHandle(elementsRef.current, selectedRef.current, pt);
        setResizeHoverHandle(resizeHit?.handle ?? null);

        const quickAddShape = selectedIds.length === 1
          ? renderElements.find(e => e.id === selectedIds[0])
          : null;
        if (!resizeHit && quickAddShape?.type === 'shape' && !quickAddShape.locked) {
          setShapeQuickAddHover(hitShapeQuickAdd(quickAddShape as ShapeElement, pt));
        } else {
          setShapeQuickAddHover(null);
        }

        const el = hitElementAtPoint(renderElements, pt);
        setHoveredId(el?.id ?? null);
        setConnectTarget(null);
      } else if (toolState.tool === 'connector') {
        const snap = findConnectionSnap(renderElements, pt);
        if (snap) {
          setConnectTarget({ elementId: snap.elementId, anchor: snap.anchor });
          setHoveredId(snap.elementId);
        } else {
          setConnectTarget(null);
          setHoveredId(findHoverConnectable(renderElements, pt));
        }
      } else {
        setHoveredId(null);
        setConnectTarget(null);
        setShapeQuickAddHover(null);
        setResizeHoverHandle(null);
      }
      return;
    }

    if (drag.kind === 'pan') {
      setDraftViewport({
        ...drag.originVp,
        x: drag.originVp.x + (e.clientX - drag.startX),
        y: drag.originVp.y + (e.clientY - drag.startY),
      });
      return;
    }

    if (drag.kind === 'move') {
      if (!drag.active) {
        const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
        if (moved < DRAG_THRESHOLD) return;
        dragRef.current = { ...drag, active: true };
        setIsDragging(true);
        containerRef.current?.setPointerCapture(e.pointerId);
      }
      const snap = e.shiftKey || drag.snap;
      applyMove(e.clientX, e.clientY, snap, false);
      return;
    }

    if (drag.kind === 'resize') {
      const vp = draftViewport ?? viewportRef.current;
      const dx = (e.clientX - drag.startX) / vp.zoom;
      const dy = (e.clientY - drag.startY) / vp.zoom;
      const base = draftElements ?? elementsRef.current;
      const el = base.find(x => x.id === drag.id);
      if (!el) return;
      let next = resizeElement(el, drag.handle, dx, dy, drag.origin, drag.lockAspect);

      const refBoxes = getAlignmentRefBoxes(base, new Set([drag.id]));
      let resizeBox = { x: next.x, y: next.y, w: next.width, h: next.height };
      if (el.type === 'shape' && drag.shapeKind) {
        const vb = getShapeVisualBounds(drag.shapeKind, next.x, next.y, next.width, next.height);
        resizeBox = { x: vb.x, y: vb.y, w: vb.w, h: vb.h };
      }
      const snapped = snapResizeBox(resizeBox, drag.handle, refBoxes, undefined, vp.zoom);
      resizeBox = snapped.box;
      setAlignmentGuides(snapped.guides);

      if (el.type === 'shape' && drag.shapeKind) {
        const elemBox = elementBoxFromVisualBounds(drag.shapeKind, resizeBox);
        next = { ...el, x: elemBox.x, y: elemBox.y, width: elemBox.w, height: elemBox.h };
      } else {
        next = { ...el, x: resizeBox.x, y: resizeBox.y, width: resizeBox.w, height: resizeBox.h };
      }

      const sectionChildOrigins = drag.sectionChildOrigins;
      const sectionDx = next.x - drag.origin.x;
      const sectionDy = next.y - drag.origin.y;
      const resized = syncBoardConnectors(base.map(item => {
        if (item.id === drag.id) return next;
        if (sectionChildOrigins?.has(item.id)) {
          const childOrigin = sectionChildOrigins.get(item.id)!;
          return translateElement(childOrigin, sectionDx, sectionDy);
        }
        return item;
      }));
      setDraftElements(resized);
      return;
    }

    if (drag.kind === 'marquee') {
      const pt = getCanvasPoint(e.clientX, e.clientY);
      dragRef.current = { ...drag, current: pt };
      setMarquee(normalizeRect(drag.start, pt));
      return;
    }

    if (drag.kind === 'create') {
      const pt = getCanvasPoint(e.clientX, e.clientY);
      let rect: { x: number; y: number; w: number; h: number };
      if (drag.sectionAspect && isFixedSectionAspect(drag.sectionAspect)) {
        const ratio = getSectionAspectRatio(drag.sectionAspect)!;
        rect = constrainRectToAspectRatio(drag.start, pt, ratio);
      } else if (drag.lockAspect) {
        const size = Math.max(Math.abs(pt.x - drag.start.x), Math.abs(pt.y - drag.start.y), 40);
        rect = { x: drag.start.x, y: drag.start.y, w: size, h: size };
        if (pt.x < drag.start.x) rect.x = drag.start.x - size;
        if (pt.y < drag.start.y) rect.y = drag.start.y - size;
      } else {
        rect = normalizeRect(drag.start, pt);
      }
      const refBoxes = getAlignmentRefBoxes(elementsRef.current, new Set());
      const zoom = viewportRef.current.zoom;
      const usePositionSnap = drag.lockAspect
        && !(drag.sectionAspect && isFixedSectionAspect(drag.sectionAspect));
      const snapped = usePositionSnap
        ? snapBoxPosition(rect, refBoxes, undefined, zoom)
        : snapBoxBounds(rect, refBoxes, undefined, zoom);
      setAlignmentGuides(snapped.guides);
      setCreatePreview(snapped.box);
      return;
    }

    if (drag.kind === 'pen') {
      const pt = getCanvasPoint(e.clientX, e.clientY);
      const last = drag.points[drag.points.length - 1];
      if (last && dist(last, pt) < 2 / viewportRef.current.zoom) return;
      const points = [...drag.points, pt];
      dragRef.current = { ...drag, points };
      setLivePenPoints(points);
      return;
    }

    if (drag.kind === 'connector') {
      const exclude = drag.startBind?.elementId;
      const endSnap = findConnectionSnap(elementsRef.current, pt, { excludeId: exclude });
      const endPt = endSnap?.point ?? pt;
      dragRef.current = { ...drag, current: endPt };
      setConnectTarget(endSnap ? { elementId: endSnap.elementId, anchor: endSnap.anchor } : null);
      setLiveConnector({ start: drag.start, end: endPt });
      return;
    }

    if (drag.kind === 'connector-endpoint') {
      const exclude = drag.end === 'start'
        ? drag.origin.endBind?.elementId
        : drag.origin.startBind?.elementId;
      const snap = findConnectionSnap(elementsRef.current, pt, { excludeId: exclude });
      const bindPt = snap?.point ?? pt;
      const base = draftElements ?? elementsRef.current;
      const updated = base.map(el => {
        if (el.id !== drag.connectorId || el.type !== 'connector') return el;
        const conn = cloneWhiteboardElement(drag.origin) as ConnectorElement;
        const pts: WhiteboardPoint[] = [...conn.points];
        if (drag.end === 'start') {
          pts[0] = bindPt;
          conn.startBind = snap ? makeConnectorBind(snap.elementId, snap.anchor) : undefined;
        } else {
          pts[1] = bindPt;
          conn.endBind = snap ? makeConnectorBind(snap.elementId, snap.anchor) : undefined;
        }
        conn.points = pts;
        return conn;
      });
      setDraftElements(syncBoardConnectors(updated));
      setConnectTarget(snap ? { elementId: snap.elementId, anchor: snap.anchor } : null);
      return;
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch { /* ignore */ }

    if (drag.kind === 'move') {
      if (drag.active) {
        const snap = e.shiftKey || drag.snap;
        applyMove(e.clientX, e.clientY, snap, true);
      } else {
        const id = Array.from(drag.origins.keys())[0];
        const el = id ? elementsRef.current.find(item => item.id === id) : null;
        if (el) tryDoubleClickTextEdit(el, { onPointerUp: true });
      }
      endDrag();
      return;
    }

    if (drag.kind === 'resize') {
      if (draftElements) onElementsChange(draftElements, true);
      endDrag();
      return;
    }

    if (drag.kind === 'marquee') {
      const rect = normalizeRect(drag.start, drag.current);
      if (rect.w > 4 || rect.h > 4) {
        const hits = elementsRef.current
          .filter(el => rectsIntersect(elementBounds(el), rect))
          .map(el => el.id);
        onSelectionChange(hits);
      } else {
        onSelectionChange([]);
      }
      endDrag();
      return;
    }

    if (drag.kind === 'pen' && drag.points.length > 1) {
      const stroke = createPenStroke(
        toolState.penMode,
        toolState.penColor,
        toolState.penWidth,
        drag.points,
        elementsRef.current.length,
      );
      onElementsChange([...elementsRef.current, stroke]);
      revertToSelectAfterCreate();
      endDrag();
      return;
    }

    if (drag.kind === 'connector') {
      const end = getCanvasPoint(e.clientX, e.clientY);
      const exclude = drag.startBind?.elementId;
      const endSnap = findConnectionSnap(elementsRef.current, end, { excludeId: exclude });
      const endPt = endSnap?.point ?? end;
      if (dist(drag.start, endPt) > 8) {
        const conn = createConnectorElement(
          toolState.connectorStyle,
          drag.start.x,
          drag.start.y,
          endPt.x,
          endPt.y,
          elementsRef.current.length,
          {
            startBind: drag.startBind,
            endBind: endSnap
              ? makeConnectorBind(endSnap.elementId, endSnap.anchor)
              : undefined,
          },
        );
        onElementsChange(syncBoardConnectors([...elementsRef.current, conn]), true);
        revertToSelectAfterCreate();
      }
      endDrag();
      return;
    }

    if (drag.kind === 'connector-endpoint') {
      if (draftElements) onElementsChange(draftElements, true);
      endDrag();
      return;
    }

    if (drag.kind === 'create') {
      const pt = getCanvasPoint(e.clientX, e.clientY);
      let rect: { x: number; y: number; w: number; h: number };
      if (drag.sectionAspect && isFixedSectionAspect(drag.sectionAspect)) {
        const ratio = getSectionAspectRatio(drag.sectionAspect)!;
        rect = constrainRectToAspectRatio(drag.start, pt, ratio);
      } else {
        rect = createPreview ?? normalizeRect(drag.start, pt);
      }
      if (rect.w < 8 && rect.h < 8) {
        if (toolState.tool === 'shape') {
          const preset = createShapeElement(toolState.shapeKind, drag.start.x, drag.start.y, 0);
          rect = { x: drag.start.x, y: drag.start.y, w: preset.width, h: preset.height };
        } else {
          rect = { x: drag.start.x, y: drag.start.y, w: 120, h: 80 };
        }
        if (drag.sectionAspect && isFixedSectionAspect(drag.sectionAspect)) {
          const ratio = getSectionAspectRatio(drag.sectionAspect)!;
          rect = constrainRectToAspectRatio(
            drag.start,
            { x: drag.start.x + 120, y: drag.start.y + 120 / ratio },
            ratio,
          );
        }
      } else {
        rect.w = Math.max(rect.w, 40);
        rect.h = Math.max(rect.h, 40);
        if (drag.sectionAspect && isFixedSectionAspect(drag.sectionAspect)) {
          const ratio = getSectionAspectRatio(drag.sectionAspect)!;
          rect = constrainRectToAspectRatio(
            drag.start,
            { x: rect.x + rect.w, y: rect.y + rect.h },
            ratio,
          );
        }
      }
      if (drag.lockAspect && !drag.sectionAspect) {
        const size = Math.max(rect.w, rect.h);
        rect.w = size;
        rect.h = size;
      }

      let el: WhiteboardElement;
      if (toolState.tool === 'shape') {
        el = createShapeElement(toolState.shapeKind, rect.x, rect.y, elementsRef.current.length);
        el = { ...el, width: rect.w, height: rect.h };
      } else {
        const aspect = drag.sectionAspect ?? toolState.sectionAspect;
        el = createSectionElement(aspect, rect.x, rect.y, elementsRef.current.length);
        el = { ...el, width: rect.w, height: rect.h };
      }
      onElementsChange([...elementsRef.current, el]);
      onSelectionChange([el.id]);
      if (el.type === 'shape') {
        openTextEdit(el.id);
      }
      revertToSelectAfterCreate();
      endDrag();
      return;
    }

    if (drag.kind === 'pan') {
      if (draftViewport) onViewportChange(draftViewport);
      endDrag();
      return;
    }
  };

  const handleTextChange = (id: string, text: string) => {
    onElementUpdate(id, { text } as Partial<WhiteboardElement>, false);
  };

  const handleTextEditClose = (id: string) => {
    const el = elementsRef.current.find(item => item.id === id);
    if (el && 'text' in el) {
      onElementUpdate(id, { text: el.text ?? '' } as Partial<WhiteboardElement>, true);
    }
    setInlineEditId(null);
    setInlineEditFocus('select-all');
  };

  const handleShapePatch = (id: string, patch: Partial<ShapeElement>, recordHistory?: boolean) => {
    onElementUpdate(id, patch as Partial<WhiteboardElement>, recordHistory);
  };

  const handleTextPatch = (id: string, patch: Partial<TextElement>, recordHistory?: boolean) => {
    onElementUpdate(id, patch as Partial<WhiteboardElement>, recordHistory);
  };

  const selectedShape = selectedIds.length === 1
    ? renderElements.find(
      (el): el is ShapeElement => el.id === selectedIds[0] && el.type === 'shape',
    )
    : null;

  const selectedText = selectedIds.length === 1
    ? renderElements.find(
      (el): el is TextElement => el.id === selectedIds[0] && el.type === 'text',
    )
    : null;

  const inlineEditElement = inlineEditId
    ? renderElements.find(el => el.id === inlineEditId)
    : null;

  const shapeToolbarAnchor = selectedShape && !selectedShape.locked
    ? (() => {
      const vb = getShapeVisualBounds(
        selectedShape.shapeKind,
        selectedShape.x,
        selectedShape.y,
        selectedShape.width,
        selectedShape.height,
      );
      return {
        x: renderViewport.x + (vb.x + vb.w / 2) * renderViewport.zoom,
        y: renderViewport.y + vb.y * renderViewport.zoom,
      };
    })()
    : null;

  const textToolbarAnchor = selectedText && !selectedText.locked
    ? {
      x: renderViewport.x + (selectedText.x + selectedText.width / 2) * renderViewport.zoom,
      y: renderViewport.y + selectedText.y * renderViewport.zoom,
    }
    : null;

  const lockBadgeAnchor = (() => {
    if (!selectedIds.length || readOnly || toolState.tool !== 'select') return null;
    const selected = renderElements.filter(e => selectedIds.includes(e.id));
    if (!selected.length || !selected.every(e => e.locked)) return null;

    if (selected.length === 1 && selected[0].type === 'shape') {
      const el = selected[0] as ShapeElement;
      const vb = getShapeVisualBounds(el.shapeKind, el.x, el.y, el.width, el.height);
      return {
        x: renderViewport.x + (vb.x + vb.w / 2) * renderViewport.zoom,
        y: renderViewport.y + vb.y * renderViewport.zoom,
      };
    }

    const bounds = selectionBounds(renderElements, selectedIds);
    if (!bounds) return null;
    return {
      x: renderViewport.x + (bounds.x + bounds.w / 2) * renderViewport.zoom,
      y: renderViewport.y + bounds.y * renderViewport.zoom,
    };
  })();

  return (
    <div
      ref={node => {
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        background: WB_COLORS.pageBg,
        cursor,
        touchAction: 'none',
        userSelect: isDragging ? 'none' : 'auto',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />

      <WbMindmapCanvasLayer
        elements={renderElements}
        viewport={renderViewport}
        editingMindmapId={mindmapEditElementId}
        selectMode={toolState.tool === 'select' && !spaceHeld}
        readOnly={readOnly}
        buildMindmapEditProps={buildMindmapEditProps}
        onBoundsChange={handleMindmapBoundsChange}
        onMindmapFocus={onMindmapFocus}
        onMindmapDragStart={handleMindmapDragStart}
        mindmapLayerNodesRef={mindmapLayerNodesRef}
      />

      {lockBadgeAnchor && onToggleLock && (
        <SelectionLockBadge
          anchorX={lockBadgeAnchor.x}
          anchorY={lockBadgeAnchor.y}
          onUnlock={onToggleLock}
        />
      )}

      {selectedShape && shapeToolbarAnchor && !readOnly && toolState.tool === 'select' && !inlineEditId && !suppressFloatingToolbar && (
        <ShapeFormatToolbar
          element={selectedShape}
          anchorX={shapeToolbarAnchor.x}
          anchorY={shapeToolbarAnchor.y}
          onPatch={(patch, recordHistory) => handleShapePatch(selectedShape.id, patch, recordHistory)}
        />
      )}

      {selectedText && textToolbarAnchor && !readOnly && toolState.tool === 'select' && !suppressFloatingToolbar && (
        <ShapeFormatToolbar
          variant="text"
          element={selectedText}
          anchorX={textToolbarAnchor.x}
          anchorY={textToolbarAnchor.y}
          onPatch={(patch, recordHistory) => handleTextPatch(selectedText.id, patch, recordHistory)}
        />
      )}

      {inlineEditElement
        && (inlineEditElement.type === 'text' || inlineEditElement.type === 'sticky' || inlineEditElement.type === 'shape') && (
        <CanvasInlineEditor
          element={inlineEditElement}
          viewport={renderViewport}
          focusMode={inlineEditFocus}
          onChange={text => handleTextChange(inlineEditId!, text)}
          onClose={() => handleTextEditClose(inlineEditId!)}
        />
      )}
    </div>
  );
});

export function computeFitViewport(
  elements: WhiteboardElement[],
  container: HTMLDivElement | null,
): WhiteboardViewport {
  if (!container) return { x: 80, y: 80, zoom: 1 };
  const rect = container.getBoundingClientRect();
  return fitViewportToElements(elements, rect.width, rect.height);
}

export { clampZoom };

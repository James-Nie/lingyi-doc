import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AnchorId,
  ConnectorBind,
  ConnectorElement,
  DocCommentThread,
  ImageElement,
  MindmapElement,
  SectionElement,
  ShapeElement,
  StickyElement,
  TableElement,
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
  findMindNode,
  hitTableCell,
  insertTableCol,
  insertTableRow,
  isMindNodePlaceholder,
  tableCellCanvasRect,
  getSectionAspectRatio,
  makeConnectorBind,
  genWhiteboardId,
  nextZIndex,
  isFixedSectionAspect,
  createWhiteboardMeasureOptions,
  projectPointOnConnectorNormal,
  snapConnectorLabelPosition,
  getConnectorPathFrameAtMidpoint,
  ensureCurvePathPoints,
  movePathVertex,
  movePathHandle,
  insertPathPointOnSegment,
  togglePathPointKind,
  dragElbowSegment,
  findClosestCurveSegment,
  setPathPointKind,
  refitCurvePathToEndpoints,
  smoothCurvePath,
  resolveSeqLifelineLength,
  SEQ_LIFELINE_MIN_LENGTH,
  type ConnectorPathPoint,
  type ConnectorLabelPosition,
  type ConnectorPathFrame,
  WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT,
} from '@lingyi-doc/core';
import { getBoardConnectorEndpoints, getBoardConnectorLabelLayout, getBoardConnectorRoute, syncBoardConnectors, computeConnectorToolbarScreenAnchor, convertBoardConnectorStyle } from './boardConnector';
import { hitCurvePathVertex, hitCurvePathHandle } from './pathEditingUI';
import { hitElbowSegmentHandle, elbowSegmentHandleCursor, connectorElbowSegmentOpts } from './elbowConnectorUI';
import { WbMindmapCanvasLayer } from './mindmap/WbMindmapCanvasLayer';
import { MindmapNodeInlineEditor } from './mindmap/MindmapNodeInlineEditor';
import { MindmapNodeFormatToolbarWithImage } from './mindmap/MindmapNodeFormatToolbar';
import { readImageFile } from '../mindnote/mindNoteImageUtils';
import { getMindmapNodeScreenBounds, hitMindmapAtPoint } from './canvas/mindmapHitTest';
import { computeMindMapLayout } from '@lingyi-doc/core';
import { resolveMindmapTextEditStyle, resolveTheme, getMindmapQuickActionLayout, computeMindmapQuickActionTopExtent, computeThemedMindMapLayout, childActionForGrowDirection } from '@lingyi-doc/mind-map';
import { MindmapNodeQuickActions } from '@lingyi-doc/mind-map-react';
import { hitShapeQuickAdd, createAdjacentShape, createQuickAddConnector, shapeInteractionDelta, shapeRotationCenter, type ShapeQuickAddSide } from './canvas/shapeQuickAdd';
import {
  buildPlacementPreviewElement,
  computePlacementPreviewRect,
  isConnectorSubSelectionReady,
  isPlacementTool,
  isToolSubSelectionReady,
} from './canvas/placementPreview';
import type { WbMindmapEditProps } from './mindmap/WbMindmapView';
import type { MindmapBoundsUpdate } from './mindmap/syncMindmapBounds';
import type { WhiteboardToolState } from './WhiteboardToolbar';
import { WB_COLORS } from './styles';
import {
  CanvasInlineEditor,
  ConnectorLabelEditor,
  TableCanvasOverlay,
  TableCellInlineEditor,
  elementBoxFromVisualBounds,
  computeUniformScaledVisualBox,
  elementBoxFromUniformScaledVisual,
  getShapeVisualBounds,
  isUniformScaledShapeKind,
  normalizeUniformScaledVisualBox,
  hitConnectorEndpoint,
  hitConnectorLabelAtPoint,
  hitElementAtPoint,
  hitResizeHandle,
  hitSeqLifelineHandle,
  hitShapeRotationHandle,
  resizeHandleCursor,
  findConnectionSnap,
  findHoverConnectable,
  resolveConnectionBindForElement,
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
import { ImageFormatToolbar, downloadImageElement } from './ImageFormatToolbar';
import { ConnectorFormatToolbar } from './ConnectorFormatToolbar';
import type { WhiteboardContextMenuAction } from './WhiteboardContextMenu';
import type { ZOrderAction } from './elementActions';
import { reverseConnectorDirection } from './elementActions';
import { SelectionLockBadge } from './SelectionLockBadge';
import { rotateElements, rotationFromPointerDrag, selectionBounds } from './elementActions';
import { WbCommentPinOverlay } from './comments/WbCommentPinOverlay';
import {
  defaultPinForElement,
  resolveMindmapNodeQuote,
  resolveWhiteboardElementQuote,
} from './comments/whiteboardComments';
import { ImageCropOverlay } from './canvas/ImageCropOverlay';
import {
  constrainRectToAspectRatio,
  expandIdsWithSectionContents,
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
  snapPointToHV,
  isStraightConnectorStyle,
  translateElement,
  zoomAtPointer,
  type ResizeHandle,
} from './viewportUtils';

interface WhiteboardCanvasProps {
  elements: WhiteboardElement[];
  viewport: WhiteboardViewport;
  selectedIds: string[];
  toolState: WhiteboardToolState;
  /** 与 toolState 同步，供 pointer 事件读取最新选中图形（避免 setState 延迟） */
  toolStateRef?: React.MutableRefObject<WhiteboardToolState>;
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
  mindmapTextEditNodeId?: string | null;
  mindmapTextDraft?: string | null;
  onMindmapTextDraftChange?: (text: string | null) => void;
  onMindmapEditElementChange?: (id: string | null) => void;
  onMindmapActiveNodeChange?: (id: string | null) => void;
  onMindmapTextEditNodeChange?: (id: string | null) => void;
  onMindmapFocus?: (id: string) => void;
  onMindmapDragStart?: (e: React.PointerEvent, id: string) => void;
  buildMindmapEditProps?: (el: MindmapElement) => WbMindmapEditProps | undefined;
  suppressFloatingToolbar?: boolean;
  onToggleLock?: () => void;
  onToolbarMenuAction?: (action: WhiteboardContextMenuAction) => void;
  onLayerAction?: (action: ZOrderAction) => void;
  canPasteToolbar?: boolean;
  onContextMenu?: (payload: {
    clientX: number;
    clientY: number;
    targetId: string | null;
  }) => void;
  commentThreads?: DocCommentThread[];
  selectedCommentId?: string | null;
  commentsEnabled?: boolean;
  onSelectComment?: (threadId: string) => void;
  onCommentPinMove?: (threadId: string, pinX: number, pinY: number) => void;
  onRequestAddComment?: (input: {
    elementId: string;
    mindNodeId?: string;
    pinX: number;
    pinY: number;
    quote: string;
  }) => void;
  /** 图形放置完成后回调（用于关闭图形库等） */
  onShapePlaced?: () => void;
}

type DragState =
  | { kind: 'pan'; startX: number; startY: number; originVp: WhiteboardViewport }
  | { kind: 'move'; startX: number; startY: number; origins: Map<string, WhiteboardElement>; snap: boolean; active: boolean }
  | { kind: 'resize'; handle: ResizeHandle; startX: number; startY: number; id: string; origin: { x: number; y: number; w: number; h: number }; lockAspect: boolean; shapeKind?: import('@lingyi-doc/core').ShapeKind; shapeRotation?: number; elementOrigin?: { x: number; y: number; w: number; h: number } }
  | { kind: 'seq-lifeline'; id: string; startY: number; originLength: number }
  | { kind: 'rotate'; id: string; startX: number; startY: number; center: WhiteboardPoint; startAngle: number; originRotation: number; active: boolean }
  | { kind: 'marquee'; start: WhiteboardPoint; current: WhiteboardPoint }
  | { kind: 'create'; start: WhiteboardPoint; lockAspect: boolean; sectionAspect?: import('@lingyi-doc/core').SectionAspect }
  | { kind: 'pen'; points: WhiteboardPoint[] }
  | { kind: 'connector'; start: WhiteboardPoint; current: WhiteboardPoint; startBind?: ConnectorBind }
  | { kind: 'connector-endpoint'; connectorId: string; end: 'start' | 'end'; origin: ConnectorElement }
  | { kind: 'path-vertex'; connectorId: string; index: number; origin: ConnectorElement }
  | { kind: 'path-handle'; connectorId: string; index: number; which: 'in' | 'out'; origin: ConnectorElement }
  | { kind: 'elbow-segment'; connectorId: string; segmentIndex: number; originRoute: WhiteboardPoint[]; startPt: WhiteboardPoint; origin: ConnectorElement }
  | { kind: 'connector-label'; connectorId: string; startPt: WhiteboardPoint; originPosition: ConnectorLabelPosition; frame: ConnectorPathFrame; active: boolean };

const DRAG_THRESHOLD = 4;

function isConnectorLabelEditable(el: WhiteboardElement): boolean {
  return el.type === 'connector';
}

function isTextEditableElement(el: WhiteboardElement): el is ShapeElement | TextElement | StickyElement {
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
  toolStateRef,
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
  mindmapTextEditNodeId = null,
  mindmapTextDraft = null,
  onMindmapTextDraftChange,
  onMindmapEditElementChange,
  onMindmapActiveNodeChange,
  onMindmapTextEditNodeChange,
  onMindmapFocus,
  onMindmapDragStart,
  buildMindmapEditProps,
  suppressFloatingToolbar = false,
  onToggleLock,
  onToolbarMenuAction,
  onLayerAction,
  canPasteToolbar = false,
  onContextMenu,
  commentThreads = [],
  selectedCommentId = null,
  commentsEnabled = false,
  onSelectComment,
  onCommentPinMove,
  onRequestAddComment,
  onShapePlaced,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEditFocus, setInlineEditFocus] = useState<'select-all' | 'end'>('select-all');
  const [inlineTextOverride, setInlineTextOverride] = useState<string | null>(null);
  const [tableEditCell, setTableEditCell] = useState<{ tableId: string; row: number; col: number } | null>(null);
  const [paintTick, setPaintTick] = useState(0);
  const inlineEditIdRef = useRef<string | null>(null);
  const tableEditCellRef = useRef<{ tableId: string; row: number; col: number } | null>(null);
  const elementsRef = useRef(elements);
  const viewportRef = useRef(viewport);
  const selectedRef = useRef(selectedIds);
  elementsRef.current = elements;
  viewportRef.current = viewport;
  selectedRef.current = selectedIds;
  inlineEditIdRef.current = inlineEditId;
  tableEditCellRef.current = tableEditCell;

  useEffect(() => {
    if (!tableEditCell) return;
    if (selectedIds.length !== 1 || selectedIds[0] !== tableEditCell.tableId) {
      setTableEditCell(null);
    }
  }, [selectedIds, tableEditCell]);

  const [activePathPointIndex, setActivePathPointIndex] = useState<number | null>(null);
  const [imageCropId, setImageCropId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedIds.length !== 1) setActivePathPointIndex(null);
  }, [selectedIds]);

  useEffect(() => {
    if (selectedIds.length !== 1) setImageCropId(null);
  }, [selectedIds]);

  useEffect(() => {
    if (!imageCropId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImageCropId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [imageCropId]);

  const dragRef = useRef<DragState | null>(null);
  const lastPointerPtRef = useRef<WhiteboardPoint | null>(null);
  const lastClientPointerRef = useRef<{ x: number; y: number } | null>(null);
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
  const [rotationHover, setRotationHover] = useState(false);
  const [mindmapCollapseHoverId, setMindmapCollapseHoverId] = useState<string | null>(null);

  const isPanTool = panMode || toolState.tool === 'pan' || spaceHeld;
  const isCreateDragging = isDragging && dragRef.current?.kind === 'create';
  const isPlacementHover = !!createPreview
    && createPreview.w > 0
    && createPreview.h > 0
    && !isCreateDragging
    && isPlacementTool(toolState.tool)
    && isToolSubSelectionReady(toolState);

  const revertToSelectAfterCreate = useCallback(() => {
    if (toolState.tool !== 'select' && toolState.tool !== 'pan') {
      onToolChange?.({ tool: 'select' });
    }
  }, [toolState.tool, onToolChange]);

  const updatePlacementPreview = useCallback((pt: WhiteboardPoint) => {
    if (readOnly || spaceHeld || isPanTool || !isPlacementTool(toolState.tool) || dragRef.current) {
      return;
    }
    if (!isToolSubSelectionReady(toolState)) {
      setCreatePreview(null);
      return;
    }
    setCreatePreview(computePlacementPreviewRect(toolState, pt));
  }, [isPanTool, readOnly, spaceHeld, toolState]);

  useEffect(() => {
    const pt = lastPointerPtRef.current;
    if (!pt || dragRef.current) return;
    if (isPlacementTool(toolState.tool)) {
      if (isToolSubSelectionReady(toolState)) {
        setCreatePreview(computePlacementPreviewRect(toolState, pt));
      } else {
        setCreatePreview(null);
      }
    } else {
      setCreatePreview(null);
    }
  }, [toolState]);

  const syncShapePlacementPreview = useCallback((clientX: number, clientY: number) => {
    const ts = toolStateRef?.current ?? toolState;
    if (ts.tool !== 'shape' || !ts.shapeKind) return;
    if (readOnly || spaceHeld || isPanTool || dragRef.current) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const inside = clientX >= rect.left && clientX <= rect.right
      && clientY >= rect.top && clientY <= rect.bottom;
    if (!inside) {
      setCreatePreview(null);
      return;
    }
    const pt = screenToCanvasPoint(clientX, clientY, rect, viewportRef.current);
    lastPointerPtRef.current = pt;
    setCreatePreview(computePlacementPreviewRect(ts, pt));
  }, [isPanTool, readOnly, spaceHeld, toolState, toolStateRef]);

  useEffect(() => {
    if (readOnly) return;
    const onWindowPointerMove = (e: PointerEvent) => {
      lastClientPointerRef.current = { x: e.clientX, y: e.clientY };
      const ts = toolStateRef?.current ?? toolState;
      if (ts.tool !== 'shape' || !ts.shapeKind) return;
      syncShapePlacementPreview(e.clientX, e.clientY);
    };
    window.addEventListener('pointermove', onWindowPointerMove);
    return () => window.removeEventListener('pointermove', onWindowPointerMove);
  }, [readOnly, syncShapePlacementPreview, toolState, toolStateRef]);

  useEffect(() => {
    const ts = toolStateRef?.current ?? toolState;
    if (ts.tool !== 'shape' || !ts.shapeKind) return;
    const last = lastClientPointerRef.current;
    if (last) syncShapePlacementPreview(last.x, last.y);
  }, [toolState.shapeKind, toolState.tool, syncShapePlacementPreview, toolState, toolStateRef]);

  const renderElements = draftElements ?? elements;
  const renderViewport = draftViewport ? { ...viewport, ...draftViewport } : viewport;

  // 编辑态不在每键击时重算导图布局，避免节点尺寸变化导致内联编辑器位移/断开
  const renderElementsForPaint = renderElements;

  const getCanvasPoint = useCallback((clientX: number, clientY: number): WhiteboardPoint => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return screenToCanvasPoint(clientX, clientY, rect, renderViewport);
  }, [renderViewport]);

  const cursor = useMemo(() => {
    if (resizeHoverHandle) return resizeHandleCursor(resizeHoverHandle);
    if (rotationHover) return 'grab';
    if (isDragging && dragRef.current?.kind === 'rotate') return 'grabbing';
    if (shapeQuickAddHover || mindmapCollapseHoverId) return 'pointer';
    if (isDragging && (dragRef.current?.kind === 'pan' || isPanTool)) return 'grabbing';
    if (isPanTool) return 'grab';
    if (toolState.tool === 'pen') return 'crosshair';
    if (toolState.tool === 'comment') return 'copy';
    if (toolState.tool === 'select') return 'default';
    return 'crosshair';
  }, [isDragging, isPanTool, mindmapCollapseHoverId, resizeHoverHandle, rotationHover, shapeQuickAddHover, toolState.tool]);

  const openTextEdit = useCallback((
    id: string,
    focus: 'select-all' | 'end' = 'select-all',
    opts?: { textOverride?: string },
  ) => {
    const alreadySelected = selectedRef.current.length === 1 && selectedRef.current[0] === id;
    if (!alreadySelected) {
      onSelectionChange([id]);
    }
    setInlineTextOverride(opts?.textOverride ?? null);
    setInlineEditFocus(focus);
    setInlineEditId(id);
    setTableEditCell(null);
    lastClickRef.current = null;
  }, [onSelectionChange]);

  const openConnectorLabelEdit = useCallback((
    id: string,
    focus: 'select-all' | 'end' = 'select-all',
    opts?: { textOverride?: string },
  ) => {
    const alreadySelected = selectedRef.current.length === 1 && selectedRef.current[0] === id;
    if (!alreadySelected) {
      onSelectionChange([id]);
    }
    setInlineTextOverride(opts?.textOverride ?? null);
    setInlineEditFocus(focus);
    setInlineEditId(id);
    setTableEditCell(null);
    lastClickRef.current = null;
    const el = elementsRef.current.find(item => item.id === id);
    if (el?.type === 'connector' && !el.labelPosition) {
      onElementUpdate(id, { labelPosition: 'on' } as Partial<WhiteboardElement>, false);
    }
  }, [onSelectionChange, onElementUpdate]);

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

    const selectedConnector = selectedIds.length === 1
      ? renderElements.find((e): e is ConnectorElement => e.id === selectedIds[0] && e.type === 'connector') ?? null
      : null;

    const selectedConnectorEndpoints = selectedConnector
      ? (() => {
        const [start, end] = getBoardConnectorEndpoints(selectedConnector, renderElements);
        return { start, end };
      })()
      : null;

    const selectedConnectorRoute = selectedConnector
      ? getBoardConnectorRoute(selectedConnector, renderElements)
      : null;

    const hideShapeTextIds = inlineEditId
      ? new Set([inlineEditId])
      : undefined;
    const hideConnectorLabelIds = inlineEditId
      ? new Set([inlineEditId])
      : undefined;

    const hideTableCells = new Map<string, { row: number; col: number }>();
    if (tableEditCell) {
      hideTableCells.set(tableEditCell.tableId, { row: tableEditCell.row, col: tableEditCell.col });
    }

    const mindmapActiveNodes = new Map<string, string | null>();
    if (mindmapEditElementId && mindmapActiveNodeId) {
      mindmapActiveNodes.set(mindmapEditElementId, mindmapActiveNodeId);
    }

    const mindmapHideTextNodes = new Map<string, string | null>();
    if (mindmapEditElementId && mindmapTextEditNodeId) {
      mindmapHideTextNodes.set(mindmapEditElementId, mindmapTextEditNodeId);
    }

    const mindmapHoveredCollapse = new Map<string, string | null>();
    if (mindmapEditElementId && mindmapCollapseHoverId) {
      mindmapHoveredCollapse.set(mindmapEditElementId, mindmapCollapseHoverId);
    }

    const placementPreviewElement = isPlacementHover && createPreview
      ? buildPlacementPreviewElement(toolState, createPreview)
      : null;

    paintWhiteboard(ctx, canvasSize.w, canvasSize.h, dpr, {
      elements: renderElementsForPaint,
      viewport: renderViewport,
      hoveredId,
      hideShapeTextIds,
      hideConnectorLabelIds,
      hideTableCells,
      mindmapActiveNodes,
      mindmapHideTextNodes,
      mindmapHoveredCollapse,
      overlay: {
        selectedIds,
        marquee,
        createPreview,
        createPreviewShapeKind: toolState.tool === 'shape' ? toolState.shapeKind : null,
        placementPreviewElement,
        isPlacementHover,
        liveConnector,
        livePenPoints,
        connectorStyle: toolState.connectorStyle ?? 'arrow',
        penColor: toolState.penColor,
        penWidth: toolState.penWidth,
        penMode: toolState.penMode,
        connectTarget: connectTargetEl && connectTarget
          ? { element: connectTargetEl, anchor: connectTarget.anchor }
          : null,
        connectorEndpoints: selectedConnectorEndpoints,
        connectorRoute: selectedConnectorRoute,
        connectorStyleSelected: selectedConnector,
        activePathPointIndex,
        alignmentGuides,
        zoom: renderViewport.zoom,
        readOnly,
        shapeQuickAddHover,
      },
    });
  }, [
    renderElementsForPaint,
    renderViewport,
    selectedIds,
    hoveredId,
    marquee,
    createPreview,
    isCreateDragging,
    isPlacementHover,
    liveConnector,
    livePenPoints,
    connectTarget,
    alignmentGuides,
    toolState,
    readOnly,
    canvasSize,
    isDragging,
    mindmapEditElementId,
    mindmapActiveNodeId,
    mindmapTextEditNodeId,
    mindmapCollapseHoverId,
    inlineEditId,
    tableEditCell,
    paintTick,
    shapeQuickAddHover,
    activePathPointIndex,
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

  const capturePointer = useCallback((e: React.PointerEvent) => {
    const target = e.currentTarget instanceof HTMLElement
      ? e.currentTarget
      : containerRef.current;
    target?.setPointerCapture(e.pointerId);
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
    capturePointer(e);
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
    const synced = syncBoardConnectors(next);
    if (commit) {
      elementsRef.current = synced;
      onElementsChange(synced, true);
      setDraftElements(null);
    } else {
      setDraftElements(synced);
    }
  }, [draftElements, draftViewport, getAlignmentRefBoxes, onElementsChange]);

  const handleMindmapDragStart = useCallback((e: React.PointerEvent, id: string) => {
    if (readOnly || toolState.tool !== 'select' || spaceHeld) return;
    onMindmapEditElementChange?.(null);
    onMindmapActiveNodeChange?.(null);
    beginElementDrag(e, id);
  }, [readOnly, spaceHeld, toolState.tool, onMindmapEditElementChange, onMindmapActiveNodeChange]);

  const beginMindmapElementDrag = useCallback((e: React.PointerEvent, id: string) => {
    if (readOnly || toolState.tool !== 'select' || spaceHeld) return;
    const base = draftElements ?? elementsRef.current;
    const hitEl = base.find(x => x.id === id);
    if (!hitEl || hitEl.locked) return;
    onSelectionChange([]);
    const origins = new Map<string, WhiteboardElement>();
    origins.set(id, cloneWhiteboardElement(hitEl));
    dragRef.current = {
      kind: 'move',
      startX: e.clientX,
      startY: e.clientY,
      origins,
      snap: e.shiftKey,
      active: false,
    };
    capturePointer(e);
  }, [draftElements, readOnly, spaceHeld, toolState.tool, onSelectionChange, capturePointer]);

  const handleMindmapRootDragStart = useCallback((e: React.PointerEvent, id: string) => {
    beginMindmapElementDrag(e, id);
  }, [beginMindmapElementDrag]);

  const resolveMindmapActiveNode = (el: MindmapElement, pt: WhiteboardPoint): string => {
    const hit = hitMindmapAtPoint(el, pt);
    return hit.kind === 'node' && hit.nodeId ? hit.nodeId : el.root.id;
  };

  const openMindmapTextEdit = useCallback((nodeId: string) => {
    if (readOnly || !mindmapEditElementId) return;
    const mm = elementsRef.current.find(
      item => item.id === mindmapEditElementId && item.type === 'mindmap',
    ) as MindmapElement | undefined;
    const nodeText = mm ? findMindNode(mm.root, nodeId)?.node.text ?? '' : '';
    onMindmapTextDraftChange?.(isMindNodePlaceholder(nodeText) ? '' : nodeText);
    onMindmapTextEditNodeChange?.(nodeId);
    onMindmapActiveNodeChange?.(nodeId);
  }, [readOnly, mindmapEditElementId, onMindmapTextDraftChange, onMindmapTextEditNodeChange, onMindmapActiveNodeChange]);

  const closeMindmapTextEdit = useCallback(() => {
    onMindmapTextEditNodeChange?.(null);
    onMindmapTextDraftChange?.(null);
  }, [onMindmapTextEditNodeChange, onMindmapTextDraftChange]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (readOnly) return;
      if (inlineEditIdRef.current) return;
      if (tableEditCellRef.current) return;
      if (mindmapTextEditNodeId) return;
      if (spaceHeld || isPanTool) return;
      if (toolState.tool !== 'select') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      if (target?.closest('.smm-text-edit')) return;

      const isEditableKey = (key: string) => key.length === 1 && key !== ' ';

      const selectedEl = selectedRef.current.length === 1
        ? elementsRef.current.find(item => item.id === selectedRef.current[0])
        : null;

      if (selectedEl && !selectedEl.locked) {
        if (selectedEl.type === 'connector') {
          if (e.isComposing) {
            e.preventDefault();
            e.stopPropagation();
            openConnectorLabelEdit(selectedEl.id, 'end');
            return;
          }
          if (!isEditableKey(e.key)) return;

          e.preventDefault();
          e.stopPropagation();

          const conn = selectedEl as ConnectorElement;
          const nextText = `${conn.text ?? ''}${e.key}`;
          onElementUpdate(selectedEl.id, {
            text: nextText,
            labelPosition: conn.labelPosition ?? 'on',
          } as Partial<WhiteboardElement>, false);
          openConnectorLabelEdit(selectedEl.id, 'end', { textOverride: nextText });
          return;
        }

        if (isTextEditableElement(selectedEl)) {
          if (e.isComposing) {
            e.preventDefault();
            e.stopPropagation();
            openTextEdit(selectedEl.id, 'end');
            return;
          }
          if (!isEditableKey(e.key)) return;

          e.preventDefault();
          e.stopPropagation();

          const baseText = selectedEl.text ?? '';
          const placeholder = '输入文本';
          const nextText = !baseText.trim() || baseText.trim() === placeholder
            ? e.key
            : `${baseText}${e.key}`;
          onElementUpdate(selectedEl.id, { text: nextText } as Partial<WhiteboardElement>, false);
          openTextEdit(selectedEl.id, 'end', { textOverride: nextText });
          return;
        }
      }

      if (mindmapEditElementId && mindmapActiveNodeId && buildMindmapEditProps) {
        if (e.key === 'Enter' || e.key === 'Tab') return;

        if (e.isComposing) {
          e.preventDefault();
          e.stopPropagation();
          openMindmapTextEdit(mindmapActiveNodeId);
          return;
        }

        if (!isEditableKey(e.key)) return;

        e.preventDefault();
        e.stopPropagation();

        const mm = elementsRef.current.find(
          item => item.id === mindmapEditElementId && item.type === 'mindmap',
        ) as MindmapElement | undefined;
        if (!mm) return;

        const found = findMindNode(mm.root, mindmapActiveNodeId);
        const currentText = found?.node.text ?? '';
        const nextText = isMindNodePlaceholder(currentText) ? e.key : `${currentText}${e.key}`;
        const editProps = buildMindmapEditProps(mm);
        if (!editProps) return;
        editProps.onNodeUpdate(mindmapActiveNodeId, { text: nextText });
        openMindmapTextEdit(mindmapActiveNodeId);
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    readOnly,
    inlineEditId,
    mindmapEditElementId,
    mindmapActiveNodeId,
    mindmapTextEditNodeId,
    spaceHeld,
    isPanTool,
    toolState.tool,
    openTextEdit,
    openConnectorLabelEdit,
    openMindmapTextEdit,
    onElementUpdate,
    buildMindmapEditProps,
  ]);

  const activateMindmapAtPoint = (el: MindmapElement, pt: WhiteboardPoint, startTextEdit = false) => {
    onMindmapEditElementChange?.(el.id);
    const nodeId = resolveMindmapActiveNode(el, pt);
    onMindmapActiveNodeChange?.(nodeId);
    onSelectionChange([]);
    if (startTextEdit && nodeId) {
      openMindmapTextEdit(nodeId);
    } else {
      closeMindmapTextEdit();
    }
  };

  const handleMindmapNodeClick = useCallback((elementId: string, nodeId: string) => {
    if (readOnly) return;
    onMindmapEditElementChange?.(elementId);
    onMindmapActiveNodeChange?.(nodeId);
    onSelectionChange([]);
    closeMindmapTextEdit();
    containerRef.current?.focus({ preventScroll: true });
  }, [
    readOnly,
    closeMindmapTextEdit,
    onMindmapActiveNodeChange,
    onMindmapEditElementChange,
    onSelectionChange,
  ]);

  const handleMindmapNodeDoubleClick = useCallback((elementId: string, nodeId: string) => {
    if (readOnly) return;
    onMindmapEditElementChange?.(elementId);
    onMindmapActiveNodeChange?.(nodeId);
    onSelectionChange([]);
    openMindmapTextEdit(nodeId);
  }, [
    readOnly,
    onMindmapActiveNodeChange,
    onMindmapEditElementChange,
    onSelectionChange,
    openMindmapTextEdit,
  ]);

  const handleMindmapCollapseClick = useCallback((elementId: string, nodeId: string) => {
    if (readOnly) return;
    const mm = elementsRef.current.find(
      e => e.id === elementId && e.type === 'mindmap',
    ) as MindmapElement | undefined;
    if (!mm) return;
    onMindmapEditElementChange?.(elementId);
    buildMindmapEditProps?.(mm)?.onAction('collapse', nodeId);
    onMindmapActiveNodeChange?.(nodeId);
    closeMindmapTextEdit();
  }, [
    readOnly,
    buildMindmapEditProps,
    closeMindmapTextEdit,
    onMindmapActiveNodeChange,
    onMindmapEditElementChange,
  ]);

  const handleMindmapBlankClick = useCallback((elementId: string, pt: WhiteboardPoint) => {
    if (readOnly) return;
    const mm = elementsRef.current.find(
      e => e.id === elementId && e.type === 'mindmap',
    ) as MindmapElement | undefined;
    if (!mm) return;
    activateMindmapAtPoint(mm, pt);
  }, [readOnly]);

  const handleSeqLifelineResizeStart = (id: string, e: React.PointerEvent) => {
    if (readOnly) return;
    const base = draftElements ?? elementsRef.current;
    const el = base.find(x => x.id === id);
    if (!el || el.type !== 'shape' || el.locked) return;
    dragRef.current = {
      kind: 'seq-lifeline',
      id,
      startY: e.clientY,
      originLength: resolveSeqLifelineLength(el),
    };
    setIsDragging(true);
    containerRef.current?.setPointerCapture(e.pointerId);
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
      shapeRotation: isShape ? (el as ShapeElement).rotation ?? 0 : undefined,
      elementOrigin: isShape
        ? { x: el.x, y: el.y, w: el.width, h: el.height }
        : undefined,
    };
    setIsDragging(true);
    containerRef.current?.setPointerCapture(e.pointerId);
  };

  const handleRotateStart = (id: string, e: React.PointerEvent) => {
    if (readOnly) return;
    const base = draftElements ?? elementsRef.current;
    const el = base.find(x => x.id === id);
    if (!el || el.type !== 'shape' || el.locked) return;
    const center = shapeRotationCenter(el);
    const pt = getCanvasPoint(e.clientX, e.clientY);
    dragRef.current = {
      kind: 'rotate',
      id,
      startX: e.clientX,
      startY: e.clientY,
      center,
      startAngle: Math.atan2(pt.y - center.y, pt.x - center.x),
      originRotation: el.rotation ?? 0,
      active: false,
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
    if (isConnectorLabelEditable(hit)) {
      if (opts?.detail && opts.detail >= 2) {
        openConnectorLabelEdit(hit.id);
        return true;
      }
      if (!opts?.onPointerUp) return false;

      const now = Date.now();
      const last = lastClickRef.current;
      if (last && last.id === hit.id && now - last.time <= 450) {
        openConnectorLabelEdit(hit.id);
        return true;
      }
      lastClickRef.current = { id: hit.id, time: now };
      return false;
    }
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

    const activeToolState = toolStateRef?.current ?? toolState;

    const target = e.target as HTMLElement;
    if (target.closest('[data-wb-mindmap-text-edit]')) {
      return;
    }
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

    if (toolState.tool === 'comment' && commentsEnabled && onRequestAddComment) {
      const hit = hitElementAtPoint(elementsRef.current, pt);
      if (hit?.type === 'mindmap') {
        const mm = hit as MindmapElement;
        const mmHit = hitMindmapAtPoint(mm, pt);
        if (mmHit.kind === 'node' && mmHit.nodeId) {
          const node = findMindNode(mm.root, mmHit.nodeId)?.node;
          const pin = defaultPinForElement(mm, mmHit.nodeId);
          onRequestAddComment({
            elementId: mm.id,
            mindNodeId: mmHit.nodeId,
            pinX: pin.x,
            pinY: pin.y,
            quote: node ? resolveMindmapNodeQuote(node) : resolveWhiteboardElementQuote(mm),
          });
          return;
        }
      }
      if (hit && (hit.type === 'shape' || hit.type === 'image')) {
        const pin = defaultPinForElement(hit);
        onRequestAddComment({
          elementId: hit.id,
          pinX: pin.x,
          pinY: pin.y,
          quote: resolveWhiteboardElementQuote(hit),
        });
        return;
      }
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

      const rotationHit = hitShapeRotationHandle(elementsRef.current, selectedRef.current, pt);
      if (rotationHit) {
        handleRotateStart(rotationHit, e);
        return;
      }

      const lifelineHit = hitSeqLifelineHandle(elementsRef.current, selectedRef.current, pt);
      if (lifelineHit) {
        handleSeqLifelineResizeStart(lifelineHit, e);
        return;
      }

      const resizeHit = hitResizeHandle(elementsRef.current, selectedRef.current, pt);
      if (resizeHit) {
        handleResizeStart(resizeHit.handle, e);
        return;
      }

      const selectedConn = selectedIds.length === 1
        ? elementsRef.current.find(item => item.id === selectedIds[0] && item.type === 'connector') as ConnectorElement | undefined
        : undefined;

      if (selectedConn) {
        const [start, end] = getBoardConnectorEndpoints(selectedConn, elementsRef.current);
        const route = getBoardConnectorRoute(selectedConn, elementsRef.current);

        if (selectedConn.style === 'curve') {
          const pathPoints = ensureCurvePathPoints(route, start, end);
          const handleHit = hitCurvePathHandle(pathPoints, pt);
          if (handleHit) {
            setActivePathPointIndex(handleHit.index);
            dragRef.current = {
              kind: 'path-handle',
              connectorId: selectedConn.id,
              index: handleHit.index,
              which: handleHit.which,
              origin: cloneWhiteboardElement(selectedConn) as ConnectorElement,
            };
            setIsDragging(true);
            containerRef.current?.setPointerCapture(e.pointerId);
            return;
          }
          const vertexHit = hitCurvePathVertex(pathPoints, pt);
          if (vertexHit != null) {
            if (e.altKey) {
              const nextPoints = togglePathPointKind(pathPoints, vertexHit);
              onElementUpdate(selectedConn.id, { points: nextPoints } as Partial<WhiteboardElement>, true);
              setActivePathPointIndex(vertexHit);
              return;
            }
            setActivePathPointIndex(vertexHit);
            dragRef.current = {
              kind: 'path-vertex',
              connectorId: selectedConn.id,
              index: vertexHit,
              origin: cloneWhiteboardElement(selectedConn) as ConnectorElement,
            };
            setIsDragging(true);
            containerRef.current?.setPointerCapture(e.pointerId);
            return;
          }
        }

        if (selectedConn.style === 'elbow') {
          const segOpts = connectorElbowSegmentOpts(selectedConn);
          const segHit = hitElbowSegmentHandle(route, pt, segOpts);
          if (segHit != null) {
            dragRef.current = {
              kind: 'elbow-segment',
              connectorId: selectedConn.id,
              segmentIndex: segHit,
              originRoute: route.map(p => ({ ...p })),
              startPt: pt,
              origin: cloneWhiteboardElement(selectedConn) as ConnectorElement,
            };
            setIsDragging(true);
            containerRef.current?.setPointerCapture(e.pointerId);
            return;
          }
        }
      }

      const endpoint = hitConnectorEndpoint(
        elementsRef.current,
        selectedRef.current,
        pt,
        conn => getBoardConnectorEndpoints(conn, elementsRef.current),
      );
      if (endpoint && selectedConn?.style !== 'curve') {
        handleConnectorEndpointStart(endpoint, e);
        return;
      }

      const labelHit = hitConnectorLabelAtPoint(elementsRef.current, pt);
      if (labelHit && !labelHit.locked) {
        if (tryDoubleClickTextEdit(labelHit, { detail: e.detail })) {
          return;
        }
        const layout = getBoardConnectorLabelLayout(labelHit, elementsRef.current);
        if (layout) {
          onSelectionChange([labelHit.id]);
          setInlineEditId(null);
          setInlineTextOverride(null);
          setInlineEditFocus('select-all');
          dragRef.current = {
            kind: 'connector-label',
            connectorId: labelHit.id,
            startPt: pt,
            originPosition: layout.position,
            frame: layout.frame,
            active: false,
          };
          setIsDragging(true);
          containerRef.current?.setPointerCapture(e.pointerId);
          return;
        }
      }

      const hit = hitElementAtPoint(elementsRef.current, pt);

      if (mindmapEditElementId && hit?.type === 'mindmap' && hit.id === mindmapEditElementId) {
        const mm = hit as MindmapElement;
        const mmHit = hitMindmapAtPoint(mm, pt);
        if (mmHit.kind === 'collapseButton' && mmHit.nodeId) {
          handleMindmapCollapseClick(mm.id, mmHit.nodeId);
          return;
        }
        if (mmHit.kind === 'node' && mmHit.nodeId) {
          handleMindmapNodeClick(mm.id, mmHit.nodeId);
          return;
        }
      }

      if (hit?.type === 'mindmap') {
        const mm = hit as MindmapElement;
        const mmHit = hitMindmapAtPoint(mm, pt);
        if (mmHit.kind === 'collapseButton' && mmHit.nodeId) {
          handleMindmapCollapseClick(mm.id, mmHit.nodeId);
          return;
        }
        if (mmHit.kind === 'node' && mmHit.nodeId) {
          handleMindmapNodeClick(mm.id, mmHit.nodeId);
          return;
        }
        if (mindmapEditElementId === mm.id) {
          activateMindmapAtPoint(mm, pt);
          return;
        }
        handleMindmapDragStart(e, mm.id);
        return;
      }

      onMindmapEditElementChange?.(null);
      onMindmapActiveNodeChange?.(null);
      closeMindmapTextEdit();

      if (hit && tryDoubleClickTextEdit(hit, { detail: e.detail })) {
        return;
      }

      setInlineEditId(null);
      setInlineTextOverride(null);
      setInlineEditFocus('select-all');

      if (hit) {
        containerRef.current?.focus({ preventScroll: true });
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

    if (activeToolState.tool === 'connector') {
      if (!isConnectorSubSelectionReady(activeToolState)) return;
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

    if (activeToolState.tool === 'shape') {
      if (!isToolSubSelectionReady(activeToolState) || !activeToolState.shapeKind) return;
      const rect = createPreview && createPreview.w > 0 && createPreview.h > 0
        ? createPreview
        : computePlacementPreviewRect(activeToolState, pt);
      const el = createShapeElement(
        activeToolState.shapeKind,
        rect.x,
        rect.y,
        elementsRef.current.length,
        activeToolState.shapeCategoryId
          ? { shapeCategoryId: activeToolState.shapeCategoryId }
          : undefined,
      );
      const placed = { ...el, width: rect.w, height: rect.h };
      onElementsChange([...elementsRef.current, placed]);
      onSelectionChange([placed.id]);
      openTextEdit(placed.id);
      setCreatePreview(null);
      revertToSelectAfterCreate();
      onShapePlaced?.();
      return;
    }

    if (activeToolState.tool === 'section') {
      if (!isToolSubSelectionReady(activeToolState)) return;
      const sectionAspect = activeToolState.sectionAspect ?? undefined;
      if (!sectionAspect) return;
      const lockAspect = sectionCreateLockAspect(sectionAspect, e.shiftKey);
      // 固定比例分区：单击即按预览尺寸放置（与鼠标跟随预览一致）
      if (isFixedSectionAspect(sectionAspect) && !e.shiftKey) {
        const rect = createPreview && createPreview.w > 0 && createPreview.h > 0
          ? createPreview
          : computePlacementPreviewRect(activeToolState, pt);
        const el = createSectionElement(sectionAspect, rect.x, rect.y, elementsRef.current.length);
        onElementsChange([...elementsRef.current, { ...el, width: rect.w, height: rect.h }]);
        onSelectionChange([el.id]);
        setCreatePreview(null);
        revertToSelectAfterCreate();
        return;
      }
      dragRef.current = { kind: 'create', start: pt, lockAspect, sectionAspect };
      setCreatePreview({ x: pt.x, y: pt.y, w: 0, h: 0 });
      setIsDragging(true);
      containerRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    if (activeToolState.tool === 'text') {
      const el = createTextElement(pt.x, pt.y, elementsRef.current.length);
      onElementsChange([...elementsRef.current, el]);
      onSelectionChange([el.id]);
      revertToSelectAfterCreate();
      return;
    }

    if (activeToolState.tool === 'sticky') {
      if (!activeToolState.stickyColor) return;
      const rect = computePlacementPreviewRect(activeToolState, pt);
      const el = createStickyElement(rect.x, rect.y, activeToolState.stickyColor, elementsRef.current.length);
      onElementsChange([...elementsRef.current, el]);
      onSelectionChange([el.id]);
      revertToSelectAfterCreate();
      return;
    }

    if (activeToolState.tool === 'table') {
      const rect = computePlacementPreviewRect(activeToolState, pt);
      const el = createTableElement(rect.x, rect.y, elementsRef.current.length);
      onElementsChange([...elementsRef.current, el]);
      onSelectionChange([el.id]);
      revertToSelectAfterCreate();
      return;
    }

    if (activeToolState.tool === 'mindmap') {
      if (!activeToolState.mindmapLayout) return;
      const rect = computePlacementPreviewRect(activeToolState, pt);
      const el = createMindmapElement(activeToolState.mindmapLayout, rect.x, rect.y, elementsRef.current.length) as MindmapElement;
      onElementsChange([...elementsRef.current, el]);
      onSelectionChange([]);
      onMindmapEditElementChange?.(el.id);
      onMindmapActiveNodeChange?.(el.root.id);
      revertToSelectAfterCreate();
      return;
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
      const mm = hit as MindmapElement;
      if (mindmapEditElementId === mm.id) {
        const mmHit = hitMindmapAtPoint(mm, pt);
        if (mmHit.kind === 'node' && mmHit.nodeId) {
          activateMindmapAtPoint(mm, pt, true);
        } else {
          activateMindmapAtPoint(mm, pt);
        }
      } else {
        activateMindmapAtPoint(mm, pt);
      }
    } else if (hit.type === 'connector') {
      const conn = hit as ConnectorElement;
      if (conn.style === 'curve') {
        const [start, end] = getBoardConnectorEndpoints(conn, elementsRef.current);
        const route = ensureCurvePathPoints(conn.points, start, end);
        const closest = findClosestCurveSegment(route, pt);
        const nextPoints = insertPathPointOnSegment(route, closest.segmentIndex, closest.t);
        onElementUpdate(conn.id, { points: nextPoints } as Partial<WhiteboardElement>, true);
        setActivePathPointIndex(closest.segmentIndex + 1);
        onSelectionChange([conn.id]);
        return;
      }
      openConnectorLabelEdit(hit.id);
    } else if (hit.type === 'table') {
      const cell = hitTableCell(hit as TableElement, pt);
      if (cell) openTableCellEdit(hit.id, cell.row, cell.col);
    } else if (isTextEditableElement(hit)) {
      openTextEdit(hit.id);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const pt = getCanvasPoint(e.clientX, e.clientY);
    lastPointerPtRef.current = pt;

    if (!drag) {
      if (readOnly || spaceHeld || isPanTool) {
        setHoveredId(null);
        setShapeQuickAddHover(null);
        setResizeHoverHandle(null);
        setRotationHover(false);
        setCreatePreview(null);
        return;
      }
      if (isPlacementTool(toolState.tool)) {
        updatePlacementPreview(pt);
        setHoveredId(null);
        setConnectTarget(null);
        setShapeQuickAddHover(null);
        setResizeHoverHandle(null);
        setRotationHover(false);
        return;
      }
      if (toolState.tool === 'select') {
        const resizeHit = hitResizeHandle(elementsRef.current, selectedRef.current, pt);
        setResizeHoverHandle(resizeHit?.handle ?? null);

        const rotHover = !resizeHit
          && !!hitShapeRotationHandle(elementsRef.current, selectedRef.current, pt);
        setRotationHover(rotHover);

        const quickAddShape = selectedIds.length === 1
          ? renderElements.find(e => e.id === selectedIds[0])
          : null;
        if (!resizeHit && !rotHover && quickAddShape?.type === 'shape' && !quickAddShape.locked) {
          setShapeQuickAddHover(hitShapeQuickAdd(quickAddShape as ShapeElement, pt));
        } else {
          setShapeQuickAddHover(null);
        }

        const el = hitElementAtPoint(renderElements, pt);
        setHoveredId(el?.id ?? null);

        if (mindmapEditElementId && el?.type === 'mindmap' && el.id === mindmapEditElementId) {
          const mmHit = hitMindmapAtPoint(el as MindmapElement, pt);
          setMindmapCollapseHoverId(mmHit.kind === 'collapseButton' ? mmHit.nodeId ?? null : null);
        } else {
          setMindmapCollapseHoverId(null);
        }

        setConnectTarget(null);
      } else if (toolState.tool === 'connector') {
        const fromPoint = liveConnector?.start;
        const snap = findConnectionSnap(renderElements, pt, { fromPoint });
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
        setRotationHover(false);
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
        capturePointer(e);
      }
      const snap = e.shiftKey || drag.snap;
      applyMove(e.clientX, e.clientY, snap, false);
      return;
    }

    if (drag.kind === 'seq-lifeline') {
      const vp = draftViewport ?? viewportRef.current;
      const dy = (e.clientY - drag.startY) / vp.zoom;
      const newLength = Math.max(SEQ_LIFELINE_MIN_LENGTH, drag.originLength + dy);
      const base = draftElements ?? elementsRef.current;
      setDraftElements(base.map(el => (
        el.id === drag.id && el.type === 'shape'
          ? { ...el, seqLifelineLength: newLength }
          : el
      )));
      return;
    }

    if (drag.kind === 'resize') {
      const vp = draftViewport ?? viewportRef.current;
      let dx = (e.clientX - drag.startX) / vp.zoom;
      let dy = (e.clientY - drag.startY) / vp.zoom;
      if (drag.shapeRotation) {
        ({ dx, dy } = shapeInteractionDelta(drag.shapeRotation, dx, dy));
      }
      const base = draftElements ?? elementsRef.current;
      const el = base.find(x => x.id === drag.id);
      if (!el) return;

      const refBoxes = getAlignmentRefBoxes(base, new Set([drag.id]));
      let resizeBox: { x: number; y: number; w: number; h: number };
      let next: WhiteboardElement;

      if (el.type === 'shape' && drag.shapeKind && drag.elementOrigin
        && isUniformScaledShapeKind(drag.shapeKind)) {
        resizeBox = computeUniformScaledVisualBox(
          drag.shapeKind,
          drag.origin,
          drag.handle,
          dx,
          dy,
        );
        const snapped = snapResizeBox(resizeBox, drag.handle, refBoxes, undefined, vp.zoom);
        resizeBox = normalizeUniformScaledVisualBox(
          drag.shapeKind,
          drag.origin,
          snapped.box,
          drag.handle,
        );
        setAlignmentGuides(snapped.guides);

        const elemBox = elementBoxFromUniformScaledVisual(
          drag.shapeKind,
          resizeBox,
          drag.origin,
          drag.elementOrigin,
          drag.handle,
        );
        next = { ...el, x: elemBox.x, y: elemBox.y, width: elemBox.w, height: elemBox.h };
      } else {
        let resized = resizeElement(el, drag.handle, dx, dy, drag.origin, drag.lockAspect);
        resizeBox = { x: resized.x, y: resized.y, w: resized.width, h: resized.height };
        const snapped = snapResizeBox(resizeBox, drag.handle, refBoxes, undefined, vp.zoom);
        resizeBox = snapped.box;
        setAlignmentGuides(snapped.guides);

        if (el.type === 'shape' && drag.shapeKind) {
          const elemBox = elementBoxFromVisualBounds(
            drag.shapeKind,
            resizeBox,
            drag.elementOrigin,
          );
          next = { ...el, x: elemBox.x, y: elemBox.y, width: elemBox.w, height: elemBox.h };
        } else {
          next = { ...el, x: resizeBox.x, y: resizeBox.y, width: resizeBox.w, height: resizeBox.h };
        }
      }

      const resized = syncBoardConnectors(base.map(item => (
        item.id === drag.id ? next : item
      )));
      setDraftElements(resized);
      return;
    }

    if (drag.kind === 'rotate') {
      if (!drag.active) {
        const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
        if (moved < DRAG_THRESHOLD) return;
        dragRef.current = { ...drag, active: true };
        setIsDragging(true);
      }
      const activeDrag = dragRef.current;
      if (!activeDrag || activeDrag.kind !== 'rotate') return;
      const nextRotation = rotationFromPointerDrag(
        activeDrag.originRotation,
        activeDrag.center,
        activeDrag.startAngle,
        pt,
      );
      const base = draftElements ?? elementsRef.current;
      setDraftElements(base.map(el => (
        el.id === activeDrag.id ? { ...el, rotation: nextRotation } : el
      )));
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
      const endSnap = findConnectionSnap(elementsRef.current, pt, {
        excludeId: exclude,
        fromPoint: drag.start,
      });
      let endPt = endSnap?.point ?? pt;
      if (!endSnap && toolState.connectorStyle && isStraightConnectorStyle(toolState.connectorStyle)) {
        endPt = snapPointToHV(drag.start, pt);
      }

      let startPt = drag.start;
      let startBind = drag.startBind;
      if (startBind) {
        const startEl = elementsRef.current.find(e => e.id === startBind!.elementId);
        if (startEl) {
          const resolved = resolveConnectionBindForElement(startEl, endPt);
          if (resolved) {
            startPt = resolved.point;
            startBind = makeConnectorBind(resolved.elementId, resolved.anchor);
          }
        }
      }

      dragRef.current = { ...drag, current: endPt, start: startPt, startBind };
      setConnectTarget(endSnap ? { elementId: endSnap.elementId, anchor: endSnap.anchor } : null);
      setLiveConnector({ start: startPt, end: endPt });
      return;
    }

    if (drag.kind === 'connector-endpoint') {
      const exclude = drag.end === 'start'
        ? drag.origin.endBind?.elementId
        : drag.origin.startBind?.elementId;
      const [startPt, endPt] = getBoardConnectorEndpoints(drag.origin, elementsRef.current);
      const fixed = drag.end === 'start' ? endPt : startPt;
      const snap = findConnectionSnap(elementsRef.current, pt, {
        excludeId: exclude,
        fromPoint: fixed,
      });
      let bindPt = snap?.point ?? pt;
      if (snap) {
        const boundEl = elementsRef.current.find(e => e.id === snap.elementId);
        if (boundEl) {
          const facing = resolveConnectionBindForElement(boundEl, fixed);
          if (facing) {
            bindPt = facing.point;
            snap = facing;
          }
        }
      }
      if (!snap && isStraightConnectorStyle(drag.origin.style)) {
        bindPt = snapPointToHV(fixed, pt);
      }
      const base = draftElements ?? elementsRef.current;
      const updated = base.map(el => {
        if (el.id !== drag.connectorId || el.type !== 'connector') return el;
        const conn = cloneWhiteboardElement(drag.origin) as ConnectorElement;
        const pts: ConnectorPathPoint[] = [...conn.points];
        if (drag.end === 'start') {
          pts[0] = { ...pts[0], x: bindPt.x, y: bindPt.y };
          conn.startBind = snap ? makeConnectorBind(snap.elementId, snap.anchor) : undefined;
        } else {
          const last = Math.max(pts.length - 1, 1);
          pts[last] = { ...pts[last], x: bindPt.x, y: bindPt.y };
          conn.endBind = snap ? makeConnectorBind(snap.elementId, snap.anchor) : undefined;
        }
        conn.points = pts;
        return conn;
      });
      setDraftElements(syncBoardConnectors(updated));
      setConnectTarget(snap ? { elementId: snap.elementId, anchor: snap.anchor } : null);
      return;
    }

    if (drag.kind === 'path-handle') {
      const base = draftElements ?? elementsRef.current;
      const updated = base.map(el => {
        if (el.id !== drag.connectorId || el.type !== 'connector') return el;
        const conn = cloneWhiteboardElement(drag.origin) as ConnectorElement;
        const [start, end] = getBoardConnectorEndpoints(conn, base);
        const route = ensureCurvePathPoints(conn.points, start, end);
        conn.points = smoothCurvePath(movePathHandle(route, drag.index, drag.which, pt));
        return conn;
      });
      setDraftElements(syncBoardConnectors(updated));
      return;
    }

    if (drag.kind === 'path-vertex') {
      const exclude = drag.index === 0
        ? drag.origin.endBind?.elementId
        : drag.origin.startBind?.elementId;
      const snap = findConnectionSnap(elementsRef.current, pt, { excludeId: exclude });
      let pos = snap?.point ?? pt;
      const base = draftElements ?? elementsRef.current;
      const updated = base.map(el => {
        if (el.id !== drag.connectorId || el.type !== 'connector') return el;
        const conn = cloneWhiteboardElement(drag.origin) as ConnectorElement;
        const [start, end] = getBoardConnectorEndpoints(conn, base);
        const route = ensureCurvePathPoints(conn.points, start, end);
        let nextPoints = movePathVertex(route, drag.index, pos);
        if (drag.index === 0) {
          nextPoints[0] = { ...nextPoints[0], x: pos.x, y: pos.y };
          conn.startBind = snap ? makeConnectorBind(snap.elementId, snap.anchor) : undefined;
          nextPoints = refitCurvePathToEndpoints(nextPoints, pos, end);
        } else if (drag.index === nextPoints.length - 1) {
          const last = nextPoints.length - 1;
          nextPoints[last] = { ...nextPoints[last], x: pos.x, y: pos.y };
          conn.endBind = snap ? makeConnectorBind(snap.elementId, snap.anchor) : undefined;
          nextPoints = refitCurvePathToEndpoints(nextPoints, start, pos);
        } else {
          nextPoints = smoothCurvePath(nextPoints);
        }
        conn.points = nextPoints;
        return conn;
      });
      setDraftElements(syncBoardConnectors(updated));
      setConnectTarget(snap ? { elementId: snap.elementId, anchor: snap.anchor } : null);
      return;
    }

    if (drag.kind === 'elbow-segment') {
      const dx = pt.x - drag.startPt.x;
      const dy = pt.y - drag.startPt.y;
      const base = draftElements ?? elementsRef.current;
      const updated = base.map(el => {
        if (el.id !== drag.connectorId || el.type !== 'connector') return el;
        const conn = cloneWhiteboardElement(drag.origin) as ConnectorElement;
        const segOpts = connectorElbowSegmentOpts(conn);
        const nextPoints = dragElbowSegment(drag.originRoute, drag.segmentIndex, dx, dy, {
          ...segOpts,
          merge: false,
        });
        const xs = nextPoints.map(p => p.x);
        const ys = nextPoints.map(p => p.y);
        return {
          ...conn,
          pathMode: 'manual',
          points: nextPoints,
          x: Math.min(...xs),
          y: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs) || 1,
          height: Math.max(...ys) - Math.min(...ys) || 1,
        };
      });
      setDraftElements(updated);
      return;
    }

    if (drag.kind === 'connector-label') {
      if (!drag.active && dist(drag.startPt, pt) > DRAG_THRESHOLD / viewportRef.current.zoom) {
        dragRef.current = { ...drag, active: true };
      }
      const activeDrag = dragRef.current;
      if (activeDrag?.kind === 'connector-label' && activeDrag.active) {
        const projection = projectPointOnConnectorNormal(activeDrag.frame, pt);
        const nextPosition = snapConnectorLabelPosition(projection);
        const base = draftElements ?? elementsRef.current;
        setDraftElements(base.map(el => {
          if (el.id !== activeDrag.connectorId || el.type !== 'connector') return el;
          if ((el.labelPosition ?? 'on') === nextPosition) return el;
          return { ...el, labelPosition: nextPosition };
        }));
      }
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

    if (drag.kind === 'seq-lifeline') {
      if (draftElements) onElementsChange(draftElements, true);
      endDrag();
      return;
    }

    if (drag.kind === 'resize') {
      if (draftElements) onElementsChange(draftElements, true);
      endDrag();
      return;
    }

    if (drag.kind === 'rotate') {
      if (drag.active && draftElements) {
        onElementsChange(draftElements, true);
      } else if (!drag.active) {
        onElementsChange(rotateElements(elementsRef.current, [drag.id], -90), true);
      }
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
      const endSnap = findConnectionSnap(elementsRef.current, end, {
        excludeId: exclude,
        fromPoint: drag.start,
      });
      let endPt = endSnap?.point ?? end;
      if (!endSnap && toolState.connectorStyle && isStraightConnectorStyle(toolState.connectorStyle)) {
        endPt = snapPointToHV(drag.start, end);
      }

      let startPt = drag.start;
      let startBind = drag.startBind;
      if (startBind) {
        const startEl = elementsRef.current.find(e => e.id === startBind!.elementId);
        if (startEl) {
          const resolved = resolveConnectionBindForElement(startEl, endPt);
          if (resolved) {
            startPt = resolved.point;
            startBind = makeConnectorBind(resolved.elementId, resolved.anchor);
          }
        }
      }

      if (dist(startPt, endPt) > 8 && toolState.connectorStyle) {
        const conn = createConnectorElement(
          toolState.connectorStyle,
          startPt.x,
          startPt.y,
          endPt.x,
          endPt.y,
          elementsRef.current.length,
          {
            startBind,
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
      if (draftElements) onElementsChange(syncBoardConnectors(draftElements), true);
      endDrag();
      return;
    }

    if (drag.kind === 'path-handle' || drag.kind === 'path-vertex' || drag.kind === 'elbow-segment') {
      if (draftElements) onElementsChange(syncBoardConnectors(draftElements), true);
      endDrag();
      return;
    }

    if (drag.kind === 'connector-label') {
      if (drag.active && draftElements) {
        onElementsChange(draftElements, true);
      } else if (!drag.active) {
        const conn = elementsRef.current.find(item => item.id === drag.connectorId);
        if (conn) tryDoubleClickTextEdit(conn, { onPointerUp: true });
      }
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
        if (toolState.tool === 'shape' || toolState.tool === 'section') {
          rect = computePlacementPreviewRect(toolState, drag.start);
        } else {
          rect = { x: drag.start.x, y: drag.start.y, w: 120, h: 80 };
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
        if (!toolState.shapeKind) {
          endDrag();
          return;
        }
        el = createShapeElement(
          toolState.shapeKind,
          rect.x,
          rect.y,
          elementsRef.current.length,
          toolState.shapeCategoryId ? { shapeCategoryId: toolState.shapeCategoryId } : undefined,
        );
        el = { ...el, width: rect.w, height: rect.h };
      } else {
        const aspect = drag.sectionAspect ?? toolState.sectionAspect;
        if (!aspect) {
          endDrag();
          return;
        }
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
    setInlineTextOverride(null);
    onElementUpdate(id, { text } as Partial<WhiteboardElement>, false);
  };

  const handleTextEditClose = (id: string) => {
    const el = elementsRef.current.find(item => item.id === id);
    if (el && 'text' in el) {
      onElementUpdate(id, { text: el.text ?? '' } as Partial<WhiteboardElement>, true);
    }
    setInlineTextOverride(null);
    setInlineEditId(null);
    setInlineEditFocus('select-all');
  };

  const handleShapePatch = (id: string, patch: Partial<ShapeElement>, recordHistory?: boolean) => {
    onElementUpdate(id, patch as Partial<WhiteboardElement>, recordHistory);
  };

  const handleTextPatch = (id: string, patch: Partial<TextElement>, recordHistory?: boolean) => {
    onElementUpdate(id, patch as Partial<WhiteboardElement>, recordHistory);
  };

  const handleImagePatch = (id: string, patch: Partial<ImageElement>, recordHistory?: boolean) => {
    onElementUpdate(id, patch as Partial<WhiteboardElement>, recordHistory);
  };

  const handleConnectorPatch = (id: string, patch: Partial<ConnectorElement>, recordHistory?: boolean) => {
    const el = elementsRef.current.find(item => item.id === id);
    if (el?.type === 'connector' && patch.style && patch.style !== el.style) {
      const converted = convertBoardConnectorStyle(el, elementsRef.current, patch.style);
      onElementsChange(
        syncBoardConnectors(elementsRef.current.map(item => (item.id === id ? converted : item))),
        recordHistory,
      );
      return;
    }
    if (patch.pathMode === 'auto' && el?.type === 'connector') {
      onElementsChange(
        syncBoardConnectors(elementsRef.current.map(item => (
          item.id === id ? { ...item, ...patch } as WhiteboardElement : item
        ))),
        recordHistory,
      );
      return;
    }
    onElementUpdate(id, patch as Partial<WhiteboardElement>, recordHistory);
  };

  const openTableCellEdit = useCallback((tableId: string, row: number, col: number) => {
    if (selectedRef.current.length !== 1 || selectedRef.current[0] !== tableId) {
      onSelectionChange([tableId]);
    }
    setInlineEditId(null);
    setInlineTextOverride(null);
    setTableEditCell({ tableId, row, col });
  }, [onSelectionChange]);

  const handleTableCellChange = useCallback((tableId: string, row: number, col: number, text: string) => {
    const el = elementsRef.current.find(item => item.id === tableId);
    if (!el || el.type !== 'table') return;
    const cells = el.cells.map((r, ri) => (
      ri === row ? r.map((c, ci) => (ci === col ? text : c)) : [...r]
    ));
    onElementUpdate(tableId, { cells } as Partial<WhiteboardElement>, false);
  }, [onElementUpdate]);

  const handleTableCellEditClose = useCallback((tableId: string) => {
    onElementUpdate(tableId, {}, true);
    setTableEditCell(null);
  }, [onElementUpdate]);

  const handleTablePatch = useCallback((id: string, patch: Partial<TableElement>, recordHistory?: boolean) => {
    onElementUpdate(id, patch as Partial<WhiteboardElement>, recordHistory);
  }, [onElementUpdate]);

  const handleInsertTableRow = useCallback((tableId: string, at: number) => {
    const el = elementsRef.current.find(item => item.id === tableId);
    if (!el || el.type !== 'table') return;
    const next = insertTableRow(el as TableElement, at);
    onElementUpdate(tableId, {
      rows: next.rows,
      cells: next.cells,
      height: next.height,
    } as Partial<WhiteboardElement>, true);
  }, [onElementUpdate]);

  const handleInsertTableCol = useCallback((tableId: string, at: number) => {
    const el = elementsRef.current.find(item => item.id === tableId);
    if (!el || el.type !== 'table') return;
    const next = insertTableCol(el as TableElement, at);
    onElementUpdate(tableId, {
      cols: next.cols,
      cells: next.cells,
      width: next.width,
    } as Partial<WhiteboardElement>, true);
  }, [onElementUpdate]);

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

  const selectedConnector = selectedIds.length === 1
    ? renderElements.find(
      (el): el is ConnectorElement => el.id === selectedIds[0] && el.type === 'connector',
    )
    : null;

  const selectedTable = selectedIds.length === 1
    ? renderElements.find(
      (el): el is TableElement => el.id === selectedIds[0] && el.type === 'table',
    )
    : null;

  const selectedImage = selectedIds.length === 1
    ? renderElements.find(
      (el): el is ImageElement => el.id === selectedIds[0] && el.type === 'image',
    )
    : null;

  const inlineEditElement = inlineEditId
    ? renderElements.find(el => el.id === inlineEditId)
    : null;

  const inlineEditConnector = inlineEditElement?.type === 'connector'
    ? inlineEditElement as ConnectorElement
    : null;

  const editingMindmap = mindmapEditElementId
    ? renderElementsForPaint.find(
      (el): el is MindmapElement => el.id === mindmapEditElementId && el.type === 'mindmap',
    )
    : null;
  const inlineMindmapNode = mindmapTextEditNodeId && editingMindmap
    ? findMindNode(editingMindmap.root, mindmapTextEditNodeId)?.node ?? null
    : null;
  const inlineMindmapBounds = mindmapTextEditNodeId && editingMindmap
    ? getMindmapNodeScreenBounds(editingMindmap, mindmapTextEditNodeId, renderViewport)
    : null;
  const inlineMindmapLayoutNode = mindmapTextEditNodeId && editingMindmap
    ? computeMindMapLayout(
      editingMindmap.root,
      editingMindmap.layout,
      editingMindmap.branchStyle ?? WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT,
      createWhiteboardMeasureOptions(),
    ).nodes.find(n => n.id === mindmapTextEditNodeId) ?? null
    : null;
  const inlineMindmapTextStyle = inlineMindmapNode && inlineMindmapLayoutNode
    ? resolveMindmapTextEditStyle(
      inlineMindmapNode,
      inlineMindmapLayoutNode,
      resolveTheme('whiteboard'),
      renderViewport.zoom,
    )
    : null;

  const activeMindmapLayoutNode = editingMindmap && mindmapActiveNodeId && !mindmapTextEditNodeId
    ? computeThemedMindMapLayout(
      editingMindmap.root,
      editingMindmap.layout,
      editingMindmap.branchStyle ?? WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT,
      'whiteboard',
    ).nodes.find(n => n.id === mindmapActiveNodeId) ?? null
    : null;
  const activeMindmapNodeBounds = activeMindmapLayoutNode && editingMindmap && mindmapActiveNodeId
    ? getMindmapNodeScreenBounds(editingMindmap, mindmapActiveNodeId, renderViewport)
    : null;
  const activeMindmapQuickActions = activeMindmapLayoutNode && editingMindmap
    ? getMindmapQuickActionLayout(activeMindmapLayoutNode, editingMindmap.layout)
    : null;
  const activeMindmapNode = editingMindmap && mindmapActiveNodeId
    ? findMindNode(editingMindmap.root, mindmapActiveNodeId)?.node ?? null
    : null;
  const mindmapToolbarAnchor = activeMindmapNodeBounds
    ? {
      x: activeMindmapNodeBounds.x + activeMindmapNodeBounds.w / 2,
      y: activeMindmapNodeBounds.y,
    }
    : null;
  const mindmapToolbarTopGap = activeMindmapLayoutNode && editingMindmap
    ? 12 + computeMindmapQuickActionTopExtent(activeMindmapLayoutNode, editingMindmap.layout) * renderViewport.zoom
    : 12;

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

  const connectorToolbarAnchor = selectedConnector && !selectedConnector.locked
    ? (() => {
      const route = getBoardConnectorRoute(selectedConnector, renderElements);
      return computeConnectorToolbarScreenAnchor(route, renderViewport);
    })()
    : null;

  const tableToolbarAnchor = selectedTable && !selectedTable.locked
    ? {
      x: renderViewport.x + (selectedTable.x + selectedTable.width / 2) * renderViewport.zoom,
      y: renderViewport.y + (selectedTable.y + selectedTable.height) * renderViewport.zoom,
    }
    : null;

  const imageToolbarAnchor = selectedImage && !selectedImage.locked
    ? {
      x: renderViewport.x + (selectedImage.x + selectedImage.width / 2) * renderViewport.zoom,
      y: renderViewport.y + selectedImage.y * renderViewport.zoom,
    }
    : null;

  const requestCommentForElement = (
    el: WhiteboardElement,
    mindNodeId?: string,
  ) => {
    if (!onRequestAddComment) return;
    const pin = defaultPinForElement(el, mindNodeId);
    const quote = mindNodeId && el.type === 'mindmap'
      ? resolveMindmapNodeQuote(findMindNode(el.root, mindNodeId)?.node ?? { text: '' })
      : resolveWhiteboardElementQuote(el);
    onRequestAddComment({
      elementId: el.id,
      mindNodeId,
      pinX: pin.x,
      pinY: pin.y,
      quote,
    });
  };

  const editingTable = tableEditCell
    ? renderElements.find(
      (el): el is TableElement => el.id === tableEditCell.tableId && el.type === 'table',
    ) ?? null
    : null;
  const editingTableCellBounds = editingTable && tableEditCell
    ? tableCellCanvasRect(editingTable, tableEditCell.row, tableEditCell.col)
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
      tabIndex={-1}
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
      onPointerEnter={(e) => {
        const pt = getCanvasPoint(e.clientX, e.clientY);
        lastPointerPtRef.current = pt;
        updatePlacementPreview(pt);
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={() => {
        lastPointerPtRef.current = null;
        if (!dragRef.current && isPlacementTool(toolState.tool)) {
          setCreatePreview(null);
        }
      }}
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
        elements={renderElementsForPaint}
        viewport={renderViewport}
        editingMindmapId={mindmapEditElementId}
        activeNodeId={mindmapActiveNodeId}
        textEditNodeId={mindmapTextEditNodeId}
        selectMode={toolState.tool === 'select' && !spaceHeld}
        readOnly={readOnly}
        buildMindmapEditProps={buildMindmapEditProps}
        onBoundsChange={handleMindmapBoundsChange}
        onMindmapFocus={onMindmapFocus}
        onMindmapDragStart={handleMindmapDragStart}
        onMindmapRootDragStart={handleMindmapRootDragStart}
        getCanvasPoint={getCanvasPoint}
        onMindmapNodeClick={handleMindmapNodeClick}
        onMindmapNodeDoubleClick={handleMindmapNodeDoubleClick}
        onMindmapBlankClick={handleMindmapBlankClick}
        onMindmapCollapseClick={handleMindmapCollapseClick}
        mindmapLayerNodesRef={mindmapLayerNodesRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />

      {lockBadgeAnchor && onToggleLock && (
        <SelectionLockBadge
          anchorX={lockBadgeAnchor.x}
          anchorY={lockBadgeAnchor.y}
          onUnlock={onToggleLock}
        />
      )}

      {selectedShape && shapeToolbarAnchor && !readOnly && toolState.tool === 'select' && !inlineEditId && !isDragging && !suppressFloatingToolbar && (
        <ShapeFormatToolbar
          element={selectedShape}
          anchorX={shapeToolbarAnchor.x}
          anchorY={shapeToolbarAnchor.y}
          onPatch={(patch, recordHistory) => handleShapePatch(selectedShape.id, patch, recordHistory)}
          onAddComment={commentsEnabled && onRequestAddComment
            ? () => requestCommentForElement(selectedShape)
            : undefined}
        />
      )}

      {selectedText && textToolbarAnchor && !readOnly && toolState.tool === 'select' && !isDragging && !suppressFloatingToolbar && (
        <ShapeFormatToolbar
          variant="text"
          element={selectedText}
          anchorX={textToolbarAnchor.x}
          anchorY={textToolbarAnchor.y}
          onPatch={(patch, recordHistory) => handleTextPatch(selectedText.id, patch, recordHistory)}
        />
      )}

      {selectedTable && tableToolbarAnchor && !readOnly && toolState.tool === 'select' && !tableEditCell && !isDragging && !suppressFloatingToolbar && (
        <ShapeFormatToolbar
          variant="table"
          element={selectedTable}
          anchorX={tableToolbarAnchor.x}
          anchorY={tableToolbarAnchor.y}
          placement="below"
          onPatch={(patch, recordHistory) => handleTablePatch(selectedTable.id, patch, recordHistory)}
        />
      )}

      {selectedTable && !readOnly && toolState.tool === 'select' && !tableEditCell && !isDragging && (
        <TableCanvasOverlay
          table={selectedTable}
          viewport={renderViewport}
          readOnly={readOnly}
          onInsertRow={at => handleInsertTableRow(selectedTable.id, at)}
          onInsertCol={at => handleInsertTableCol(selectedTable.id, at)}
        />
      )}

      {selectedConnector && connectorToolbarAnchor && !readOnly && toolState.tool === 'select' && !inlineEditConnector && !isDragging && !suppressFloatingToolbar && onToolbarMenuAction && (
        <ConnectorFormatToolbar
          element={selectedConnector}
          anchorX={connectorToolbarAnchor.x}
          anchorY={connectorToolbarAnchor.y}
          toolbarPlacement={connectorToolbarAnchor.placement}
          onPatch={(patch, recordHistory) => handleConnectorPatch(selectedConnector.id, patch, recordHistory)}
          onAddText={() => openConnectorLabelEdit(selectedConnector.id)}
          onReverseDirection={() => {
            const reversed = reverseConnectorDirection(selectedConnector);
            onElementsChange(
              syncBoardConnectors(renderElements.map(el => (el.id === selectedConnector.id ? reversed : el))),
              true,
            );
          }}
          onMenuAction={onToolbarMenuAction}
          onLayerAction={onLayerAction}
          canPaste={canPasteToolbar}
          activePathPointIndex={selectedConnector.style === 'curve' ? activePathPointIndex : null}
          activePathPointKind={
            selectedConnector.style === 'curve' && activePathPointIndex != null
              ? (ensureCurvePathPoints(
                selectedConnector.points,
                getBoardConnectorEndpoints(selectedConnector, renderElements)[0],
                getBoardConnectorEndpoints(selectedConnector, renderElements)[1],
              )[activePathPointIndex]?.kind ?? 'corner')
              : 'corner'
          }
          onPathPointKindChange={kind => {
            if (activePathPointIndex == null) return;
            const [start, end] = getBoardConnectorEndpoints(selectedConnector, renderElements);
            const route = ensureCurvePathPoints(selectedConnector.points, start, end);
            handleConnectorPatch(
              selectedConnector.id,
              { points: setPathPointKind(route, activePathPointIndex, kind) },
              true,
            );
          }}
        />
      )}

      {editingMindmap
        && activeMindmapNode
        && mindmapToolbarAnchor
        && mindmapActiveNodeId
        && !mindmapTextEditNodeId
        && !readOnly
        && toolState.tool === 'select'
        && !spaceHeld
        && !isDragging
        && !suppressFloatingToolbar
        && buildMindmapEditProps
        && (() => {
          const editProps = buildMindmapEditProps(editingMindmap);
          if (!editProps) return null;
          return (
            <MindmapNodeFormatToolbarWithImage
              node={activeMindmapNode}
              layout={editingMindmap.layout}
              branchStyle={editingMindmap.branchStyle ?? WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT}
              anchorX={mindmapToolbarAnchor.x}
              anchorY={mindmapToolbarAnchor.y}
              topGap={mindmapToolbarTopGap}
              onNodePatch={patch => editProps.onNodeUpdate(activeMindmapNode.id, patch)}
              onSettingsChange={patch => editProps.onSettingsChange(patch)}
              onAction={editProps.onAction}
              onAddDescription={() => {
                const next = window.prompt('编辑描述', activeMindmapNode.note ?? '');
                if (next !== null) editProps.onNodeUpdate(activeMindmapNode.id, { note: next });
              }}
              onAddImage={() => {}}
              onAddComment={commentsEnabled && onRequestAddComment && editingMindmap && activeMindmapNode
                ? () => requestCommentForElement(editingMindmap, activeMindmapNode.id)
                : undefined}
              onImageSelected={async file => {
                try {
                  const { src, width, height } = await readImageFile(file);
                  editProps.onNodeUpdate(activeMindmapNode.id, {
                    image: src,
                    imageWidth: width,
                    imageHeight: height,
                  });
                } catch {
                  // ignore
                }
              }}
            />
          );
        })()}

      {selectedImage && imageToolbarAnchor && !readOnly && toolState.tool === 'select'
        && !isDragging && !suppressFloatingToolbar && !imageCropId && onToolbarMenuAction && (
        <ImageFormatToolbar
          element={selectedImage}
          anchorX={imageToolbarAnchor.x}
          anchorY={imageToolbarAnchor.y}
          onPatch={(patch, recordHistory) => handleImagePatch(selectedImage.id, patch, recordHistory)}
          onCrop={() => setImageCropId(selectedImage.id)}
          onDownload={() => { void downloadImageElement(selectedImage); }}
          onAddComment={commentsEnabled && onRequestAddComment
            ? () => requestCommentForElement(selectedImage)
            : undefined}
          onMenuAction={onToolbarMenuAction}
          onLayerAction={onLayerAction}
          canPaste={canPasteToolbar}
        />
      )}

      {selectedImage && imageCropId === selectedImage.id && !readOnly && (
        <ImageCropOverlay
          element={selectedImage}
          viewport={renderViewport}
          onApply={patch => {
            handleImagePatch(selectedImage.id, patch, true);
            setImageCropId(null);
          }}
          onCancel={() => setImageCropId(null)}
        />
      )}

      {commentsEnabled && commentThreads.length > 0 && (
        <WbCommentPinOverlay
          threads={commentThreads}
          viewport={renderViewport}
          selectedCommentId={selectedCommentId}
          readOnly={readOnly}
          onSelect={threadId => onSelectComment?.(threadId)}
          onPinMove={readOnly ? undefined : onCommentPinMove}
        />
      )}

      {inlineEditElement
        && (inlineEditElement.type === 'text' || inlineEditElement.type === 'sticky' || inlineEditElement.type === 'shape') && (
        <CanvasInlineEditor
          element={inlineEditElement}
          viewport={renderViewport}
          focusMode={inlineEditFocus}
          textOverride={inlineTextOverride}
          onChange={text => handleTextChange(inlineEditId!, text)}
          onClose={() => handleTextEditClose(inlineEditId!)}
        />
      )}

      {inlineEditConnector && (
        <ConnectorLabelEditor
          connector={inlineEditConnector}
          elements={renderElements}
          viewport={renderViewport}
          focusMode={inlineEditFocus}
          textOverride={inlineTextOverride}
          onChange={text => handleTextChange(inlineEditConnector.id, text)}
          onClose={() => handleTextEditClose(inlineEditConnector.id)}
        />
      )}

      {editingTable && tableEditCell && editingTableCellBounds && (
        <TableCellInlineEditor
          table={editingTable}
          row={tableEditCell.row}
          col={tableEditCell.col}
          viewport={renderViewport}
          bounds={editingTableCellBounds}
          onChange={text => handleTableCellChange(tableEditCell.tableId, tableEditCell.row, tableEditCell.col, text)}
          onClose={() => handleTableCellEditClose(tableEditCell.tableId)}
        />
      )}

      {editingMindmap
        && activeMindmapLayoutNode
        && activeMindmapNodeBounds
        && activeMindmapQuickActions
        && mindmapActiveNodeId
        && !mindmapTextEditNodeId
        && !readOnly
        && toolState.tool === 'select'
        && !spaceHeld
        && !isDragging
        && buildMindmapEditProps
        && (() => {
          const editProps = buildMindmapEditProps(editingMindmap);
          if (!editProps) return null;
          return (
            <MindmapNodeQuickActions
              actions={activeMindmapQuickActions}
              screenRect={{
                left: activeMindmapNodeBounds.x,
                top: activeMindmapNodeBounds.y,
                width: activeMindmapNodeBounds.w,
                height: activeMindmapNodeBounds.h,
                zoom: renderViewport.zoom,
              }}
              layoutOrigin={{
                x: activeMindmapLayoutNode.x,
                y: activeMindmapLayoutNode.y,
              }}
              accent={resolveTheme('whiteboard').accent}
              onAddSiblingBefore={() => editProps.onAction('siblingBefore')}
              onAddSiblingAfter={() => editProps.onAction('siblingAfter')}
              onAddChild={dir => editProps.onAction(childActionForGrowDirection(dir))}
            />
          );
        })()}

      {inlineMindmapNode && inlineMindmapBounds && inlineMindmapTextStyle && editingMindmap && buildMindmapEditProps && (() => {
        const editProps = buildMindmapEditProps(editingMindmap);
        if (!editProps) return null;
        return (
          <MindmapNodeInlineEditor
            node={inlineMindmapNode}
            bounds={inlineMindmapBounds}
            textStyle={inlineMindmapTextStyle}
            lockId={`${editingMindmap.id}:${inlineMindmapNode.id}`}
            onChange={text => editProps.onNodeUpdate(inlineMindmapNode.id, { text })}
            onClose={closeMindmapTextEdit}
          />
        );
      })()}
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ConnectorElement,
  DocCommentThread,
  MindmapElement,
  MindmapLayout,
  MindNode,
  MindNoteBranchStyle,
  ShapeElement,
  ShapeKind,
  WhiteboardElement,
  WhiteboardPoint,
  WhiteboardViewport,
} from '@lingyi-doc/core';
import {
  cloneWhiteboardElement,
  deleteMindNode,
  duplicateMindNode,
  genWhiteboardId,
  insertMindChild,
  insertMindParent,
  insertMindSibling,
  nextZIndex,
  remapMindmapRootForLayout,
  toggleMindCollapse,
  updateMindNode,
  WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT,
} from '@lingyi-doc/core';
import { WhiteboardCanvas, computeFitViewport } from './WhiteboardCanvas';
import { WhiteboardControls } from './WhiteboardControls';
import { WhiteboardToolbar, DEFAULT_TOOL_STATE, type WhiteboardToolState } from './WhiteboardToolbar';
import { ShapeLibraryPanel } from './ShapeLibraryPanel';
import './shapes/initShapeRegistry';
import type { WhiteboardMindmapEditProps } from './WhiteboardMindmapView';
import type { WbMindmapAction } from './mindmap';
import { computeMindmapElementSize } from './mindmap/syncMindmapBounds';
import { copyElementsAsImage } from './copySelectionImage';
import {
  readWhiteboardClipboardFromDataTransfer,
  readWhiteboardClipboardFromSystem,
  writeWhiteboardClipboard,
} from './whiteboardClipboard';
import { expandIdsWithSectionContents, ensureElementsAboveSections } from './sectionUtils';
import {
  applyShapeStyle,
  canCopyStyle,
  canTransformElement,
  extractShapeStyle,
  flipElements,
  reorderZIndex,
  rotateElements,
  toggleLockElements,
  type CopiedShapeStyle,
  type ZOrderAction,
} from './elementActions';
import { WhiteboardContextMenu, type WhiteboardContextMenuAction } from './WhiteboardContextMenu';
import { WB_COLORS } from './styles';
import {
  createWhiteboardImageElement,
  extractImageFileFromClipboard,
  loadImageFromBlob,
  readImageBlobFromSystemClipboard,
} from './pasteImage';
import { clampZoom, screenToCanvasPoint, translateElement, zoomViewportCenter } from './viewportUtils';
import { retargetShapeKind } from './canvas/shapePaths';
import { DocImageInsertDialog, type InsertImagePayload } from '../doc/DocImageInsertDialog';
import { validateImageFile } from '../doc/imageUtils';

export interface WhiteboardEditorProps {
  title: string;
  elements: WhiteboardElement[];
  viewport: WhiteboardViewport;
  canUndo: boolean;
  canRedo: boolean;
  readOnly?: boolean;
  embedded?: boolean;
  onTitleChange?: (title: string) => void;
  onElementsChange: (elements: WhiteboardElement[], recordHistory?: boolean) => void;
  onViewportChange: (viewport: Partial<WhiteboardViewport>, recordHistory?: boolean) => void;
  onElementUpdate: (id: string, patch: Partial<WhiteboardElement>, recordHistory?: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  commentsEnabled?: boolean;
  commentThreads?: DocCommentThread[];
  selectedCommentId?: string | null;
  onSelectComment?: (threadId: string) => void;
  onCommentPinMove?: (threadId: string, pinX: number, pinY: number) => void;
  onRequestAddComment?: (input: {
    elementId: string;
    mindNodeId?: string;
    pinX: number;
    pinY: number;
    quote: string;
  }) => void;
}

function isTextInput(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.closest('.smm-text-edit')) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

function isWhiteboardTextInput(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.closest('.smm-text-edit')) return true;
  const root = el.closest('[data-wb-editor]');
  if (!root) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
}

export const WhiteboardEditor: React.FC<WhiteboardEditorProps> = ({
  elements,
  viewport,
  canUndo,
  canRedo,
  readOnly = false,
  embedded,
  onElementsChange: onElementsChangeProp,
  onViewportChange,
  onElementUpdate: onElementUpdateProp,
  onUndo,
  onRedo,
  commentsEnabled = false,
  commentThreads = [],
  selectedCommentId = null,
  onSelectComment,
  onCommentPinMove,
  onRequestAddComment,
}) => {
  const [toolState, setToolState] = useState<WhiteboardToolState>(DEFAULT_TOOL_STATE);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [panMode, setPanMode] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [mindmapEditElementId, setMindmapEditElementId] = useState<string | null>(null);
  const [mindmapActiveNodeId, setMindmapActiveNodeId] = useState<string | null>(null);
  const [mindmapTextEditNodeId, setMindmapTextEditNodeId] = useState<string | null>(null);
  const [mindmapTextDraft, setMindmapTextDraft] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const clipboardRef = useRef<WhiteboardElement[]>([]);
  const styleClipboardRef = useRef<CopiedShapeStyle | null>(null);
  const pasteGenRef = useRef(0);
  const pasteAnchorRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const pasteLockRef = useRef(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [shapeLibraryOpen, setShapeLibraryOpen] = useState(false);
  const toolStateRef = useRef(toolState);
  toolStateRef.current = toolState;

  const activeMindmap = useMemo(() => {
    if (!mindmapEditElementId) return null;
    const el = elements.find(e => e.id === mindmapEditElementId);
    return el?.type === 'mindmap' ? (el as MindmapElement) : null;
  }, [elements, mindmapEditElementId]);

  const commitElements = useCallback((next: WhiteboardElement[], recordHistory?: boolean) => {
    onElementsChangeProp(ensureElementsAboveSections(next), recordHistory);
  }, [onElementsChangeProp]);

  const commitElementUpdate = useCallback((
    id: string,
    patch: Partial<WhiteboardElement>,
    recordHistory?: boolean,
  ) => {
    const el = elements.find(item => item.id === id);
    let finalPatch = patch;
    if (
      el?.type === 'shape'
      && 'shapeKind' in patch
      && patch.shapeKind
      && patch.shapeKind !== el.shapeKind
    ) {
      finalPatch = {
        ...retargetShapeKind(el as ShapeElement, patch.shapeKind as ShapeKind),
        ...patch,
      };
    }

    const merged = elements.map(item => (
      item.id === id ? { ...item, ...finalPatch } as WhiteboardElement : item
    ));
    const normalized = ensureElementsAboveSections(merged);
    const zOrderAdjusted = normalized.some((el, i) => el.zIndex !== merged[i].zIndex);
    if (zOrderAdjusted) {
      onElementsChangeProp(normalized, recordHistory);
      return;
    }
    onElementUpdateProp(id, finalPatch, recordHistory);
  }, [elements, onElementUpdateProp, onElementsChangeProp]);

  const updateMindmapElement = useCallback((
    elementId: string,
    patch: Partial<MindmapElement>,
    recordHistory = true,
  ) => {
    commitElementUpdate(elementId, patch as Partial<WhiteboardElement>, recordHistory);
  }, [commitElementUpdate]);

  const deleteMindmapElement = useCallback((elementId: string) => {
    const removeIds = new Set([elementId]);
    const next = elements.filter(el => {
      if (removeIds.has(el.id)) return false;
      if (el.type === 'connector') {
        const conn = el as ConnectorElement;
        if (conn.startBind && removeIds.has(conn.startBind.elementId)) return false;
        if (conn.endBind && removeIds.has(conn.endBind.elementId)) return false;
      }
      return true;
    });
    commitElements(next, true);
    setMindmapEditElementId(null);
    setMindmapActiveNodeId(null);
    setMindmapTextEditNodeId(null);
    setMindmapTextDraft(null);
  }, [elements, commitElements]);

  const buildMindmapEditProps = useCallback((el: MindmapElement): WhiteboardMindmapEditProps => {
    const getEl = () => elements.find(e => e.id === el.id && e.type === 'mindmap') as MindmapElement | undefined;

    const syncBounds = (root: MindNode, layout: MindmapLayout, branchStyle: MindNoteBranchStyle) =>
      computeMindmapElementSize(root, layout, branchStyle);

    return {
    activeNodeId: mindmapEditElementId === el.id ? mindmapActiveNodeId : null,
    onSelectNode: id => {
      setMindmapActiveNodeId(id);
      if (id) {
        setMindmapEditElementId(el.id);
        setSelectedIds([]);
      }
    },
    onRootChange: (root, recordHistory) => {
      const current = getEl();
      const layout = current?.layout ?? el.layout;
      const branchStyle = current?.branchStyle ?? el.branchStyle ?? WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT;
      updateMindmapElement(el.id, { root, ...syncBounds(root, layout, branchStyle) }, recordHistory ?? true);
    },
    onSettingsChange: patch => {
      const current = getEl();
      const oldLayout = current?.layout ?? el.layout;
      const layout = patch.layout ?? oldLayout;
      const branchStyle = patch.branchStyle ?? current?.branchStyle ?? el.branchStyle ?? WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT;
      let root = current?.root ?? el.root;
      if (patch.layout && patch.layout !== oldLayout) {
        root = remapMindmapRootForLayout(root, oldLayout, patch.layout);
      }
      const bounds = computeMindmapElementSize(root, layout, branchStyle);
      updateMindmapElement(el.id, { ...patch, root, ...bounds }, true);
    },
    onNodeUpdate: (nodeId, patch) => {
      const current = getEl();
      if (!current) return;
      const root = updateMindNode(current.root, nodeId, patch);
      updateMindmapElement(el.id, {
        root,
        ...syncBounds(root, current.layout, current.branchStyle ?? WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT),
      }, true);
    },
    onAction: (action: WbMindmapAction, targetNodeId?: string) => {
      const current = getEl();
      if (!current) return;
      const nodeId = targetNodeId ?? mindmapActiveNodeId;
      if (!nodeId) return;
      let root = current.root;
      let nextActive: string | null = nodeId;

      switch (action) {
        case 'sibling':
        case 'siblingAfter': {
          const res = insertMindSibling(root, nodeId, true);
          root = res.root;
          nextActive = res.newId;
          break;
        }
        case 'siblingBefore': {
          const res = insertMindSibling(root, nodeId, false);
          root = res.root;
          nextActive = res.newId;
          break;
        }
        case 'child':
        case 'childLeft':
        case 'childRight':
        case 'childUp':
        case 'childDown': {
          const branchDir = action === 'child' ? undefined
            : action === 'childLeft' ? 'left'
              : action === 'childRight' ? 'right'
                : action === 'childUp' ? 'up'
                  : 'down';
          const res = insertMindChild(root, nodeId, branchDir);
          root = res.root;
          nextActive = res.newId;
          break;
        }
        case 'parent': {
          const res = insertMindParent(root, nodeId);
          root = res.root;
          nextActive = res.newId;
          break;
        }
        case 'duplicate': {
          const res = duplicateMindNode(root, nodeId);
          root = res.root;
          nextActive = res.newId;
          break;
        }
        case 'delete':
          if (nodeId === current.root.id) {
            deleteMindmapElement(el.id);
            return;
          }
          root = deleteMindNode(root, nodeId);
          nextActive = current.root.id;
          break;
        case 'collapse':
          root = toggleMindCollapse(root, nodeId);
          break;
        default:
          return;
      }
      updateMindmapElement(el.id, {
        root,
        ...syncBounds(root, current.layout, current.branchStyle ?? WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT),
      }, true);
      if (nextActive) setMindmapActiveNodeId(nextActive);
      if (
        (action === 'sibling' || action === 'siblingBefore' || action === 'siblingAfter'
          || action === 'child' || action === 'childLeft' || action === 'childRight'
          || action === 'childUp' || action === 'childDown' || action === 'parent')
        && nextActive
      ) {
        setMindmapTextEditNodeId(nextActive);
        setMindmapTextDraft('');
      }
    },
    onBoundsChange: bounds => {
      const current = getEl();
      if (!current) return;
      if (current.width === bounds.width && current.height === bounds.height) return;
      updateMindmapElement(el.id, {
        width: bounds.width,
        height: bounds.height,
      }, false);
    },
  };
  }, [
    elements,
    mindmapActiveNodeId,
    mindmapEditElementId,
    updateMindmapElement,
    deleteMindmapElement,
  ]);

  const handleMindmapFocus = useCallback((id: string) => {
    setMindmapEditElementId(id);
    setSelectedIds([]);
    setMindmapTextEditNodeId(null);
    setMindmapTextDraft(null);
    if (mindmapEditElementId !== id) {
      const el = elements.find(e => e.id === id && e.type === 'mindmap') as MindmapElement | undefined;
      if (el) setMindmapActiveNodeId(el.root.id);
    }
  }, [elements, mindmapEditElementId]);

  useEffect(() => {
    if (readOnly || selectedIds.length !== 1) return;
    const el = elements.find(e => e.id === selectedIds[0]);
    if (el?.type !== 'mindmap') return;
    if (mindmapEditElementId === el.id) return;
    setMindmapEditElementId(el.id);
    setMindmapActiveNodeId(prev => prev ?? (el as MindmapElement).root.id);
  }, [readOnly, selectedIds, elements, mindmapEditElementId]);

  const patchTool = useCallback((patch: Partial<WhiteboardToolState>) => {
    setToolState(prev => ({ ...prev, ...patch }));
    if (patch.tool && patch.tool !== 'pan') setPanMode(false);
  }, []);

  /** 选中图形：同步 ref，便于画布 pointer 事件立即读到 shapeKind */
  const handleToolChange = useCallback((patch: Partial<WhiteboardToolState>) => {
    if (patch.shapeKind != null) {
      const next: WhiteboardToolState = {
        ...toolStateRef.current,
        ...patch,
        tool: 'shape',
        shapeKind: patch.shapeKind,
        shapeCategoryId: patch.shapeCategoryId ?? toolStateRef.current.shapeCategoryId,
      };
      toolStateRef.current = next;
      setToolState(next);
      setPanMode(false);
      return;
    }
    patchTool(patch);
  }, [patchTool]);

  const openShapeLibrary = useCallback(() => {
    setShapeLibraryOpen(true);
    patchTool({ tool: 'shape' });
  }, [patchTool]);

  const nudgeSelection = useCallback((dx: number, dy: number) => {
    if (!selectedIds.length) return;
    const idSet = new Set(
      selectedIds.filter(id => !elements.find(e => e.id === id)?.locked),
    );
    if (!idSet.size) return;
    commitElements(
      elements.map(el => (idSet.has(el.id) ? translateElement(el, dx, dy) : el)),
      true,
    );
  }, [elements, commitElements, selectedIds]);

  const deleteSelection = useCallback(() => {
    if (!selectedIds.length || readOnly) return;
    const expandedIds = expandIdsWithSectionContents(selectedIds, elements);
    const removeIds = new Set(
      expandedIds.filter(id => !elements.find(e => e.id === id)?.locked),
    );
    if (!removeIds.size) return;
    const next = elements.filter(el => {
      if (removeIds.has(el.id)) return false;
      if (el.type === 'connector') {
        const conn = el as ConnectorElement;
        if (conn.startBind && removeIds.has(conn.startBind.elementId)) return false;
        if (conn.endBind && removeIds.has(conn.endBind.elementId)) return false;
      }
      return true;
    });
    commitElements(next, true);
    setSelectedIds(prev => prev.filter(id => !removeIds.has(id)));
  }, [elements, commitElements, readOnly, selectedIds]);

  const duplicateSelection = useCallback((offsetX = 16, offsetY = 16) => {
    if (!selectedIds.length || readOnly) return;
    const idSet = new Set(expandIdsWithSectionContents(selectedIds, elements));
    let z = nextZIndex(elements);
    const clones: WhiteboardElement[] = [];
    const newIds: string[] = [];
    for (const el of elements) {
      if (!idSet.has(el.id)) continue;
      const clone = cloneWhiteboardElement(el);
      clone.id = genWhiteboardId();
      clone.zIndex = z++;
      clone.x += offsetX;
      clone.y += offsetY;
      if (clone.type === 'connector' || clone.type === 'pen') {
        clone.points = clone.points.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }));
      }
      clones.push(clone);
      newIds.push(clone.id);
    }
    commitElements([...elements, ...clones], true);
    setSelectedIds(newIds);
  }, [elements, commitElements, readOnly, selectedIds]);

  const copySelection = useCallback(async () => {
    if (!selectedIds.length) return;
    const idSet = new Set(selectedIds);
    clipboardRef.current = elements
      .filter(el => idSet.has(el.id))
      .map(el => cloneWhiteboardElement(el));
    try {
      await writeWhiteboardClipboard(elements, selectedIds);
    } catch {
      // 系统剪贴板不可用时，仍可用内存剪贴板在同页粘贴
    }
  }, [elements, selectedIds]);

  const resolvePasteCanvasPoint = useCallback((): WhiteboardPoint => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 120, y: 120 };
    const anchor = pasteAnchorRef.current;
    const clientX = anchor?.clientX ?? rect.left + rect.width / 2;
    const clientY = anchor?.clientY ?? rect.top + rect.height / 2;
    return screenToCanvasPoint(clientX, clientY, rect, viewport);
  }, [viewport]);

  const insertPastedImage = useCallback(async (blob: Blob, anchor?: WhiteboardPoint) => {
    if (readOnly) return;
    try {
      const { src, width, height } = await loadImageFromBlob(blob);
      const point = anchor ?? resolvePasteCanvasPoint();
      const el = createWhiteboardImageElement(point, nextZIndex(elements), src, width, height);
      commitElements([...elements, el], true);
      setSelectedIds([el.id]);
      patchTool({ tool: 'select' });
    } catch {
      // ignore
    } finally {
      pasteAnchorRef.current = null;
    }
  }, [elements, commitElements, patchTool, readOnly, resolvePasteCanvasPoint]);

  const prepareWhiteboardImageFile = useCallback(async (file: File): Promise<InsertImagePayload> => {
    const err = validateImageFile(file);
    if (err) throw new Error(err);
    const { src, width, height } = await loadImageFromBlob(file);
    return {
      url: src,
      naturalWidth: width,
      naturalHeight: height,
      fileName: file.name,
    };
  }, []);

  const handleInsertImageFromDialog = useCallback((payload: InsertImagePayload) => {
    if (readOnly) return;
    const point = resolvePasteCanvasPoint();
    const el = createWhiteboardImageElement(
      point,
      nextZIndex(elements),
      payload.url,
      payload.naturalWidth,
      payload.naturalHeight,
    );
    commitElements([...elements, el], true);
    setSelectedIds([el.id]);
    patchTool({ tool: 'select' });
  }, [commitElements, elements, patchTool, readOnly, resolvePasteCanvasPoint]);

  const pasteElements = useCallback((source: WhiteboardElement[]) => {
    if (!source.length || readOnly) return;
    pasteGenRef.current += 1;
    const n = pasteGenRef.current;
    const offset = 24 * n;
    let z = nextZIndex(elements);
    const clones: WhiteboardElement[] = [];
    const newIds: string[] = [];
    for (const el of source) {
      const clone = cloneWhiteboardElement(el);
      clone.id = genWhiteboardId();
      clone.zIndex = z++;
      clone.locked = false;
      clone.x += offset;
      clone.y += offset;
      if (clone.type === 'connector' || clone.type === 'pen') {
        clone.points = clone.points.map(p => ({ x: p.x + offset, y: p.y + offset }));
      }
      clones.push(clone);
      newIds.push(clone.id);
    }
    commitElements([...elements, ...clones], true);
    setSelectedIds(newIds);
    pasteAnchorRef.current = null;
  }, [elements, commitElements, readOnly]);

  const pasteClipboard = useCallback(() => {
    if (!clipboardRef.current.length) return;
    pasteElements(clipboardRef.current);
  }, [pasteElements]);

  const handlePaste = useCallback(async (clipboardData?: DataTransfer | null) => {
    if (readOnly || pasteLockRef.current) return;
    pasteLockRef.current = true;
    try {
      const fromTransfer = clipboardData
        ? readWhiteboardClipboardFromDataTransfer(clipboardData)
        : null;
      if (fromTransfer?.length) {
        pasteElements(fromTransfer);
        return;
      }

      const fromSystem = await readWhiteboardClipboardFromSystem();
      if (fromSystem?.length) {
        pasteElements(fromSystem);
        return;
      }

      if (clipboardRef.current.length) {
        pasteClipboard();
        return;
      }

      const file = clipboardData ? extractImageFileFromClipboard(clipboardData) : null;
      if (file) {
        await insertPastedImage(file);
        return;
      }

      const blob = await readImageBlobFromSystemClipboard();
      if (blob) await insertPastedImage(blob);
    } finally {
      window.setTimeout(() => { pasteLockRef.current = false; }, 0);
    }
  }, [insertPastedImage, pasteClipboard, pasteElements, readOnly]);

  const copySelectionAsImage = useCallback(async () => {
    if (!selectedIds.length) return;
    try {
      await copyElementsAsImage(elements, selectedIds);
    } catch {
      // ignore clipboard errors
    }
  }, [elements, selectedIds]);

  const copyShapeStyle = useCallback(() => {
    if (selectedIds.length !== 1) return;
    const el = elements.find(e => e.id === selectedIds[0]);
    if (!el || !canCopyStyle(el)) return;
    styleClipboardRef.current = extractShapeStyle(el);
  }, [elements, selectedIds]);

  const pasteShapeStyle = useCallback(() => {
    const style = styleClipboardRef.current;
    if (!style || readOnly) return;
    commitElements(
      elements.map(el => {
        if (!selectedIds.includes(el.id) || el.type !== 'shape') return el;
        return applyShapeStyle(el, style);
      }),
      true,
    );
  }, [elements, commitElements, readOnly, selectedIds]);

  const handleLayerAction = useCallback((action: ZOrderAction) => {
    if (!selectedIds.length || readOnly) return;
    commitElements(reorderZIndex(elements, selectedIds, action), true);
  }, [elements, commitElements, readOnly, selectedIds]);

  const handleFlip = useCallback((axis: 'x' | 'y') => {
    if (!selectedIds.length || readOnly) return;
    commitElements(flipElements(elements, selectedIds, axis), true);
  }, [elements, commitElements, readOnly, selectedIds]);

  const handleRotate = useCallback(() => {
    if (!selectedIds.length || readOnly) return;
    commitElements(rotateElements(elements, selectedIds), true);
  }, [elements, commitElements, readOnly, selectedIds]);

  const toggleLockSelection = useCallback(() => {
    if (!selectedIds.length || readOnly) return;
    commitElements(toggleLockElements(elements, selectedIds), true);
  }, [elements, commitElements, readOnly, selectedIds]);

  const handleContextAction = useCallback((action: WhiteboardContextMenuAction) => {
    switch (action) {
      case 'copy': copySelection(); break;
      case 'copyImage': void copySelectionAsImage(); break;
      case 'paste': void handlePaste(); break;
      case 'duplicate': duplicateSelection(); break;
      case 'copyStyle': copyShapeStyle(); break;
      case 'pasteStyle': pasteShapeStyle(); break;
      case 'flipH': handleFlip('x'); break;
      case 'flipV': handleFlip('y'); break;
      case 'rotate': handleRotate(); break;
      case 'lock': toggleLockSelection(); break;
      case 'delete': deleteSelection(); break;
      default: break;
    }
    setContextMenu(null);
  }, [
    copySelection,
    copySelectionAsImage,
    handlePaste,
    duplicateSelection,
    copyShapeStyle,
    pasteShapeStyle,
    handleFlip,
    handleRotate,
    toggleLockSelection,
    deleteSelection,
  ]);

  const handleCanvasContextMenu = useCallback((payload: {
    clientX: number;
    clientY: number;
    targetId: string | null;
  }) => {
    if (readOnly) return;
    pasteAnchorRef.current = { clientX: payload.clientX, clientY: payload.clientY };
    setContextMenu({ x: payload.clientX, y: payload.clientY });
  }, [readOnly]);

  const selectedElements = useMemo(
    () => elements.filter(e => selectedIds.includes(e.id)),
    [elements, selectedIds],
  );

  const contextMenuFlags = useMemo(() => {
    const transformable = selectedElements.some(canTransformElement);
    const hasShape = selectedElements.some(e => e.type === 'shape');
    const allLocked = selectedElements.length > 0 && selectedElements.every(e => e.locked);
    return {
      showTransform: transformable,
      showStyle: hasShape,
      canPasteStyle: !!styleClipboardRef.current && selectedElements.some(e => e.type === 'shape'),
      isLocked: allLocked,
    };
  }, [selectedElements, contextMenu]);

  const handleFitView = useCallback(() => {
    const next = computeFitViewport(elements, canvasRef.current);
    onViewportChange(next, false);
  }, [elements, onViewportChange]);

  const handleZoomStep = useCallback((delta: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) {
      onViewportChange({ zoom: clampZoom(viewport.zoom + delta) }, false);
      return;
    }
    onViewportChange(
      zoomViewportCenter(viewport, rect.width, rect.height, viewport.zoom + delta),
      false,
    );
  }, [onViewportChange, viewport]);

  const handleZoomTo = useCallback((target: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) {
      onViewportChange({ zoom: clampZoom(target) }, false);
      return;
    }
    onViewportChange(
      zoomViewportCenter(viewport, rect.width, rect.height, target),
      false,
    );
  }, [onViewportChange, viewport]);

  const handleResetView = useCallback(() => {
    onViewportChange({ x: 80, y: 80, zoom: 1 }, false);
  }, [onViewportChange]);

  useEffect(() => {
    editorRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const el = editorRef.current;
    if (!el || readOnly) return;

    const onPaste = (e: ClipboardEvent) => {
      if (isTextInput(e.target)) return;
      if (mindmapEditElementId) return;

      const hasWhiteboardData = e.clipboardData
        && readWhiteboardClipboardFromDataTransfer(e.clipboardData);
      const hasImage = e.clipboardData && extractImageFileFromClipboard(e.clipboardData);
      const hasMemory = clipboardRef.current.length > 0;

      if (!hasWhiteboardData && !hasImage && !hasMemory) return;

      e.preventDefault();
      void handlePaste(e.clipboardData);
    };

    el.addEventListener('paste', onPaste);
    return () => el.removeEventListener('paste', onPaste);
  }, [handlePaste, mindmapEditElementId, readOnly]);

  useEffect(() => {
    if (!selectedIds.length) return;
    const timer = window.setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest('textarea, input, [contenteditable="true"]')) return;
      editorRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedIds.join('\0')]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (readOnly) return;
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (e.isComposing) return;
      if (isWhiteboardTextInput(e.target)) return;

      if (
        mindmapEditElementId
        && mindmapActiveNodeId
        && activeMindmap
        && !mindmapTextEditNodeId
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (mindmapActiveNodeId === activeMindmap.root.id) {
          deleteMindmapElement(activeMindmap.id);
        } else {
          const root = deleteMindNode(activeMindmap.root, mindmapActiveNodeId);
          updateMindmapElement(activeMindmap.id, {
            root,
            ...computeMindmapElementSize(root, activeMindmap.layout, activeMindmap.branchStyle ?? WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT),
          }, true);
          setMindmapActiveNodeId(activeMindmap.root.id);
        }
        return;
      }

      if (selectedIds.length) {
        e.preventDefault();
        e.stopPropagation();
        deleteSelection();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [
    readOnly,
    mindmapEditElementId,
    mindmapActiveNodeId,
    mindmapTextEditNodeId,
    activeMindmap,
    updateMindmapElement,
    deleteMindmapElement,
    selectedIds,
    deleteSelection,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (readOnly) return;
      if (!mindmapEditElementId || !mindmapActiveNodeId || !activeMindmap) return;
      if (mindmapTextEditNodeId) return;
      if (e.isComposing || e.keyCode === 229) return;
      if (isWhiteboardTextInput(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      let action: WbMindmapAction | null = null;
      if (e.key === 'Enter') action = 'sibling';
      else if (e.key === 'Tab' && !e.shiftKey) action = 'child';
      else if (e.key === 'Tab' && e.shiftKey) action = 'parent';
      if (!action) return;

      e.preventDefault();
      e.stopPropagation();
      buildMindmapEditProps(activeMindmap).onAction(action);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [
    readOnly,
    mindmapEditElementId,
    mindmapActiveNodeId,
    mindmapTextEditNodeId,
    activeMindmap,
    buildMindmapEditProps,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (readOnly) return;
      if (isTextInput(e.target)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setSpaceHeld(true);
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        return;
      }

      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'z') {
          e.preventDefault();
          if (e.shiftKey) onRedo();
          else onUndo();
        } else if (e.key === 'c') {
          e.preventDefault();
          if (e.shiftKey) void copySelectionAsImage();
          else if (e.altKey) copyShapeStyle();
          else void copySelection();
        } else if (e.key === 'v') {
          if (e.altKey) {
            e.preventDefault();
            pasteShapeStyle();
          } else {
            e.preventDefault();
            void handlePaste();
          }
        } else if (e.key === 'd') {
          e.preventDefault();
          duplicateSelection();
        } else if (e.key === 'l' && e.altKey) {
          e.preventDefault();
          toggleLockSelection();
        } else if (e.key === 'a') {
          e.preventDefault();
          setSelectedIds(elements.map(el => el.id));
        } else if (e.key === '0') {
          e.preventDefault();
          handleResetView();
        } else if (e.key === '1') {
          e.preventDefault();
          handleFitView();
        }
        return;
      }

      if (e.key === 'Escape') {
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
        if (shapeLibraryOpen) {
          setShapeLibraryOpen(false);
          return;
        }
        if (mindmapEditElementId) {
          setMindmapEditElementId(null);
          setMindmapActiveNodeId(null);
          return;
        }
        setSelectedIds([]);
        setPanMode(false);
        if (toolState.tool === 'pan') patchTool({ tool: 'select' });
        return;
      }

      if (mindmapEditElementId) return;

      if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key.toLowerCase() === 'h') {
          e.preventDefault();
          handleFlip('x');
          return;
        }
        if (e.key.toLowerCase() === 'v') {
          e.preventDefault();
          handleFlip('y');
          return;
        }
      }

      if (e.key === 'ArrowUp') { e.preventDefault(); nudgeSelection(0, e.shiftKey ? -10 : -1); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); nudgeSelection(0, e.shiftKey ? 10 : 1); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); nudgeSelection(e.shiftKey ? -10 : -1, 0); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); nudgeSelection(e.shiftKey ? 10 : 1, 0); return; }

      const shortcuts: Record<string, Partial<WhiteboardToolState>> = {
        v: { tool: 'select' },
        t: { tool: 'text' },
        p: { tool: 'pen' },
        n: { tool: 'sticky' },
        h: { tool: 'pan' },
      };
      const lower = e.key.toLowerCase();
      if (shortcuts[lower]) {
        patchTool(shortcuts[lower]);
        if (lower === 'h') setPanMode(true);
        return;
      }
      if (e.shiftKey && lower === 's') patchTool({ tool: 'section' });
      if (!e.metaKey && !e.ctrlKey && !e.altKey && lower === 'm') {
        e.preventDefault();
        setShapeLibraryOpen(open => {
          const next = !open;
          if (next) patchTool({ tool: 'shape' });
          return next;
        });
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    readOnly, selectedIds, elements, commitElements, onUndo, onRedo, patchTool,
    nudgeSelection, handleFitView, handleResetView, copySelection, handlePaste,
    duplicateSelection, toolState.tool, mindmapEditElementId, contextMenu, shapeLibraryOpen,
    copySelectionAsImage, copyShapeStyle, pasteShapeStyle, toggleLockSelection, handleFlip,
  ]);

  return (
    <div
      ref={editorRef}
      data-wb-editor=""
      tabIndex={-1}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative', background: WB_COLORS.pageBg, outline: 'none' }}
      onMouseDown={() => editorRef.current?.focus({ preventScroll: true })}
    >
      <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
        {!readOnly && shapeLibraryOpen && (
          <ShapeLibraryPanel
            open={shapeLibraryOpen}
            selectedKind={toolState.shapeKind}
            selectedTool={toolState.tool}
            onClose={() => setShapeLibraryOpen(false)}
            onSelectKind={(kind, categoryId) => {
              handleToolChange({ tool: 'shape', shapeKind: kind, shapeCategoryId: categoryId });
            }}
            onSelectTable={() => {
              handleToolChange({ tool: 'table', shapeKind: null, shapeCategoryId: null });
            }}
          />
        )}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
          {!readOnly && (
            <WhiteboardToolbar
              embedded={embedded}
              readOnly={readOnly}
              state={toolState}
              onChange={handleToolChange}
              onImagePick={() => setImagePickerOpen(true)}
              onOpenShapeLibrary={openShapeLibrary}
            />
          )}

      <DocImageInsertDialog
        open={imagePickerOpen}
        title="插入图片"
        onClose={() => setImagePickerOpen(false)}
        onInsert={handleInsertImageFromDialog}
        prepareFile={prepareWhiteboardImageFile}
      />

      <WhiteboardCanvas
        ref={canvasRef}
        elements={elements}
        viewport={viewport}
        selectedIds={selectedIds}
        toolState={toolState}
        toolStateRef={toolStateRef}
        panMode={panMode}
        spaceHeld={spaceHeld}
        readOnly={readOnly}
        onViewportChange={vp => onViewportChange(vp, false)}
        onElementsChange={commitElements}
        onSelectionChange={setSelectedIds}
        onElementUpdate={commitElementUpdate}
        onToolChange={patchTool}
        mindmapEditElementId={mindmapEditElementId}
        mindmapActiveNodeId={mindmapActiveNodeId}
        mindmapTextEditNodeId={mindmapTextEditNodeId}
        mindmapTextDraft={mindmapTextDraft}
        onMindmapTextDraftChange={setMindmapTextDraft}
        onMindmapEditElementChange={id => {
          setMindmapEditElementId(id);
          if (!id) {
            setMindmapTextEditNodeId(null);
            setMindmapTextDraft(null);
          }
        }}
        onMindmapActiveNodeChange={setMindmapActiveNodeId}
        onMindmapTextEditNodeChange={setMindmapTextEditNodeId}
        onMindmapFocus={handleMindmapFocus}
        buildMindmapEditProps={readOnly ? undefined : buildMindmapEditProps}
        suppressFloatingToolbar={!!contextMenu}
        onToggleLock={readOnly ? undefined : toggleLockSelection}
        onToolbarMenuAction={readOnly ? undefined : handleContextAction}
        onLayerAction={readOnly ? undefined : handleLayerAction}
        canPasteToolbar={!readOnly}
        onContextMenu={handleCanvasContextMenu}
        commentsEnabled={commentsEnabled}
        commentThreads={commentThreads}
        selectedCommentId={selectedCommentId}
        onSelectComment={onSelectComment}
        onCommentPinMove={onCommentPinMove}
        onRequestAddComment={onRequestAddComment}
      />

      {contextMenu && !readOnly && (
        <WhiteboardContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          showTransform={contextMenuFlags.showTransform}
          showStyle={contextMenuFlags.showStyle}
          canPaste
          canPasteStyle={contextMenuFlags.canPasteStyle}
          isLocked={contextMenuFlags.isLocked}
          onLayerAction={handleLayerAction}
          onAction={handleContextAction}
          onClose={() => setContextMenu(null)}
        />
      )}

        </div>
      </div>

      <WhiteboardControls
        embedded={embedded}
        zoom={viewport.zoom}
        canUndo={canUndo}
        canRedo={canRedo}
        panMode={panMode || spaceHeld}
        readOnly={readOnly}
        onZoomIn={() => handleZoomStep(0.12)}
        onZoomOut={() => handleZoomStep(-0.12)}
        onZoomTo={handleZoomTo}
        onFitView={handleFitView}
        onResetView={handleResetView}
        onUndo={onUndo}
        onRedo={onRedo}
        onTogglePan={() => {
          setPanMode(v => !v);
          if (!panMode) patchTool({ tool: 'pan' });
          else patchTool({ tool: 'select' });
        }}
      />
    </div>
  );
};

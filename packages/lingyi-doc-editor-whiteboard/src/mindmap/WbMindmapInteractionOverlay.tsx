import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MindmapElement, WhiteboardViewport } from '@lingyi-doc/core-whiteboard';
import type { MindNode } from '@lingyi-doc/core-types';
import { findMindNode, updateMindNode } from '@lingyi-doc/core-mindmap';
import type { MindmapNodeAction } from '@lingyi-doc/mind-map';
import {
  DEFAULT_MINDMAP_CONTEXT_MENU_PLUGINS,
  MindmapContextMenu,
  MindmapNodeImageSelection,
  buildContextMenuRuntimeFlags,
  createMindmapContextMenuRegistry,
  executeBuiltinContextMenuAction,
  type MindmapContextTarget,
  type MindmapImageResizeHandle,
} from '@lingyi-doc/mind-map-react';
import { resolveTheme } from '@lingyi-doc/mind-map';
import { getMindmapNodeImageScreenBounds } from '../canvas/mindmapHitTest';
import type { WbMindmapEditProps } from './WbMindmapView';
import type { WbMindmapAction } from './types';

export interface WbMindmapContextMenuRequest {
  nodeId: string;
  target: MindmapContextTarget;
  clientX: number;
  clientY: number;
}

interface WbMindmapInteractionOverlayProps {
  element: MindmapElement;
  viewport: WhiteboardViewport;
  edit: WbMindmapEditProps;
  selectedImageNodeId: string | null;
  onSelectImageNode: (nodeId: string | null) => void;
  /** 外部打开右键菜单（图层 contextmenu 触发） */
  contextMenuRequest: WbMindmapContextMenuRequest | null;
  onContextMenuRequestHandled: () => void;
  readOnly?: boolean;
}

/**
 * 画板导图编辑态适配层：复用 mind-map-react 的右键插件与图片选中，
 * 不替换主 canvas 绘制与现有快捷操作/内联编辑。
 */
export const WbMindmapInteractionOverlay: React.FC<WbMindmapInteractionOverlayProps> = ({
  element,
  viewport,
  edit,
  selectedImageNodeId,
  onSelectImageNode,
  contextMenuRequest,
  onContextMenuRequestHandled,
  readOnly = false,
}) => {
  const [menu, setMenu] = useState<{
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
  const imageResizeDraftRef = useRef(imageResizeDraft);
  imageResizeDraftRef.current = imageResizeDraft;
  const selectedImageNodeIdRef = useRef(selectedImageNodeId);
  selectedImageNodeIdRef.current = selectedImageNodeId;
  const elementRef = useRef(element);
  elementRef.current = element;
  const editRef = useRef(edit);
  editRef.current = edit;

  const registry = useMemo(
    () => createMindmapContextMenuRegistry(DEFAULT_MINDMAP_CONTEXT_MENU_PLUGINS),
    [],
  );

  const displayRoot = useMemo(() => {
    if (!imageResizeDraft) return element.root;
    return updateMindNode(element.root, imageResizeDraft.nodeId, {
      imageWidth: imageResizeDraft.width,
      imageHeight: imageResizeDraft.height,
    });
  }, [element.root, imageResizeDraft]);

  useEffect(() => {
    if (!selectedImageNodeId) return;
    const found = findMindNode(element.root, selectedImageNodeId);
    if (!found?.node.image) onSelectImageNode(null);
  }, [element.root, selectedImageNodeId, onSelectImageNode]);

  useEffect(() => {
    if (!contextMenuRequest) return;
    setMenuFlags(buildContextMenuRuntimeFlags());
    setMenu({
      x: contextMenuRequest.clientX,
      y: contextMenuRequest.clientY,
      target: contextMenuRequest.target,
      nodeId: contextMenuRequest.nodeId,
    });
    if (contextMenuRequest.target === 'nodeImage') {
      onSelectImageNode(contextMenuRequest.nodeId);
    } else {
      onSelectImageNode(null);
    }
    edit.onSelectNode(contextMenuRequest.nodeId);
    onContextMenuRequestHandled();
  }, [contextMenuRequest, edit, onContextMenuRequestHandled, onSelectImageNode]);

  const buildMenuContext = useCallback((target: MindmapContextTarget, nodeId: string) => {
    const found = findMindNode(elementRef.current.root, nodeId);
    const flags = buildContextMenuRuntimeFlags();
    return {
      target,
      nodeId,
      node: found?.node ?? null,
      root: elementRef.current.root,
      readOnly,
      canPaste: true,
      canPasteStyle: flags.canPasteStyle,
    };
  }, [readOnly]);

  const runAction = useCallback(async (actionId: string, target: MindmapContextTarget, nodeId: string) => {
    const ctx = buildMenuContext(target, nodeId);
    const handled = await registry.execute(actionId, ctx);
    if (!handled) {
      await executeBuiltinContextMenuAction(actionId, ctx, {
        dispatchNodeAction: (action: MindmapNodeAction, id) => {
          editRef.current.onAction(action as WbMindmapAction, id);
        },
        onRootChange: (root, record) => {
          editRef.current.onRootChange(root, record);
        },
        onSelectNode: id => {
          editRef.current.onSelectNode(id);
        },
        clearNodeImage: id => {
          editRef.current.onNodeUpdate(id, {
            image: undefined,
            imageWidth: undefined,
            imageHeight: undefined,
            imageFlipH: undefined,
            imageFlipV: undefined,
          } as Partial<MindNode>);
          onSelectImageNode(null);
        },
        setSelectedImageNodeId: onSelectImageNode,
      });
    }
    setMenuFlags(buildContextMenuRuntimeFlags());
    setMenu(null);
  }, [buildMenuContext, onSelectImageNode, registry]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (readOnly) return;
      if (e.isComposing || e.keyCode === 229) return;
      const targetEl = e.target as HTMLElement | null;
      if (targetEl?.closest('input, textarea, [contenteditable]')) return;

      const imageNodeId = selectedImageNodeIdRef.current;
      const mod = e.metaKey || e.ctrlKey;
      const alt = e.altKey;

      if (imageNodeId) {
        const run = (actionId: string) => {
          e.preventDefault();
          void runAction(actionId, 'nodeImage', imageNodeId);
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
          onSelectImageNode(null);
          setMenu(null);
          return;
        }
      }

      const nodeId = editRef.current.activeNodeId;
      if (!nodeId || imageNodeId) return;

      if (mod && alt && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        void runAction('copyStyle', 'node', nodeId);
        return;
      }
      if (mod && alt && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        void runAction('pasteStyle', 'node', nodeId);
        return;
      }
      if (mod && alt && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        void runAction('lock', 'node', nodeId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onSelectImageNode, readOnly, runAction]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const resize = imageResizeRef.current;
      if (!resize) return;
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
    };
    const onUp = () => {
      const resize = imageResizeRef.current;
      if (!resize) return;
      imageResizeRef.current = null;
      const draft = imageResizeDraftRef.current;
      if (draft && draft.nodeId === resize.nodeId) {
        editRef.current.onNodeUpdate(draft.nodeId, {
          imageWidth: draft.width,
          imageHeight: draft.height,
        });
      }
      setImageResizeDraft(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  const imageElement: MindmapElement = imageResizeDraft
    ? { ...element, root: displayRoot }
    : element;

  const imageScreen = selectedImageNodeId
    ? getMindmapNodeImageScreenBounds(imageElement, selectedImageNodeId, viewport)
    : null;

  const handleImageResizeStart = (handle: MindmapImageResizeHandle, e: React.PointerEvent) => {
    if (!selectedImageNodeId || readOnly) return;
    const bounds = getMindmapNodeImageScreenBounds(element, selectedImageNodeId, viewport);
    if (!bounds) return;
    const layoutW = bounds.w / Math.max(viewport.zoom, 0.01);
    const layoutH = bounds.h / Math.max(viewport.zoom, 0.01);
    imageResizeRef.current = {
      nodeId: selectedImageNodeId,
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startW: layoutW,
      startH: layoutH,
      aspect: layoutW / Math.max(1, layoutH),
      zoom: viewport.zoom,
    };
    setImageResizeDraft({
      nodeId: selectedImageNodeId,
      width: Math.round(layoutW),
      height: Math.round(layoutH),
    });
  };

  const theme = resolveTheme('whiteboard');

  return (
    <>
      {imageScreen && selectedImageNodeId && (
        <MindmapNodeImageSelection
          rect={{
            left: imageScreen.x,
            top: imageScreen.y,
            width: imageScreen.w,
            height: imageScreen.h,
          }}
          accent={theme.accent}
          readOnly={readOnly}
          onResizeStart={handleImageResizeStart}
          onContextMenu={e => {
            e.preventDefault();
            e.stopPropagation();
            setMenuFlags(buildContextMenuRuntimeFlags());
            setMenu({
              x: e.clientX,
              y: e.clientY,
              target: 'nodeImage',
              nodeId: selectedImageNodeId,
            });
          }}
        />
      )}
      {menu && (() => {
        const ctx = buildMenuContext(menu.target, menu.nodeId);
        ctx.canPasteStyle = menuFlags.canPasteStyle;
        const entries = registry.resolve(ctx);
        if (!entries.length) return null;
        return (
          <MindmapContextMenu
            x={menu.x}
            y={menu.y}
            entries={entries}
            onClose={() => setMenu(null)}
            onAction={actionId => { void runAction(actionId, menu.target, menu.nodeId); }}
          />
        );
      })()}
    </>
  );
};

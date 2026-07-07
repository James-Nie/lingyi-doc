import React, { useEffect, useRef, useState } from 'react';
import MindMap from 'simple-mind-map';
import 'simple-mind-map/dist/simpleMindMap.esm.css';
import type { MindNode, MindNoteBranchStyle, MindNoteStructure } from '@lingyi-doc/core';
import {
  mapStructure,
  mergeMindNodeTree,
  mindNodeToSmmData,
  mindNodesEqual,
  MIND_NODE_MAX_WIDTH,
  smmDataToMindNode,
  type SmmNode,
} from '../smm/smmAdapter';
import { createMindMapThemeConfig } from './simpleMindMapTheme';
import { MN_COLORS } from './styles';

interface MindNoteMapViewProps {
  root: MindNode;
  structure: MindNoteStructure;
  branchStyle: MindNoteBranchStyle;
  zoom: number;
  activeNodeId: string | null;
  readOnly?: boolean;
  onSelectNode: (id: string | null) => void;
  onRootChange: (root: MindNode, recordHistory?: boolean) => void;
  onZoomChange: (zoom: number) => void;
  onReady?: (api: MindMapViewApi) => void;
  onRemoveImage?: (id: string) => void;
  /** 画布背景色，画板嵌入时使用 transparent */
  background?: string;
  containerOverflow?: 'hidden' | 'visible';
  fitOnInit?: boolean;
  enableMouseWheel?: boolean;
  /** 锁定为 100% 缩放，由外层画布统一缩放（画板嵌入） */
  lockZoom?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MindMapInstance = any;

export interface MindMapViewApi {
  goTargetNode: (id: string) => void;
  startTextEdit: (id: string) => void;
}

export const MindNoteMapView: React.FC<MindNoteMapViewProps> = ({
  root,
  structure,
  branchStyle,
  zoom,
  activeNodeId,
  readOnly = false,
  onSelectNode,
  onRootChange,
  onZoomChange,
  onReady,
  onRemoveImage,
  background = MN_COLORS.mapBg,
  containerOverflow = 'hidden',
  fitOnInit = true,
  enableMouseWheel = true,
  lockZoom = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mindMapRef = useRef<MindMapInstance | null>(null);
  const syncingRef = useRef(false);
  const zoomSyncRef = useRef(false);
  const onRootChangeRef = useRef(onRootChange);
  const onSelectNodeRef = useRef(onSelectNode);
  const onZoomChangeRef = useRef(onZoomChange);
  const onReadyRef = useRef(onReady);
  const onRemoveImageRef = useRef(onRemoveImage);
  const rootRef = useRef(root);
  const activeNodeIdRef = useRef(activeNodeId);
  const readOnlyRef = useRef(readOnly);
  const lockZoomRef = useRef(lockZoom);
  const [imgHover, setImgHover] = useState<{
    nodeId: string;
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  onRootChangeRef.current = onRootChange;
  onSelectNodeRef.current = onSelectNode;
  onZoomChangeRef.current = onZoomChange;
  onReadyRef.current = onReady;
  onRemoveImageRef.current = onRemoveImage;
  rootRef.current = root;
  activeNodeIdRef.current = activeNodeId;
  readOnlyRef.current = readOnly;
  lockZoomRef.current = lockZoom;

  const restoreActiveSelectionRef = useRef<(mm: MindMapInstance) => void>(() => {});
  restoreActiveSelectionRef.current = (mm: MindMapInstance) => {
    const id = activeNodeIdRef.current;
    if (!id) return;
    const renderer = mm.renderer as {
      findNodeByUid?: (uid: string) => { active?: () => void } | null;
      activeNodeList?: { getData?: (key: string) => unknown; uid?: string }[];
    };
    const active = renderer.activeNodeList?.[0];
    const activeUid =
      (typeof active?.getData === 'function' ? active.getData('uid') : undefined) ?? active?.uid;
    if (activeUid === id) return;
    renderer.findNodeByUid?.(id)?.active?.();
  };

  /** 初始化 simple-mind-map */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    MindMap.extendNodeDataNoStylePropList(['completed']);

    const mm: MindMapInstance = new (MindMap as MindMapInstance)({
      el,
      data: mindNodeToSmmData(root),
      readonly: readOnlyRef.current,
      layout: mapStructure(structure),
      theme: 'default',
      themeConfig: createMindMapThemeConfig(branchStyle),
      textAutoWrapWidth: MIND_NODE_MAX_WIDTH - 32,
      minZoomRatio: lockZoomRef.current ? 100 : 25,
      maxZoomRatio: lockZoomRef.current ? 100 : 200,
      scaleRatio: lockZoomRef.current ? 0 : 0.08,
      fit: false,
      fitPadding: 48,
      enableFreeDrag: false,
      defaultInsertSecondLevelNodeText: '',
      defaultInsertBelowSecondLevelNodeText: '',
      addHistoryOnInit: false,
      isShowCreateChildBtnIcon: true,
      mousewheelAction: lockZoomRef.current ? 'zoom' : (enableMouseWheel ? 'move' : 'zoom'),
      mousewheelZoomAction: lockZoomRef.current ? 'none' : (enableMouseWheel ? 'zoom' : 'none'),
      beforeShortcutRun: (key: string) => {
        if (readOnlyRef.current) return false;
        if (key === 'Control+z' || key === 'Control+y' || key === 'Control+Shift+z') {
          return true;
        }
        return false;
      },
    });

    mindMapRef.current = mm;
    mm.view.setScale(lockZoomRef.current ? 1 : zoom / 100);

    onReadyRef.current?.({
      goTargetNode: (id: string) => {
        mm.execCommand('GO_TARGET_NODE', id);
      },
      startTextEdit: (id: string) => {
        if (readOnlyRef.current) return;
        const renderer = mm.renderer as {
          findNodeByUid?: (uid: string) => unknown;
          textEdit?: { showTextEdit?: (node: unknown) => void };
        };
        const target = renderer.findNodeByUid?.(id);
        if (target && renderer.textEdit?.showTextEdit) {
          renderer.textEdit.showTextEdit(target);
        }
      },
    });

    let fitted = false;

    const finishSync = () => {
      syncingRef.current = false;
    };

    mm.on('node_tree_render_end', () => {
      restoreActiveSelectionRef.current(mm);
      finishSync();
      if (!fitted) {
        fitted = true;
        if (fitOnInit) {
          mm.view.fit();
        } else {
          mm.execCommand('GO_TARGET_NODE', rootRef.current.id);
        }
      }
    });

    mm.on('data_change', (data: SmmNode) => {
      if (readOnlyRef.current || syncingRef.current || !data) return;
      const incoming = smmDataToMindNode(data);
      const merged = mergeMindNodeTree(rootRef.current, incoming);
      if (mindNodesEqual(merged, rootRef.current)) return;
      onRootChangeRef.current(merged, true);
    });

    mm.on('node_active', (
      node: { getData?: (key: string) => unknown; nodeData?: { data?: { uid?: string } }; uid?: string } | null,
      activeList?: { getData?: (key: string) => unknown; nodeData?: { data?: { uid?: string } }; uid?: string }[],
    ) => {
      const list = Array.isArray(activeList) ? activeList : [];
      if (list.length === 0) {
        if (syncingRef.current) return;
        onSelectNodeRef.current(null);
        return;
      }
      const target = node ?? list[list.length - 1];
      if (!target) return;
      const id =
        (typeof target.getData === 'function' ? target.getData('uid') : undefined) ??
        target.nodeData?.data?.uid ??
        target.uid;
      if (typeof id === 'string') onSelectNodeRef.current(id);
    });

    mm.on('view_data_change', (viewData: { state: { scale: number } }) => {
      if (lockZoomRef.current) {
        if (Math.abs(viewData.state.scale - 1) > 0.001) {
          mm.view.setScale(1);
        }
        return;
      }
      if (zoomSyncRef.current) return;
      onZoomChangeRef.current(Math.round(viewData.state.scale * 100));
    });

    const onImgEnter = (
      node: { getData?: (key: string) => unknown; uid?: string },
      imgNode: { rbox?: () => DOMRect },
    ) => {
      const id =
        (typeof node.getData === 'function' ? node.getData('uid') : undefined) ??
        node.uid;
      if (typeof id !== 'string' || !imgNode.rbox) return;
      const rect = imgNode.rbox();
      setImgHover({
        nodeId: id,
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
      });
    };
    const onImgLeave = () => setImgHover(null);
    mm.on('node_img_mouseenter', onImgEnter);
    mm.on('node_img_mouseleave', onImgLeave);

    return () => {
      mm.off('node_img_mouseenter', onImgEnter);
      mm.off('node_img_mouseleave', onImgLeave);
      if (!syncingRef.current) {
        try {
          const incoming = smmDataToMindNode(mm.getData(false) as SmmNode);
          const merged = mergeMindNodeTree(rootRef.current, incoming);
          if (!mindNodesEqual(merged, rootRef.current)) {
            onRootChangeRef.current(merged, false);
          }
        } catch {
          // ignore flush errors during teardown
        }
      }
      mm.destroy();
      mindMapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 预览/编辑模式切换 */
  useEffect(() => {
    const mm = mindMapRef.current;
    if (!mm || typeof mm.setMode !== 'function') return;
    mm.setMode(readOnly ? 'readonly' : 'edit');
  }, [readOnly]);

  /** 外部数据变更（撤销/重做）同步到导图 */
  useEffect(() => {
    const mm = mindMapRef.current;
    if (!mm) return;

    const current = smmDataToMindNode(mm.getData(false) as SmmNode);
    if (mindNodesEqual(current, root)) return;

    syncingRef.current = true;
    mm.updateData(mindNodeToSmmData(root));
  }, [root]);

  /** 布局结构 */
  useEffect(() => {
    const mm = mindMapRef.current;
    if (!mm || mm.getLayout() === mapStructure(structure)) return;
    syncingRef.current = true;
    mm.setLayout(mapStructure(structure));
  }, [structure]);

  /** 分支线型 */
  useEffect(() => {
    const mm = mindMapRef.current;
    if (!mm) return;
    mm.setThemeConfig(createMindMapThemeConfig(branchStyle));
  }, [branchStyle]);

  /** 缩放 */
  useEffect(() => {
    if (lockZoom) return;
    const mm = mindMapRef.current;
    if (!mm) return;
    const currentZoom = Math.round(mm.view.scale * 100);
    if (Math.abs(currentZoom - zoom) <= 1) return;
    zoomSyncRef.current = true;
    mm.view.setScale(zoom / 100);
    requestAnimationFrame(() => {
      zoomSyncRef.current = false;
    });
  }, [zoom, lockZoom]);

  /** 外部选中节点 */
  useEffect(() => {
    const mm = mindMapRef.current;
    if (!mm) return;
    if (!activeNodeId) {
      mm.execCommand('CLEAR_ACTIVE_NODE');
      return;
    }
    restoreActiveSelectionRef.current(mm);
  }, [activeNodeId]);

  return (
    <div
      data-mind-canvas=""
      style={{
        flex: 1,
        width: '100%',
        height: '100%',
        minHeight: 0,
        overflow: containerOverflow,
        background,
        position: 'relative',
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
        }}
      />
      {imgHover && onRemoveImage && !readOnly && (
        <button
          type="button"
          aria-label="删除图片"
          onMouseDown={e => e.preventDefault()}
          onClick={() => {
            onRemoveImageRef.current?.(imgHover.nodeId);
            setImgHover(null);
          }}
          style={{
            position: 'fixed',
            left: imgHover.left + imgHover.width - 32,
            top: imgHover.top + imgHover.height - 32,
            width: 24,
            height: 24,
            borderRadius: '50%',
            border: 'none',
            background: '#F54A45',
            color: '#fff',
            fontSize: 16,
            lineHeight: '24px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            zIndex: 200,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
};

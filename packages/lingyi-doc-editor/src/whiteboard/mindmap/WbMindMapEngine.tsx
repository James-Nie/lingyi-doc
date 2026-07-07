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
} from '../../smm/smmAdapter';
import { createWbMindmapTheme } from './wbMindmapTheme';
import { alignSmmEmbeddedView, computeMindmapElementSize, SMM_EMBED_PADDING, type AlignSmmResult, type MindmapBoundsUpdate } from './syncMindmapBounds';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MindMapInstance = any;

export interface WbMindMapApi {
  goTargetNode: (id: string) => void;
  startTextEdit: (id: string) => void;
  fitView: () => void;
  execCommand: (name: string, ...args: unknown[]) => void;
  flushData: () => void;
}

export interface WbMindMapEngineProps {
  root: MindNode;
  structure: MindNoteStructure;
  branchStyle: MindNoteBranchStyle;
  activeNodeId: string | null;
  readOnly?: boolean;
  /** 是否允许节点交互（选中、编辑、快捷键）；画板非编辑态应为 false */
  interactive?: boolean;
  /** 画板嵌入：锁定 100% 缩放，滚轮交给外层画布 */
  canvasEmbedded?: boolean;
  onSelectNode: (id: string | null) => void;
  onRootChange: (root: MindNode, recordHistory?: boolean) => void;
  onReady?: (api: WbMindMapApi) => void;
  onRemoveImage?: (id: string) => void;
  onContentSizeChange?: (bounds: MindmapBoundsUpdate) => void;
}

export const WbMindMapEngine: React.FC<WbMindMapEngineProps> = ({
  root,
  structure,
  branchStyle,
  activeNodeId,
  readOnly = false,
  interactive = true,
  canvasEmbedded = false,
  onSelectNode,
  onRootChange,
  onReady,
  onRemoveImage,
  onContentSizeChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mindMapRef = useRef<MindMapInstance | null>(null);
  const syncingRef = useRef(false);
  const onRootChangeRef = useRef(onRootChange);
  const onSelectNodeRef = useRef(onSelectNode);
  const onReadyRef = useRef(onReady);
  const onRemoveImageRef = useRef(onRemoveImage);
  const onContentSizeChangeRef = useRef(onContentSizeChange);
  const rootRef = useRef(root);
  const activeNodeIdRef = useRef(activeNodeId);
  const readOnlyRef = useRef(readOnly);
  const interactiveRef = useRef(interactive);
  const structureRef = useRef(structure);
  const branchStyleRef = useRef(branchStyle);
  const [contentReady, setContentReady] = useState(false);
  const hasAlignedOnceRef = useRef(false);
  const scheduleEmbeddedSyncRef = useRef<(reportSize?: boolean, resetView?: boolean) => void>(() => {});
  const suppressSelectionEventsRef = useRef(false);
  const skipSyncOnceRef = useRef(false);
  const [imgHover, setImgHover] = useState<{
    nodeId: string;
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  onRootChangeRef.current = onRootChange;
  onSelectNodeRef.current = onSelectNode;
  onReadyRef.current = onReady;
  onRemoveImageRef.current = onRemoveImage;
  onContentSizeChangeRef.current = onContentSizeChange;
  rootRef.current = root;
  activeNodeIdRef.current = activeNodeId;
  readOnlyRef.current = readOnly;
  interactiveRef.current = interactive;
  structureRef.current = structure;
  branchStyleRef.current = branchStyle;

  const markContentVisible = () => {
    if (hasAlignedOnceRef.current) return;
    hasAlignedOnceRef.current = true;
    setContentReady(true);
  };

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

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let mm: MindMapInstance | null = null;
    let resizeObserver: ResizeObserver | undefined;
    let disposed = false;
    let syncRaf = 0;
    let lastReportedW = 0;
    let lastReportedH = 0;

    MindMap.extendNodeDataNoStylePropList(['completed']);

    const flushData = () => {
      if (!interactiveRef.current || !mm) return;
      try {
        const incoming = smmDataToMindNode(mm.getData(false) as SmmNode);
        const merged = mergeMindNodeTree(rootRef.current, incoming);
        if (!mindNodesEqual(merged, rootRef.current)) {
          onRootChangeRef.current(merged, true);
        }
      } catch {
        // ignore
      }
    };

    const fallbackBounds = (): MindmapBoundsUpdate => (
      computeMindmapElementSize(
        rootRef.current,
        structureRef.current,
        branchStyleRef.current,
      )
    );

    const reportBounds = (bounds: MindmapBoundsUpdate | AlignSmmResult, reportSize: boolean) => {
      if (!reportSize) return;
      const { width, height } = bounds;
      if (width === lastReportedW && height === lastReportedH) return;
      lastReportedW = width;
      lastReportedH = height;
      onContentSizeChangeRef.current?.({ width, height });
    };

    const fitPadding = SMM_EMBED_PADDING;
    let onImgEnter: ((node: unknown, imgNode: { rbox?: () => DOMRect }) => void) | null = null;
    let onImgLeave: (() => void) | null = null;

    const syncEmbeddedLayout = (reportSize = true, attempt = 0, resetView = false) => {
      if (!mm || disposed) return;

      let result: AlignSmmResult | null = null;
      try {
        result = alignSmmEmbeddedView(mm, fitPadding, containerRef.current, { resetView });
      } catch {
        result = null;
      }

      if (result?.aligned) {
        markContentVisible();
      }
      if (!result && attempt < 8) {
        syncRaf = window.requestAnimationFrame(() => syncEmbeddedLayout(reportSize, attempt + 1, resetView));
        return;
      }
      if (!result?.aligned && attempt < 24) {
        syncRaf = window.requestAnimationFrame(() => syncEmbeddedLayout(reportSize, attempt + 1, resetView));
      } else if (!result?.aligned && attempt >= 24) {
        markContentVisible();
      }
      reportBounds(result ?? fallbackBounds(), reportSize);
    };

    const scheduleEmbeddedSync = (reportSize = true, resetView = false) => {
      if (!canvasEmbedded || disposed) return;
      window.cancelAnimationFrame(syncRaf);
      syncRaf = window.requestAnimationFrame(() => syncEmbeddedLayout(reportSize, 0, resetView));
    };
    scheduleEmbeddedSyncRef.current = scheduleEmbeddedSync;

    const initMindMap = (attempt = 0) => {
      if (disposed) return;
      if (el.clientWidth < 8 || el.clientHeight < 8) {
        if (attempt < 20) {
          syncRaf = window.requestAnimationFrame(() => initMindMap(attempt + 1));
        } else if (canvasEmbedded) {
          reportBounds(fallbackBounds(), true);
        }
        return;
      }

      try {
        mm = new (MindMap as MindMapInstance)({
          el,
          data: mindNodeToSmmData(root),
          // 画板嵌入统一用 edit 布局渲染，避免 readonly/edit 切换导致内容位置漂移
          readonly: canvasEmbedded ? false : readOnlyRef.current,
          layout: mapStructure(structure),
          theme: 'default',
          themeConfig: createWbMindmapTheme(branchStyle),
          textAutoWrapWidth: MIND_NODE_MAX_WIDTH - 32,
          minZoomRatio: canvasEmbedded ? 100 : 25,
          maxZoomRatio: canvasEmbedded ? 100 : 200,
          scaleRatio: canvasEmbedded ? 0 : 0.08,
          fit: false,
          fitPadding: SMM_EMBED_PADDING,
          enableFreeDrag: false,
          defaultInsertSecondLevelNodeText: '输入文本',
          defaultInsertBelowSecondLevelNodeText: '输入文本',
          addHistoryOnInit: false,
          isShowCreateChildBtnIcon: true,
          mousewheelAction: canvasEmbedded ? 'zoom' : 'zoom',
          mousewheelZoomAction: canvasEmbedded ? 'none' : 'zoom',
          beforeShortcutRun: (key: string) => {
            if (!interactiveRef.current) return false;
            if (document.querySelector('.smm-text-edit')) return true;
            if (key === 'Control+z' || key === 'Control+y' || key === 'Control+Shift+z') {
              return false;
            }
            return true;
          },
        });
      } catch {
        reportBounds(fallbackBounds(), true);
        return;
      }

      mindMapRef.current = mm;
      try {
        mm.view.setScale(1);
      } catch {
        // ignore
      }

      onReadyRef.current?.({
        goTargetNode: (id: string) => mm!.execCommand('GO_TARGET_NODE', id),
        startTextEdit: (id: string) => {
          if (!interactiveRef.current) return;
          const renderer = mm!.renderer as {
            findNodeByUid?: (uid: string) => unknown;
            textEdit?: { showTextEdit?: (node: unknown) => void };
          };
          const target = renderer.findNodeByUid?.(id);
          if (target && renderer.textEdit?.showTextEdit) {
            renderer.textEdit.showTextEdit(target);
          }
        },
        fitView: () => mm!.view.fit(),
        execCommand: (name: string, ...args: unknown[]) => {
          if (!interactiveRef.current) return;
          mm!.execCommand(name, ...args);
        },
        flushData,
      });

      let initialized = false;

      mm.on('node_tree_render_end', () => {
        syncingRef.current = false;
        if (canvasEmbedded) {
          if (skipSyncOnceRef.current) {
            skipSyncOnceRef.current = false;
            return;
          }
          scheduleEmbeddedSync(true, false);
          return;
        }
        restoreActiveSelectionRef.current(mm!);
        if (!initialized) {
          initialized = true;
          try {
            mm!.view.fit();
          } catch {
            // ignore
          }
        }
      });

      mm.on('data_change', (data: SmmNode) => {
        if (!interactiveRef.current || syncingRef.current || !data) return;
        const incoming = smmDataToMindNode(data);
        const merged = mergeMindNodeTree(rootRef.current, incoming);
        if (mindNodesEqual(merged, rootRef.current)) return;
        onRootChangeRef.current(merged, true);
      });

      mm.on('hide_text_edit', flushData);

      if (canvasEmbedded && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          scheduleEmbeddedSync(false);
        });
        resizeObserver.observe(el);
      }

      mm.on('node_active', (
        node: { getData?: (key: string) => unknown; nodeData?: { data?: { uid?: string } }; uid?: string } | null,
        activeList?: { getData?: (key: string) => unknown; nodeData?: { data?: { uid?: string } }; uid?: string }[],
      ) => {
        if (suppressSelectionEventsRef.current) return;
        if (!interactiveRef.current) return;
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
        if (!canvasEmbedded) return;
        if (Math.abs(viewData.state.scale - 1) > 0.001) {
          try {
            mm!.view.setScale(1);
          } catch {
            // ignore
          }
        }
      });

      const onImgEnterHandler = (
        node: unknown,
        imgNode: { rbox?: () => DOMRect },
      ) => {
        const n = node as { getData?: (key: string) => unknown; uid?: string };
        const id =
          (typeof n.getData === 'function' ? n.getData('uid') : undefined) ??
          n.uid;
        if (typeof id !== 'string' || !imgNode.rbox) return;
        try {
          const rect = imgNode.rbox();
          setImgHover({
            nodeId: id,
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
          });
        } catch {
          // SMM 节点尚未布局完成
        }
      };
      const onImgLeaveHandler = () => setImgHover(null);
      onImgEnter = onImgEnterHandler;
      onImgLeave = onImgLeaveHandler;
      mm.on('node_img_mouseenter', onImgEnterHandler);
      mm.on('node_img_mouseleave', onImgLeaveHandler);

      if (canvasEmbedded) {
        scheduleEmbeddedSync(true, true);
      }
    };

    initMindMap();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(syncRaf);
      resizeObserver?.disconnect();
      if (mm) {
        if (onImgEnter) mm.off('node_img_mouseenter', onImgEnter);
        if (onImgLeave) mm.off('node_img_mouseleave', onImgLeave);
        mm.off('hide_text_edit', flushData);
        if (!syncingRef.current) {
          try {
            const incoming = smmDataToMindNode(mm.getData(false) as SmmNode);
            const merged = mergeMindNodeTree(rootRef.current, incoming);
            if (!mindNodesEqual(merged, rootRef.current)) {
              onRootChangeRef.current(merged, false);
            }
          } catch {
            // ignore
          }
        }
        mm.destroy();
      }
      mindMapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const mm = mindMapRef.current;
    if (!mm || typeof mm.setMode !== 'function') return;
    const nextMode = canvasEmbedded ? 'edit' : (readOnly ? 'readonly' : 'edit');
    const currentMode = typeof mm.getMode === 'function' ? mm.getMode() : undefined;
    if (currentMode === nextMode) return;
    mm.setMode(nextMode);
    if (canvasEmbedded) {
      scheduleEmbeddedSyncRef.current(true, true);
    }
  }, [readOnly, canvasEmbedded]);

  useEffect(() => {
    if (!canvasEmbedded) return;
    scheduleEmbeddedSyncRef.current(true, false);
  }, [interactive, canvasEmbedded]);

  useEffect(() => {
    const mm = mindMapRef.current;
    if (!mm) return;
    if (!canvasEmbedded) {
      if (!activeNodeId) {
        mm.execCommand('CLEAR_ACTIVE_NODE');
      } else {
        restoreActiveSelectionRef.current(mm);
      }
      return;
    }

    if (!activeNodeId) {
      suppressSelectionEventsRef.current = true;
      try {
        mm.execCommand('CLEAR_ACTIVE_NODE');
      } catch {
        // ignore
      }
      suppressSelectionEventsRef.current = false;
      return;
    }
    skipSyncOnceRef.current = true;
    restoreActiveSelectionRef.current(mm);
  }, [activeNodeId, canvasEmbedded]);

  useEffect(() => {
    const mm = mindMapRef.current;
    if (!mm) return;
    const current = smmDataToMindNode(mm.getData(false) as SmmNode);
    if (mindNodesEqual(current, root)) return;
    syncingRef.current = true;
    mm.updateData(mindNodeToSmmData(root));
    if (canvasEmbedded) {
      scheduleEmbeddedSyncRef.current(true, false);
    }
  }, [root, canvasEmbedded]);

  useEffect(() => {
    const mm = mindMapRef.current;
    if (!mm || mm.getLayout() === mapStructure(structure)) return;
    syncingRef.current = true;
    mm.setLayout(mapStructure(structure));
    if (canvasEmbedded) {
      scheduleEmbeddedSyncRef.current(true, true);
    }
  }, [structure, canvasEmbedded]);

  useEffect(() => {
    const mm = mindMapRef.current;
    if (!mm) return;
    mm.setThemeConfig(createWbMindmapTheme(branchStyle));
    if (canvasEmbedded) {
      scheduleEmbeddedSyncRef.current(false, false);
    }
  }, [branchStyle, canvasEmbedded]);

  return (
    <>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          minHeight: 120,
          overflow: 'visible',
          pointerEvents: canvasEmbedded && !interactive ? 'none' : 'auto',
          opacity: canvasEmbedded && !contentReady ? 0 : 1,
          transition: canvasEmbedded ? 'opacity 0.12s ease' : undefined,
        }}
      />
      {imgHover && onRemoveImage && interactive && (
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
    </>
  );
};

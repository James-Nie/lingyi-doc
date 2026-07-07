import React, { useCallback, useRef } from 'react';
import type {
  MindNode,
  MindmapElement,
  MindmapLayout,
  MindNoteBranchStyle,
} from '@lingyi-doc/core';
import { findMindNode } from '@lingyi-doc/core';
import { readImageFile } from '../../smm/imageUtils';
import { WbMindMapEngine, type WbMindMapApi } from './WbMindMapEngine';
import { WbMindmapToolbar } from './WbMindmapToolbar';
import type { WbMindmapAction } from './types';
import type { MindmapBoundsUpdate } from './syncMindmapBounds';

export type { WbMindmapAction };

export interface WbMindmapEditProps {
  activeNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onRootChange: (root: MindNode, recordHistory?: boolean) => void;
  onSettingsChange: (patch: Partial<{
    layout: MindmapLayout;
    branchStyle: MindNoteBranchStyle;
  }>) => void;
  onNodeUpdate: (nodeId: string, patch: Partial<MindNode>) => void;
  onAction: (action: WbMindmapAction) => void;
  onBoundsChange?: (bounds: MindmapBoundsUpdate) => void;
}

interface WbMindmapViewProps {
  element: MindmapElement;
  readOnly?: boolean;
  selectMode?: boolean;
  editing?: boolean;
  edit?: WbMindmapEditProps;
  canvasEmbedded?: boolean;
  canvasZoom?: number;
  onBoundsChange?: (bounds: MindmapBoundsUpdate) => void;
}

export const WbMindmapView: React.FC<WbMindmapViewProps> = ({
  element,
  readOnly = false,
  selectMode = false,
  editing = false,
  edit,
  canvasEmbedded = false,
  canvasZoom = 1,
  onBoundsChange,
}) => {
  const mapApiRef = useRef<WbMindMapApi | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const canSelectNodes = selectMode && !readOnly && !!edit;
  const activeNode = edit?.activeNodeId
    ? findMindNode(element.root, edit.activeNodeId)?.node ?? null
    : null;
  const branchStyle = element.branchStyle ?? 'straight';

  const handleAddDescription = useCallback(() => {
    if (!edit?.activeNodeId) return;
    const next = window.prompt('编辑描述', activeNode?.note ?? '');
    if (next === null) return;
    edit.onNodeUpdate(edit.activeNodeId, { note: next });
  }, [activeNode?.note, edit]);

  const handleAddImage = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  const handleImageSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !edit?.activeNodeId) return;
    try {
      const { src, width, height } = await readImageFile(file);
      edit.onNodeUpdate(edit.activeNodeId, { image: src, imageWidth: width, imageHeight: height });
    } catch {
      // ignore
    }
  }, [edit]);

  const handleRemoveImage = useCallback((nodeId: string) => {
    edit?.onNodeUpdate(nodeId, { image: undefined, imageWidth: undefined, imageHeight: undefined });
  }, [edit]);

  const handleAction = useCallback((action: WbMindmapAction) => {
    if (!edit) return;
    const api = mapApiRef.current;
    const cmdMap: Partial<Record<WbMindmapAction, string>> = {
      child: 'INSERT_CHILD_NODE',
      sibling: 'INSERT_NODE',
      parent: 'INSERT_PARENT_NODE',
      delete: 'REMOVE_NODE',
    };
    const cmd = cmdMap[action];
    if (cmd && api) {
      api.execCommand(cmd, true);
      window.setTimeout(() => api.flushData(), 0);
      return;
    }
    edit.onAction(action);
  }, [edit]);

  return (
    <div
      data-wb-mindmap={element.id}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'visible',
        position: 'relative',
        background: 'transparent',
      }}
    >
      {canvasEmbedded && (
        <style>{`
          [data-wb-mindmap="${element.id}"] .smm-mind-map-container,
          [data-wb-mindmap="${element.id}"] .smm-canvas,
          [data-wb-mindmap="${element.id}"] canvas,
          [data-wb-mindmap="${element.id}"] svg {
            background: transparent !important;
            overflow: visible !important;
          }
          [data-wb-mindmap="${element.id}"] .smm-mind-map-container {
            width: 100% !important;
            height: 100% !important;
          }
        `}</style>
      )}

      <div style={{ width: '100%', height: '100%', position: 'relative', minHeight: canvasEmbedded ? undefined : 200 }}>
        <WbMindMapEngine
          root={element.root}
          structure={element.layout}
          branchStyle={branchStyle}
          activeNodeId={edit?.activeNodeId ?? null}
          readOnly={readOnly}
          interactive={!readOnly && editing && !!edit}
          canvasEmbedded={canvasEmbedded}
          onSelectNode={edit?.onSelectNode ?? (() => {})}
          onRootChange={edit?.onRootChange ?? (() => {})}
          onContentSizeChange={edit?.onBoundsChange ?? onBoundsChange}
          onReady={api => { mapApiRef.current = api; }}
          onRemoveImage={canSelectNodes ? handleRemoveImage : undefined}
        />

        {canSelectNodes && editing && activeNode && (
          <WbMindmapToolbar
            node={activeNode}
            layout={element.layout}
            branchStyle={branchStyle}
            canvasZoom={canvasEmbedded ? canvasZoom : 1}
            onPatch={patch => edit.onNodeUpdate(activeNode.id, patch)}
            onLayoutChange={layout => edit.onSettingsChange({ layout })}
            onBranchStyleChange={style => edit.onSettingsChange({ branchStyle: style })}
            onAction={handleAction}
            onAddDescription={handleAddDescription}
            onAddImage={handleAddImage}
          />
        )}

        {canSelectNodes && editing && (
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleImageSelected}
          />
        )}
      </div>
    </div>
  );
};

/** @deprecated 使用 WbMindmapView */
export const WhiteboardMindmapView = WbMindmapView;

/** @deprecated 使用 WbMindmapEditProps */
export type WhiteboardMindmapEditProps = WbMindmapEditProps;

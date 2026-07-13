import React, { useCallback, useRef } from 'react';
import type {
  MindNode,
  MindmapElement,
  MindmapLayout,
  MindNoteBranchStyle,
} from '@lingyi-doc/core';
import { findMindNode, WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT } from '@lingyi-doc/core';
import { MindmapView } from '@lingyi-doc/mind-map-react';
import type { MindmapNodeAction } from '@lingyi-doc/mind-map';
import { readImageFile } from '../../smm/imageUtils';
import { MindmapNodeFormatToolbar } from './MindmapNodeFormatToolbar';
import { WB_Z_INDEX } from '../styles';
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
  /** nodeId 可选：折叠按钮等场景传入点击目标，否则用 activeNodeId */
  onAction: (action: WbMindmapAction, nodeId?: string) => void;
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
  onBoundsChange,
}) => {
  const imageInputRef = useRef<HTMLInputElement>(null);

  const canSelectNodes = selectMode && !readOnly && !!edit;
  const activeNode = edit?.activeNodeId
    ? findMindNode(element.root, edit.activeNodeId)?.node ?? null
    : null;
  const branchStyle = element.branchStyle ?? WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT;

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

  const handleAction = useCallback((action: WbMindmapAction) => {
    edit?.onAction(action);
  }, [edit]);

  const handleMindmapAction = useCallback((action: MindmapNodeAction, nodeId: string) => {
    const mapped: WbMindmapAction | null = action === 'toggleCollapse'
      ? 'collapse'
      : action;
    if (mapped) edit?.onAction(mapped, nodeId);
  }, [edit]);

  const handleNodeTextChange = useCallback((nodeId: string, text: string) => {
    edit?.onNodeUpdate(nodeId, { text });
  }, [edit]);

  const handleContentSizeChange = useCallback((size: { width: number; height: number }) => {
    const cb = edit?.onBoundsChange ?? onBoundsChange;
    cb?.(size);
  }, [edit, onBoundsChange]);

  if (canvasEmbedded) {
    return (
      <div
        data-wb-mindmap={element.id}
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          pointerEvents: 'none',
        }}
      />
    );
  }

  return (
    <div data-wb-mindmap={element.id} style={{ width: '100%', height: '100%', minHeight: 200, position: 'relative' }}>
      <MindmapView
        mode="embedded"
        themeId="whiteboard"
        root={element.root}
        structure={element.layout}
        branchStyle={branchStyle}
        activeNodeId={edit?.activeNodeId ?? null}
        readOnly={readOnly}
        interactive={!readOnly && !!edit}
        onSelectNode={edit?.onSelectNode}
        onNodeTextChange={handleNodeTextChange}
        onAction={handleMindmapAction}
        onContentSizeChange={handleContentSizeChange}
      />
      {canSelectNodes && activeNode && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: WB_Z_INDEX.shapeToolbar,
            pointerEvents: 'auto',
          }}
          onPointerDown={e => e.stopPropagation()}
        >
          <MindmapNodeFormatToolbar
            floating={false}
            node={activeNode}
            layout={element.layout}
            branchStyle={branchStyle}
            anchorX={0}
            anchorY={0}
            onNodePatch={patch => edit!.onNodeUpdate(activeNode.id, patch)}
            onSettingsChange={patch => edit!.onSettingsChange(patch)}
            onAction={handleAction}
            onAddDescription={handleAddDescription}
            onAddImage={handleAddImage}
          />
        </div>
      )}
      {canSelectNodes && (
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleImageSelected}
        />
      )}
    </div>
  );
};

/** @deprecated 使用 WbMindmapView */
export const WhiteboardMindmapView = WbMindmapView;

/** @deprecated 使用 WbMindmapEditProps */
export type WhiteboardMindmapEditProps = WbMindmapEditProps;

import React, { useCallback, useRef } from 'react';
import type { MindNode, MindNoteBranchStyle, MindNoteStructure } from '@lingyi-doc/core';
import { updateMindNode } from '@lingyi-doc/core';
import {
  applyMindmapAction,
  childActionForGrowDirection,
  isMindmapInsertAction,
  type MindmapNodeAction,
} from '@lingyi-doc/mind-map';
import { MindmapView, type MindmapViewApi } from '@lingyi-doc/mind-map-react';
import { MN_COLORS } from './styles';

export type { MindmapViewApi as MindMapViewApi };

export interface MindNoteMapViewProps {
  root: MindNode;
  structure: MindNoteStructure;
  branchStyle: MindNoteBranchStyle;
  zoom: number;
  activeNodeId: string | null;
  readOnly?: boolean;
  onSelectNode: (id: string | null) => void;
  onRootChange: (root: MindNode, recordHistory?: boolean) => void;
  onZoomChange: (zoom: number) => void;
  onReady?: (api: MindmapViewApi) => void;
  onAddImage?: () => void;
  onRemoveImage?: (id: string) => void;
  background?: string;
  containerOverflow?: 'hidden' | 'visible';
  fitOnInit?: boolean;
  enableMouseWheel?: boolean;
  lockZoom?: boolean;
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
  onAddImage,
  background = MN_COLORS.mapBg,
  fitOnInit = true,
  enableMouseWheel = true,
  lockZoom = false,
}) => {
  const apiRef = useRef<MindmapViewApi | null>(null);

  const handleNodeTextChange = useCallback((nodeId: string, text: string) => {
    onRootChange(updateMindNode(root, nodeId, { text }), true);
  }, [onRootChange, root]);

  const handleAction = useCallback((action: MindmapNodeAction, nodeId: string) => {
    const res = applyMindmapAction(root, nodeId, action);
    if (!res) return;
    onRootChange(res.root, true);
    if (!res.nextActiveId) return;
    onSelectNode(res.nextActiveId);
    if (isMindmapInsertAction(action)) {
      requestAnimationFrame(() => apiRef.current?.startTextEdit(res.nextActiveId!));
    }
  }, [onRootChange, onSelectNode, root]);

  return (
    <MindmapView
      mode="standalone"
      themeId="default"
      root={root}
      structure={structure}
      branchStyle={branchStyle}
      zoom={zoom}
      activeNodeId={activeNodeId}
      readOnly={readOnly}
      interactive={!readOnly}
      background={background}
      fitOnInit={fitOnInit}
      enableMouseWheel={enableMouseWheel}
      lockZoom={lockZoom}
      onSelectNode={onSelectNode}
      onNodeTextChange={handleNodeTextChange}
      onAction={handleAction}
      onZoomChange={onZoomChange}
      onReady={api => {
        apiRef.current = api;
        onReady?.(api);
      }}
      onAddImage={onAddImage}
    />
  );
};

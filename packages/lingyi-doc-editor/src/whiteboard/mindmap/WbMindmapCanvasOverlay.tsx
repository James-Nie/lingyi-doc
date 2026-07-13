import React, { useCallback } from 'react';
import type { MindmapElement, WhiteboardViewport } from '@lingyi-doc/core';
import { computeMindMapLayout, createWhiteboardMeasureOptions, findMindNode, WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT } from '@lingyi-doc/core';
import { computeMindmapQuickActionTopExtent, computeThemedMindMapLayout, resolveMindmapTextEditStyle, resolveTheme } from '@lingyi-doc/mind-map';
import { readImageFile } from '../../smm/imageUtils';
import { getMindmapNodeScreenBounds } from '../canvas/mindmapHitTest';
import { WbMindmapControls } from './WbMindmapControls';
import { MindmapNodeFormatToolbarWithImage } from './MindmapNodeFormatToolbar';
import { MindmapNodeInlineEditor } from './MindmapNodeInlineEditor';
import type { WbMindmapEditProps } from './WbMindmapView';

interface WbMindmapCanvasOverlayProps {
  element: MindmapElement;
  viewport: WhiteboardViewport;
  edit: WbMindmapEditProps;
  inlineEditNodeId: string | null;
  onInlineEditClose: () => void;
  readOnly?: boolean;
}

export const WbMindmapCanvasOverlay: React.FC<WbMindmapCanvasOverlayProps> = ({
  element,
  viewport,
  edit,
  inlineEditNodeId,
  onInlineEditClose,
  readOnly = false,
}) => {
  const activeNode = edit.activeNodeId
    ? findMindNode(element.root, edit.activeNodeId)?.node ?? null
    : null;
  const branchStyle = element.branchStyle ?? WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT;

  const nodeBounds = edit.activeNodeId
    ? getMindmapNodeScreenBounds(element, edit.activeNodeId, viewport)
    : null;
  const activeLayoutNode = edit.activeNodeId
    ? computeThemedMindMapLayout(element.root, element.layout, branchStyle, 'whiteboard')
      .nodes.find(n => n.id === edit.activeNodeId) ?? null
    : null;
  const mindmapToolbarTopGap = activeLayoutNode
    ? 12 + computeMindmapQuickActionTopExtent(activeLayoutNode, element.layout) * viewport.zoom
    : 12;

  const elementScreen = {
    left: viewport.x + element.x * viewport.zoom,
    top: viewport.y + element.y * viewport.zoom,
    width: element.width * viewport.zoom,
    height: element.height * viewport.zoom,
  };

  const handleAddDescription = useCallback(() => {
    if (!edit.activeNodeId) return;
    const next = window.prompt('编辑描述', activeNode?.note ?? '');
    if (next === null) return;
    edit.onNodeUpdate(edit.activeNodeId, { note: next });
  }, [activeNode?.note, edit]);

  const inlineNode = inlineEditNodeId
    ? findMindNode(element.root, inlineEditNodeId)?.node ?? null
    : null;
  const inlineBounds = inlineEditNodeId
    ? getMindmapNodeScreenBounds(element, inlineEditNodeId, viewport)
    : null;
  const inlineLayoutNode = inlineEditNodeId
    ? computeMindMapLayout(element.root, element.layout, branchStyle, createWhiteboardMeasureOptions())
      .nodes.find(n => n.id === inlineEditNodeId) ?? null
    : null;
  const inlineTextStyle = inlineNode && inlineLayoutNode
    ? resolveMindmapTextEditStyle(inlineNode, inlineLayoutNode, resolveTheme('whiteboard'), viewport.zoom)
    : null;

  if (readOnly) return null;

  return (
    <>
      {activeNode && nodeBounds && !inlineEditNodeId && (
        <MindmapNodeFormatToolbarWithImage
          node={activeNode}
          layout={element.layout}
          branchStyle={branchStyle}
          anchorX={nodeBounds.x + nodeBounds.w / 2}
          anchorY={nodeBounds.y}
          topGap={mindmapToolbarTopGap}
          onNodePatch={patch => edit.onNodeUpdate(activeNode.id, patch)}
          onSettingsChange={patch => edit.onSettingsChange(patch)}
          onAction={edit.onAction}
          onAddDescription={handleAddDescription}
          onAddImage={() => {}}
          onImageSelected={async file => {
            try {
              const { src, width, height } = await readImageFile(file);
              edit.onNodeUpdate(activeNode.id, { image: src, imageWidth: width, imageHeight: height });
            } catch {
              // ignore
            }
          }}
        />
      )}

      <div
        style={{
          position: 'absolute',
          left: elementScreen.left,
          top: elementScreen.top,
          width: elementScreen.width,
          height: elementScreen.height,
          pointerEvents: 'none',
          zIndex: 10050,
        }}
      >
        <WbMindmapControls
          layout={element.layout}
          branchStyle={branchStyle}
          onLayoutChange={layout => edit.onSettingsChange({ layout })}
          onBranchStyleChange={style => edit.onSettingsChange({ branchStyle: style })}
          onRecenter={() => {}}
        />
      </div>

      {inlineNode && inlineBounds && inlineTextStyle && (
        <MindmapNodeInlineEditor
          node={inlineNode}
          bounds={inlineBounds}
          textStyle={inlineTextStyle}
          onChange={text => edit.onNodeUpdate(inlineNode.id, { text })}
          onClose={onInlineEditClose}
        />
      )}
    </>
  );
};

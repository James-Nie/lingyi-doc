import React, { useCallback, useRef } from 'react';
import type { MindmapElement, WhiteboardViewport } from '@lingyi-doc/core';
import { findMindNode } from '@lingyi-doc/core';
import { readImageFile } from '../../smm/imageUtils';
import { getMindmapNodeScreenBounds } from '../canvas/mindmapHitTest';
import { WbMindmapControls } from './WbMindmapControls';
import { WbMindmapToolbar } from './WbMindmapToolbar';
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
  const imageInputRef = useRef<HTMLInputElement>(null);
  const activeNode = edit.activeNodeId
    ? findMindNode(element.root, edit.activeNodeId)?.node ?? null
    : null;
  const branchStyle = element.branchStyle ?? 'straight';

  const nodeBounds = edit.activeNodeId
    ? getMindmapNodeScreenBounds(element, edit.activeNodeId, viewport)
    : null;

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

  const handleAddImage = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  const handleImageSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !edit.activeNodeId) return;
    try {
      const { src, width, height } = await readImageFile(file);
      edit.onNodeUpdate(edit.activeNodeId, { image: src, imageWidth: width, imageHeight: height });
    } catch {
      // ignore
    }
  }, [edit]);

  const inlineNode = inlineEditNodeId
    ? findMindNode(element.root, inlineEditNodeId)?.node ?? null
    : null;
  const inlineBounds = inlineEditNodeId
    ? getMindmapNodeScreenBounds(element, inlineEditNodeId, viewport)
    : null;

  if (readOnly) return null;

  return (
    <>
      {activeNode && nodeBounds && !inlineEditNodeId && (
        <div
          style={{
            position: 'absolute',
            left: nodeBounds.x,
            top: nodeBounds.y - 48,
            width: nodeBounds.w,
            pointerEvents: 'auto',
            zIndex: 10060,
          }}
          onPointerDown={e => e.stopPropagation()}
        >
          <WbMindmapToolbar
            node={activeNode}
            layout={element.layout}
            branchStyle={branchStyle}
            onPatch={patch => edit.onNodeUpdate(activeNode.id, patch)}
            onLayoutChange={layout => edit.onSettingsChange({ layout })}
            onBranchStyleChange={style => edit.onSettingsChange({ branchStyle: style })}
            onAction={edit.onAction}
            onAddDescription={handleAddDescription}
            onAddImage={handleAddImage}
          />
        </div>
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

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleImageSelected}
      />

      {inlineNode && inlineBounds && (
        <MindmapNodeInlineEditor
          node={inlineNode}
          bounds={inlineBounds}
          onChange={text => edit.onNodeUpdate(inlineNode.id, { text })}
          onClose={onInlineEditClose}
        />
      )}
    </>
  );
};

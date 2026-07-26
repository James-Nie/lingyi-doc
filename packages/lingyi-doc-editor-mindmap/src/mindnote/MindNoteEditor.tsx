import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { MindNoteSettings } from '@lingyi-doc/core-mindmap';
import type { MindNode } from '@lingyi-doc/core-types';
import { findMindNode, getMindNodeFontSize, getMindNodeLineHeight } from '@lingyi-doc/core-mindmap';
import { DOC_PAGE_BG } from '@lingyi-doc/editor-shared';
import { MindNoteControls } from './MindNoteControls';
import { MindNoteContextMenu, type MindNoteMenuAction } from './MindNoteContextMenu';
import { MindNoteMapView, type MindMapViewApi } from './MindNoteMapView';
import { MindNoteMapNodeToolbar } from './MindNoteMapNodeToolbar';
import type { MindNoteMapMoreAction } from './MindNoteMapMoreMenu';
import { MindNoteOutlineView, type MindNoteOutlineCommand } from './MindNoteOutlineView';
import { readImageFile } from './mindNoteImageUtils';
import { MN_COLORS, MN_EDITOR_MAX_WIDTH } from './styles';

/** 大纲根标题：外部 text 变化时同步 DOM，避免与导图切换后内容脱节 */
const OutlineRootTitle: React.FC<{
  nodeId: string;
  text: string;
  readOnly?: boolean;
  onFocus: () => void;
  onChange: (text: string) => void;
}> = ({ nodeId, text, readOnly, onFocus, onChange }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    if (el.textContent !== text) el.textContent = text;
  }, [text]);

  return (
    <div
      ref={ref}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      data-node-id={nodeId}
      onFocus={onFocus}
      onInput={e => {
        if (readOnly) return;
        onChange((e.target as HTMLElement).textContent ?? '');
      }}
      style={{
        fontSize: getMindNodeFontSize(0),
        fontWeight: 700,
        lineHeight: `${getMindNodeLineHeight(0)}px`,
        color: MN_COLORS.text,
        outline: 'none',
        marginBottom: 8,
        minHeight: getMindNodeLineHeight(0),
      }}
    >
      {text}
    </div>
  );
};

export interface MindNoteEditorProps {
  title: string;
  root: MindNode;
  settings: MindNoteSettings;
  canUndo: boolean;
  canRedo: boolean;
  onTitleChange: (title: string) => void;
  onRootChange: (root: MindNode, recordHistory?: boolean) => void;
  onSettingsChange: (settings: Partial<MindNoteSettings>) => void;
  onNodeTextChange: (id: string, text: string) => void;
  onInsertSibling: (id: string) => string | null;
  onInsertChild: (id: string) => string | null;
  onInsertParent: (id: string) => string | null;
  onDeleteNode: (id: string) => void;
  onDuplicateNode: (id: string) => string | null;
  onToggleCollapse: (id: string) => void;
  onExpandChildren: (id: string) => void;
  onNodeUpdate?: (id: string, patch: Partial<MindNode>) => void;
  onBulkNodeUpdate?: (ids: string[], patch: Partial<MindNode>) => void;
  onBulkDelete?: (ids: string[]) => void;
  onUndo: () => void;
  onRedo: () => void;
  readOnly?: boolean;
  onActiveNodeChange?: (id: string | null) => void;
}

export const MindNoteEditor: React.FC<MindNoteEditorProps> = ({
  title,
  root,
  settings,
  canUndo,
  canRedo,
  onRootChange,
  onNodeTextChange,
  onInsertSibling,
  onInsertChild,
  onInsertParent,
  onDeleteNode,
  onDuplicateNode,
  onToggleCollapse,
  onExpandChildren,
  onNodeUpdate,
  onBulkNodeUpdate,
  onBulkDelete,
  onSettingsChange,
  onUndo,
  onRedo,
  readOnly = false,
  onActiveNodeChange,
}) => {
  const [activeNodeId, setActiveNodeId] = useState<string | null>(() =>
    settings.viewMode === 'map' ? null : root.id,
  );
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [recenterKey, setRecenterKey] = useState(0);
  const canvasRef = useRef<HTMLDivElement>(null);
  const clipboardRef = useRef<string>('');
  const focusNodeRef = useRef<string | null>(null);
  const mapApiRef = useRef<MindMapViewApi | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const isMap = settings.viewMode === 'map';
  const prevViewModeRef = useRef(settings.viewMode);

  const activeNode = activeNodeId ? findMindNode(root, activeNodeId)?.node ?? null : null;

  useEffect(() => {
    onActiveNodeChange?.(activeNodeId);
  }, [activeNodeId, onActiveNodeChange]);

  useEffect(() => {
    const prev = prevViewModeRef.current;
    prevViewModeRef.current = settings.viewMode;
    if (settings.viewMode === 'map') {
      if (prev !== 'map') setActiveNodeId(null);
      return;
    }
    setActiveNodeId(id => id ?? root.id);
  }, [settings.viewMode, root.id]);

  useEffect(() => {
    if (!focusNodeRef.current) return;
    const id = focusNodeRef.current;
    focusNodeRef.current = null;
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-node-id="${id}"]`) as HTMLElement | null;
      el?.focus();
    });
  });

  const focusNode = useCallback((id: string | null) => {
    if (id) {
      focusNodeRef.current = id;
      setActiveNodeId(id);
      if (isMap) {
        requestAnimationFrame(() => mapApiRef.current?.startTextEdit(id));
      }
      return;
    }
    setActiveNodeId(null);
  }, [isMap]);

  const handleOutlineCommand = useCallback((id: string, cmd: MindNoteOutlineCommand) => {
    switch (cmd) {
      case 'sibling': {
        const newId = onInsertSibling(id);
        if (newId) focusNode(newId);
        break;
      }
      case 'child': {
        const newId = onInsertChild(id);
        if (newId) focusNode(newId);
        break;
      }
      case 'parent': {
        const newId = onInsertParent(id);
        if (newId) focusNode(newId);
        break;
      }
      case 'delete':
        if (id !== root.id) {
          onDeleteNode(id);
          focusNode(isMap ? null : root.id);
        }
        break;
      case 'duplicate': {
        const newId = onDuplicateNode(id);
        if (newId) focusNode(newId);
        break;
      }
      case 'expand':
        onExpandChildren(id);
        break;
    }
  }, [
    focusNode, isMap, onDeleteNode, onDuplicateNode, onExpandChildren,
    onInsertChild, onInsertParent, onInsertSibling, root.id,
  ]);

  const handleMenuAction = useCallback((action: MindNoteMenuAction) => {
    if (!contextMenu) return;
    const id = contextMenu.nodeId;
    switch (action) {
      case 'sibling': handleOutlineCommand(id, 'sibling'); break;
      case 'child': handleOutlineCommand(id, 'child'); break;
      case 'parent': handleOutlineCommand(id, 'parent'); break;
      case 'duplicate': handleOutlineCommand(id, 'duplicate'); break;
      case 'delete': handleOutlineCommand(id, 'delete'); break;
      case 'expand': handleOutlineCommand(id, 'expand'); break;
      case 'copy': {
        const found = findMindNode(root, id);
        if (found) clipboardRef.current = found.node.text;
        break;
      }
      case 'cut': {
        const found = findMindNode(root, id);
        if (found) {
          clipboardRef.current = found.node.text;
          if (id !== root.id) onDeleteNode(id);
        }
        break;
      }
      case 'paste':
        if (clipboardRef.current) onNodeTextChange(id, clipboardRef.current);
        break;
      default: break;
    }
  }, [contextMenu, handleOutlineCommand, onDeleteNode, onNodeTextChange, root]);

  const handleMapMoreAction = useCallback((action: MindNoteMapMoreAction) => {
    if (!activeNodeId) return;
    const id = activeNodeId;
    switch (action) {
      case 'sibling': handleOutlineCommand(id, 'sibling'); break;
      case 'child': handleOutlineCommand(id, 'child'); break;
      case 'parent': handleOutlineCommand(id, 'parent'); break;
      case 'duplicate': handleOutlineCommand(id, 'duplicate'); break;
      case 'delete': handleOutlineCommand(id, 'delete'); break;
      case 'collapse': onToggleCollapse(id); break;
      case 'enterNode': mapApiRef.current?.goTargetNode(id); break;
      case 'copy': {
        const found = findMindNode(root, id);
        if (found) clipboardRef.current = found.node.text;
        break;
      }
      case 'cut': {
        const found = findMindNode(root, id);
        if (found) {
          clipboardRef.current = found.node.text;
          if (id !== root.id) onDeleteNode(id);
        }
        break;
      }
      case 'paste':
        if (clipboardRef.current) onNodeTextChange(id, clipboardRef.current);
        break;
      default: break;
    }
  }, [activeNodeId, handleOutlineCommand, onDeleteNode, onNodeTextChange, onToggleCollapse, root]);

  const handleNodePatch = useCallback((patch: Partial<MindNode>) => {
    if (!activeNodeId || !onNodeUpdate) return;
    onNodeUpdate(activeNodeId, patch);
  }, [activeNodeId, onNodeUpdate]);

  const handleEditDescription = useCallback(() => {
    if (!activeNode) return;
    const next = window.prompt('编辑描述', activeNode.note ?? '');
    if (next === null) return;
    handleNodePatch({ note: next });
  }, [activeNode, handleNodePatch]);

  const handleAddImage = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  const handleImageSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeNodeId || !onNodeUpdate) return;
    try {
      const { src, width, height } = await readImageFile(file);
      onNodeUpdate(activeNodeId, { image: src, imageWidth: width, imageHeight: height });
    } catch {
      // 忽略无效图片
    }
  }, [activeNodeId, onNodeUpdate]);

  const handleRemoveImage = useCallback((id: string) => {
    if (!onNodeUpdate) return;
    onNodeUpdate(id, { image: undefined, imageWidth: undefined, imageHeight: undefined });
  }, [onNodeUpdate]);

  const handleBulkPatch = useCallback((ids: string[], patch: Partial<MindNode>) => {
    if (ids.length === 0) return;
    if (onBulkNodeUpdate) {
      onBulkNodeUpdate(ids, patch);
      return;
    }
    ids.forEach(id => onNodeUpdate?.(id, patch));
  }, [onBulkNodeUpdate, onNodeUpdate]);

  const handleBulkDelete = useCallback((ids: string[]) => {
    const targets = ids.filter(id => id !== root.id);
    if (targets.length === 0) return;
    if (onBulkDelete) {
      onBulkDelete(targets);
    } else {
      targets.forEach(id => onDeleteNode(id));
    }
    setActiveNodeId(prev => (prev && targets.includes(prev) ? root.id : prev));
  }, [onBulkDelete, onDeleteNode, root.id]);

  const handleComment = useCallback(() => {
    // 评论能力待后续接入
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (readOnly) return;
    const target = (e.target as HTMLElement).closest('[data-node-id]') as HTMLElement | null;
    if (!target) return;
    e.preventDefault();
    const nodeId = target.dataset.nodeId;
    if (!nodeId) return;
    setActiveNodeId(nodeId);
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (readOnly) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); onUndo(); }
      if (mod && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); onRedo(); }

      if (!isMap || !activeNodeId) return;
      const alt = e.altKey;
      if (mod && e.key === 'Enter' && !e.shiftKey && !alt) {
        e.preventDefault();
        const found = findMindNode(root, activeNodeId);
        if (found && onNodeUpdate) {
          onNodeUpdate(activeNodeId, { completed: !found.node.completed });
        }
      }
      if (e.key === 'Enter' && e.shiftKey && !mod) {
        e.preventDefault();
        handleEditDescription();
      }
      if (e.key === 'Enter' && alt && !mod) {
        e.preventDefault();
        handleAddImage();
      }
      if (mod && alt && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        handleComment();
      }
      if (mod && e.key === '.') {
        e.preventDefault();
        onToggleCollapse(activeNodeId);
      }
      if (mod && e.key === ']') {
        e.preventDefault();
        mapApiRef.current?.goTargetNode(activeNodeId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeNodeId, handleAddImage, handleComment, handleEditDescription, isMap, onNodeUpdate, onRedo, onToggleCollapse, onUndo, readOnly, root]);

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      background: isMap ? MN_COLORS.mapBg : DOC_PAGE_BG,
      overflow: 'hidden',
    }}>
      {/* 画布区域 */}
      <div
        ref={canvasRef}
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: isMap ? MN_COLORS.mapBg : DOC_PAGE_BG,
        }}
        onContextMenu={handleContextMenu}
      >
        <MindNoteControls
          embedded
          readOnly={readOnly}
          viewMode={settings.viewMode}
          structure={settings.structure}
          branchStyle={settings.branchStyle}
          zoom={settings.zoom}
          canUndo={canUndo}
          canRedo={canRedo}
          onViewModeChange={mode => {
            // 切视图前冲刷未提交编辑，保证大纲/导图数据一致
            const ae = document.activeElement as HTMLElement | null;
            if (ae?.isContentEditable) {
              const nodeId = ae.closest('[data-node-id]')?.getAttribute('data-node-id');
              if (nodeId) onNodeTextChange(nodeId, ae.textContent ?? '');
            }
            mapApiRef.current?.flushTextEdit?.();
            onSettingsChange({ viewMode: mode });
          }}
          onStructureChange={structure => onSettingsChange({ structure })}
          onBranchStyleChange={branchStyle => onSettingsChange({ branchStyle })}
          onZoomChange={zoom => onSettingsChange({ zoom })}
          onUndo={onUndo}
          onRedo={onRedo}
          onRecenter={() => setRecenterKey(k => k + 1)}
        />

        {isMap ? (
          <>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleImageSelected}
            />
            <MindNoteMapView
              key={`map-${recenterKey}`}
              root={root}
              structure={settings.structure}
              branchStyle={settings.branchStyle}
              zoom={settings.zoom}
              activeNodeId={activeNodeId}
              readOnly={readOnly}
              onSelectNode={setActiveNodeId}
              onRootChange={onRootChange}
              onZoomChange={zoom => onSettingsChange({ zoom })}
              onReady={api => { mapApiRef.current = api; }}
              onRemoveImage={readOnly ? undefined : handleRemoveImage}
              onAddImage={readOnly ? undefined : handleAddImage}
            />
            {onNodeUpdate && !readOnly && (
              <MindNoteMapNodeToolbar
                visible={!!activeNodeId}
                node={activeNode}
                onPatch={handleNodePatch}
                onMoreAction={handleMapMoreAction}
                onEditDescription={handleEditDescription}
                onAddImage={handleAddImage}
                onAddChild={() => handleMapMoreAction('child')}
                onAddSibling={() => handleMapMoreAction('sibling')}
                onComment={handleComment}
              />
            )}
          </>
        ) : (
          <div key="outline-view" style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '24px 0' }}>
            <div style={{
              maxWidth: MN_EDITOR_MAX_WIDTH + 312,
              margin: '0 auto',
              background: '#fff',
              minHeight: '100%',
              padding: '32px 48px 32px 64px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              borderRadius: 4,
            }}>
              <OutlineRootTitle
                nodeId={root.id}
                text={root.text}
                readOnly={readOnly}
                onFocus={() => setActiveNodeId(root.id)}
                onChange={text => onNodeTextChange(root.id, text)}
              />
              <MindNoteOutlineView
                root={root}
                activeNodeId={activeNodeId}
                readOnly={readOnly}
                onSelectNode={setActiveNodeId}
                onUpdateText={onNodeTextChange}
                onToggleCollapse={onToggleCollapse}
                onKeyCommand={handleOutlineCommand}
                onRemoveImage={handleRemoveImage}
                onBulkPatch={handleBulkPatch}
                onBulkDelete={handleBulkDelete}
              />
            </div>
          </div>
        )}
      </div>

      {contextMenu && !readOnly && (
        <MindNoteContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onAction={handleMenuAction}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};

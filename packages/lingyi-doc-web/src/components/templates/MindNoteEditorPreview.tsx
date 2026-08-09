import React, { useCallback, useRef, useState } from 'react';
import {
  MindNoteDocument,
  cloneMindNode,
  createEmptyMindNote,
  type MindNode,
  type MindNoteSettings,
} from '@lingyi-doc/core';
import { MindNoteEditor } from '@lingyi-doc/editor-pro';

interface MindNoteEditorPreviewProps {
  title: string;
  root: MindNode;
  settings?: MindNoteSettings;
}

/** 与 MindNoteEditorPage 使用相同的 MindNoteEditor 组件 */
export const MindNoteEditorPreview: React.FC<MindNoteEditorPreviewProps> = ({
  title: initialTitle,
  root: initialRoot,
  settings: initialSettings,
}) => {
  const docRef = useRef<MindNoteDocument | null>(null);
  if (!docRef.current) {
    const defaults = createEmptyMindNote();
    docRef.current = MindNoteDocument.fromJSON({
      documentId: '',
      title: initialTitle,
      root: initialRoot,
      settings: initialSettings ?? defaults.settings,
    });
  }

  const [title, setTitle] = useState(initialTitle);
  const [root, setRoot] = useState<MindNode>(() => cloneMindNode(initialRoot));
  const [settings, setSettings] = useState<MindNoteSettings>(() => ({ ...docRef.current!.settings }));

  const syncFromDoc = useCallback(() => {
    const doc = docRef.current!;
    setRoot(cloneMindNode(doc.root));
    setSettings({ ...doc.settings });
  }, []);

  const withHistory = useCallback((fn: () => void) => {
    fn();
    syncFromDoc();
  }, [syncFromDoc]);

  const doc = docRef.current!;

  return (
    <div style={{ height: '100%', minHeight: 360, display: 'flex', flexDirection: 'column' }}>
      <MindNoteEditor
        title={title}
        root={root}
        settings={settings}
        canUndo={doc.canUndo()}
        canRedo={doc.canRedo()}
        onTitleChange={setTitle}
        onRootChange={(next, recordHistory) => {
          doc.setRoot(next, recordHistory);
          syncFromDoc();
        }}
        onSettingsChange={partial => {
          doc.updateSettings(partial);
          syncFromDoc();
        }}
        onNodeTextChange={(id, text) => {
          doc.updateNodeText(id, text);
          syncFromDoc();
        }}
        onInsertSibling={id => {
          let newId: string | null = null;
          withHistory(() => { newId = doc.insertSibling(id); });
          return newId;
        }}
        onInsertChild={id => {
          let newId: string | null = null;
          withHistory(() => { newId = doc.insertChild(id); });
          return newId;
        }}
        onInsertParent={id => {
          let newId: string | null = null;
          withHistory(() => { newId = doc.insertParent(id); });
          return newId;
        }}
        onDeleteNode={id => withHistory(() => doc.deleteNode(id))}
        onDuplicateNode={id => {
          let newId: string | null = null;
          withHistory(() => { newId = doc.duplicateNode(id); });
          return newId;
        }}
        onToggleCollapse={id => withHistory(() => doc.toggleCollapse(id))}
        onExpandChildren={id => withHistory(() => doc.expandChildren(id))}
        onNodeUpdate={(id, patch) => withHistory(() => doc.updateNode(id, patch))}
        onBulkNodeUpdate={(ids, patch) => withHistory(() => ids.forEach(id => doc.updateNode(id, patch)))}
        onBulkDelete={ids => withHistory(() => ids.forEach(id => doc.deleteNode(id)))}
        onUndo={() => { if (doc.undo()) syncFromDoc(); }}
        onRedo={() => { if (doc.redo()) syncFromDoc(); }}
      />
    </div>
  );
};

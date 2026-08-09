import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { cloneMindNode } from '@lingyi-doc/core';
import { MindNoteEditor } from '@lingyi-doc/editor-mindmap';
import { mindNoteFromContent } from '../templateContentUtils';
import type { TemplateContentEditorHandle } from './TemplateContentEditorHandle';

export type { TemplateContentEditorHandle };

type MindNoteRoot = ReturnType<typeof cloneMindNode>;
type MindNoteSettings = ReturnType<typeof mindNoteFromContent>['settings'];
type MindNoteNodePatch = Partial<MindNoteRoot>;

interface Props {
  documentTitle: string;
  contentJson: unknown | null;
  previewMode?: boolean;
}

export const TemplateMindNoteContentEditor = forwardRef<TemplateContentEditorHandle, Props>(
  function TemplateMindNoteContentEditor({ documentTitle, contentJson, previewMode = false }, ref) {
    const docRef = useRef<ReturnType<typeof mindNoteFromContent> | null>(null);
    if (!docRef.current) {
      docRef.current = mindNoteFromContent(contentJson, documentTitle);
    }

    const [title, setTitle] = useState(documentTitle);
    const [root, setRoot] = useState<MindNoteRoot>(() => cloneMindNode(docRef.current!.root));
    const [settings, setSettings] = useState<MindNoteSettings>(() => ({ ...docRef.current!.settings }));

    useImperativeHandle(ref, () => ({
      getContentJson: (): unknown => {
        const doc = docRef.current!;
        doc.title = title;
        return doc.toJSON();
      },
    }), [title]);

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
      <div style={{
        height: 'calc(100vh - 220px)',
        minHeight: 480,
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#fff',
      }}
      >
        <MindNoteEditor
          readOnly={previewMode}
          title={title}
          root={root}
          settings={settings}
          canUndo={previewMode ? false : doc.canUndo()}
          canRedo={previewMode ? false : doc.canRedo()}
          onTitleChange={previewMode ? () => {} : setTitle}
          onRootChange={previewMode ? () => {} : (next: MindNoteRoot, recordHistory?: boolean) => {
            doc.setRoot(next, recordHistory);
            syncFromDoc();
          }}
          onSettingsChange={previewMode ? () => {} : (partial: Partial<MindNoteSettings>) => {
            doc.updateSettings(partial);
            syncFromDoc();
          }}
          onNodeTextChange={previewMode ? () => {} : (id: string, text: string) => {
            doc.updateNodeText(id, text);
            syncFromDoc();
          }}
          onInsertSibling={previewMode ? () => null : (id: string) => {
            let newId: string | null = null;
            withHistory(() => { newId = doc.insertSibling(id); });
            return newId;
          }}
          onInsertChild={previewMode ? () => null : (id: string) => {
            let newId: string | null = null;
            withHistory(() => { newId = doc.insertChild(id); });
            return newId;
          }}
          onInsertParent={previewMode ? () => null : (id: string) => {
            let newId: string | null = null;
            withHistory(() => { newId = doc.insertParent(id); });
            return newId;
          }}
          onDeleteNode={previewMode ? () => {} : (id: string) => withHistory(() => doc.deleteNode(id))}
          onDuplicateNode={previewMode ? () => null : (id: string) => {
            let newId: string | null = null;
            withHistory(() => { newId = doc.duplicateNode(id); });
            return newId;
          }}
          onToggleCollapse={previewMode ? () => {} : (id: string) => withHistory(() => doc.toggleCollapse(id))}
          onExpandChildren={previewMode ? () => {} : (id: string) => withHistory(() => doc.expandChildren(id))}
          onNodeUpdate={previewMode ? undefined : (id: string, patch: MindNoteNodePatch) => withHistory(() => doc.updateNode(id, patch))}
          onBulkNodeUpdate={previewMode ? undefined : (ids: string[], patch: MindNoteNodePatch) => withHistory(() => ids.forEach((i: string) => doc.updateNode(i, patch)))}
          onBulkDelete={previewMode ? undefined : (ids: string[]) => withHistory(() => ids.forEach((i: string) => doc.deleteNode(i)))}
          onUndo={previewMode ? () => {} : () => { if (doc.undo()) syncFromDoc(); }}
          onRedo={previewMode ? () => {} : () => { if (doc.redo()) syncFromDoc(); }}
        />
      </div>
    );
  },
);

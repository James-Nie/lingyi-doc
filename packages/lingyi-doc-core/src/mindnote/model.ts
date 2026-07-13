import type { MindNode, MindNoteJSON, MindNoteSettings } from './types';
import {
  cloneMindNode,
  createEmptyMindNote,
  normalizeMindNoteJSON,
} from './utils';
import {
  deleteMindNode,
  duplicateMindNode,
  expandMindChildren,
  insertMindChild,
  insertMindParent,
  insertMindSibling,
  remapMindmapRootForLayout,
  toggleMindCollapse,
  updateMindNode,
} from './tree';

type Snapshot = { root: MindNode; settings: MindNoteSettings };

export class MindNoteDocument {
  documentId: string;
  title: string;
  root: MindNode;
  settings: MindNoteSettings;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private maxHistory = 50;

  constructor(json?: MindNoteJSON) {
    const normalized = normalizeMindNoteJSON(json ?? createEmptyMindNote());
    this.documentId = normalized.documentId;
    this.title = normalized.title;
    this.root = normalized.root;
    this.settings = normalized.settings;
  }

  static empty(documentId = ''): MindNoteDocument {
    return new MindNoteDocument(createEmptyMindNote(documentId));
  }

  static fromJSON(json: MindNoteJSON): MindNoteDocument {
    return new MindNoteDocument(json);
  }

  toJSON(): MindNoteJSON {
    return {
      documentId: this.documentId,
      title: this.title,
      root: cloneMindNode(this.root),
      settings: { ...this.settings },
    };
  }

  private snapshot(): Snapshot {
    return {
      root: cloneMindNode(this.root),
      settings: { ...this.settings },
    };
  }

  private pushHistory(): void {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
    this.redoStack = [];
  }

  private applySnapshot(s: Snapshot): void {
    this.root = s.root;
    this.settings = s.settings;
  }

  setRoot(root: MindNode, recordHistory = true): void {
    if (recordHistory) this.pushHistory();
    this.root = root;
  }

  updateSettings(partial: Partial<MindNoteSettings>, recordHistory = false): void {
    if (recordHistory) this.pushHistory();
    const nextStructure = partial.structure;
    if (nextStructure && nextStructure !== this.settings.structure) {
      this.root = remapMindmapRootForLayout(this.root, this.settings.structure, nextStructure);
    }
    this.settings = { ...this.settings, ...partial };
  }

  updateNodeText(id: string, text: string): void {
    this.pushHistory();
    this.root = updateMindNode(this.root, id, { text });
  }

  updateNode(id: string, patch: Partial<MindNode>): void {
    this.pushHistory();
    this.root = updateMindNode(this.root, id, patch);
  }

  insertSibling(id: string): string | null {
    const { root, newId } = insertMindSibling(this.root, id);
    if (!newId) return null;
    this.pushHistory();
    this.root = root;
    return newId;
  }

  insertChild(id: string): string | null {
    const { root, newId } = insertMindChild(this.root, id);
    if (!newId) return null;
    this.pushHistory();
    this.root = root;
    return newId;
  }

  insertParent(id: string): string | null {
    const { root, newId } = insertMindParent(this.root, id);
    if (!newId) return null;
    this.pushHistory();
    this.root = root;
    return newId;
  }

  deleteNode(id: string): void {
    this.pushHistory();
    this.root = deleteMindNode(this.root, id);
  }

  duplicateNode(id: string): string | null {
    const { root, newId } = duplicateMindNode(this.root, id);
    if (!newId) return null;
    this.pushHistory();
    this.root = root;
    return newId;
  }

  toggleCollapse(id: string): void {
    this.pushHistory();
    this.root = toggleMindCollapse(this.root, id);
  }

  expandChildren(id: string): void {
    this.pushHistory();
    this.root = expandMindChildren(this.root, id);
  }

  undo(): boolean {
    if (!this.undoStack.length) return false;
    this.redoStack.push(this.snapshot());
    this.applySnapshot(this.undoStack.pop()!);
    return true;
  }

  redo(): boolean {
    if (!this.redoStack.length) return false;
    this.undoStack.push(this.snapshot());
    this.applySnapshot(this.redoStack.pop()!);
    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}

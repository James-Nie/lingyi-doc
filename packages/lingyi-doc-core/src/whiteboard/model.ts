import type { WhiteboardElement, WhiteboardJSON, WhiteboardViewport } from './types';
import {
  cloneWhiteboardElements,
  createEmptyWhiteboard,
  nextZIndex,
  normalizeWhiteboardJSON,
} from './utils';

type Snapshot = {
  elements: WhiteboardElement[];
  viewport: WhiteboardViewport;
};

export class WhiteboardDocument {
  documentId: string;
  title: string;
  viewport: WhiteboardViewport;
  elements: WhiteboardElement[];
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private maxHistory = 50;

  constructor(json?: WhiteboardJSON) {
    const normalized = normalizeWhiteboardJSON(json ?? createEmptyWhiteboard());
    this.documentId = normalized.documentId;
    this.title = normalized.title;
    this.viewport = normalized.viewport;
    this.elements = normalized.elements;
  }

  static empty(documentId = ''): WhiteboardDocument {
    return new WhiteboardDocument(createEmptyWhiteboard(documentId));
  }

  static fromJSON(json: WhiteboardJSON): WhiteboardDocument {
    return new WhiteboardDocument(json);
  }

  toJSON(): WhiteboardJSON {
    return {
      documentId: this.documentId,
      title: this.title,
      viewport: { ...this.viewport },
      elements: cloneWhiteboardElements(this.elements),
    };
  }

  private snapshot(): Snapshot {
    return {
      elements: cloneWhiteboardElements(this.elements),
      viewport: { ...this.viewport },
    };
  }

  private pushHistory(): void {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
    this.redoStack = [];
  }

  private applySnapshot(s: Snapshot): void {
    this.elements = s.elements;
    this.viewport = s.viewport;
  }

  setViewport(viewport: Partial<WhiteboardViewport>, recordHistory = false): void {
    if (recordHistory) this.pushHistory();
    this.viewport = { ...this.viewport, ...viewport };
  }

  setElements(elements: WhiteboardElement[], recordHistory = true): void {
    if (recordHistory) this.pushHistory();
    this.elements = elements;
  }

  addElement(element: WhiteboardElement, recordHistory = true): void {
    if (recordHistory) this.pushHistory();
    this.elements = [...this.elements, { ...element, zIndex: nextZIndex(this.elements) }];
  }

  updateElement(id: string, patch: Partial<WhiteboardElement>, recordHistory = true): void {
    const idx = this.elements.findIndex(e => e.id === id);
    if (idx < 0) return;
    if (recordHistory) this.pushHistory();
    this.elements = this.elements.map((e, i) =>
      i === idx ? ({ ...e, ...patch, id: e.id, type: e.type } as WhiteboardElement) : e,
    );
  }

  removeElement(id: string, recordHistory = true): void {
    if (recordHistory) this.pushHistory();
    this.elements = this.elements.filter(e => e.id !== id);
  }

  removeElements(ids: string[], recordHistory = true): void {
    if (!ids.length) return;
    if (recordHistory) this.pushHistory();
    const set = new Set(ids);
    this.elements = this.elements.filter(e => !set.has(e.id));
  }

  bringToFront(id: string): void {
    const max = nextZIndex(this.elements);
    this.updateElement(id, { zIndex: max } as Partial<WhiteboardElement>);
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

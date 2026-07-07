import type { DocBlock, RichDocumentJSON, ToolbarState, BlockAlign, ParagraphStyle, ListType } from './types';
import {
  createEmptyDocument,
  createEmptyParagraph,
  createEmptyTable,
  createEmptyMermaid,
  exportDocumentJSON,
  importDocumentJSON,
  genBlockId,
  applyParagraphStyle,
  getBlockText,
  blockToParagraphStyle,
  isTextBlock,
  isListBlock,
} from './utils';
import { normalizeOrderedListItems, textToListItems, normalizeBulletListItems } from './listOps';
import { buildOutlineTree } from './outline';

const DEFAULT_TOOLBAR: ToolbarState = {
  paragraphStyle: 'paragraph',
  fontSize: 15,
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  color: '#1F2329',
  backgroundColor: 'transparent',
  align: 'left',
  listType: null,
  isQuote: false,
  isCode: false,
  canUndo: false,
  canRedo: false,
};

/** 富文本文档模型：块数据 + 撤销重做 */
export class RichDocument {
  documentId: string;
  title: string;
  blocks: DocBlock[];
  private undoStack: DocBlock[][] = [];
  private redoStack: DocBlock[][] = [];
  private maxHistory = 50;

  constructor(documentId = '', title = '未命名文档', blocks?: DocBlock[]) {
    this.documentId = documentId;
    this.title = title;
    this.blocks = blocks ?? [createEmptyParagraph()];
  }

  static empty(documentId = ''): RichDocument {
    const json = createEmptyDocument(documentId);
    return new RichDocument(json.documentId, json.title, importDocumentJSON(json).blocks);
  }

  static fromJSON(json: RichDocumentJSON): RichDocument {
    const { documentId, title, blocks } = importDocumentJSON(json);
    return new RichDocument(documentId, title, blocks);
  }

  toJSON(): RichDocumentJSON {
    return exportDocumentJSON(this.documentId, this.title, this.blocks);
  }

  snapshot(): DocBlock[] {
    return JSON.parse(JSON.stringify(this.blocks));
  }

  private pushHistory(): void {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
    this.redoStack = [];
  }

  setBlocks(blocks: DocBlock[], recordHistory = true): void {
    if (recordHistory) this.pushHistory();
    this.blocks = blocks;
  }

  updateBlock(index: number, block: DocBlock, recordHistory = false): void {
    const next = [...this.blocks];
    next[index] = block;
    this.setBlocks(next, recordHistory);
  }

  insertBlock(index: number, block: DocBlock, recordHistory = true): void {
    const next = [...this.blocks];
    next.splice(index, 0, block);
    this.setBlocks(next, recordHistory);
  }

  removeBlock(index: number, recordHistory = true): void {
    if (this.blocks.length <= 1) return;
    const next = [...this.blocks];
    next.splice(index, 1);
    this.setBlocks(next, recordHistory);
  }

  undo(): boolean {
    if (!this.undoStack.length) return false;
    this.redoStack.push(this.snapshot());
    this.blocks = this.undoStack.pop()!;
    return true;
  }

  redo(): boolean {
    if (!this.redoStack.length) return false;
    this.undoStack.push(this.snapshot());
    this.blocks = this.redoStack.pop()!;
    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  getOutline() {
    return buildOutlineTree(this.blocks);
  }

  getToolbarState(blockIndex: number, marks?: Partial<ToolbarState>): ToolbarState {
    const block = this.blocks[blockIndex];
    if (!block) return { ...DEFAULT_TOOLBAR, canUndo: this.canUndo(), canRedo: this.canRedo() };

    const base: ToolbarState = {
      ...DEFAULT_TOOLBAR,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      ...marks,
    };

    if (isTextBlock(block)) {
      base.paragraphStyle = blockToParagraphStyle(block);
      base.align = (block.type !== 'quote' ? block.align : 'left') as BlockAlign || 'left';
      base.isQuote = block.type === 'quote';
    }
    if (isListBlock(block)) {
      base.listType = block.listType as ListType;
      base.paragraphStyle = 'paragraph';
    }
    if (block.type === 'code') base.isCode = true;
    if (block.type === 'mermaid') base.isCode = true;

    return base;
  }

  applyStyleToBlock(index: number, style: ParagraphStyle): void {
    const block = this.blocks[index];
    if (!block || block.type === 'code' || block.type === 'mermaid' || block.type === 'divider' || block.type === 'image' || block.type === 'table' || block.type === 'base') return;
    this.updateBlock(index, applyParagraphStyle(block, style), true);
  }

  toggleList(index: number, listType: ListType): void {
    const block = this.blocks[index];
    if (!block) return;

    if (isListBlock(block)) {
      if (block.listType === listType) {
        const text = getBlockText(block) || '';
        this.updateBlock(index, { type: 'paragraph', id: block.id, text, marks: [], align: 'left' }, true);
        return;
      }
      const items = listType === 'ordered'
        ? normalizeOrderedListItems(block.items)
        : listType === 'bullet'
          ? normalizeBulletListItems(block.items.map(({ numFmt: _n, ...rest }) => rest))
          : block.items.map(({ numFmt: _n, ...rest }) => rest);
      this.updateBlock(index, { ...block, listType, items }, true);
      return;
    }

    const text = getBlockText(block) || '';
    const marks = isTextBlock(block) ? block.marks : [];
    const items = textToListItems(text, marks, listType);
    this.updateBlock(index, {
      type: 'list',
      id: block.id || genBlockId(),
      listType,
      items,
    }, true);
  }

  toggleQuote(index: number): void {
    const block = this.blocks[index];
    if (!block) return;
    if (block.type === 'quote') {
      this.updateBlock(index, { type: 'paragraph', id: block.id, text: block.text, marks: block.marks }, true);
      return;
    }
    const text = getBlockText(block);
    const marks = isTextBlock(block) ? block.marks : [];
    this.updateBlock(index, { type: 'quote', id: block.id, text, marks }, true);
  }

  insertDivider(index: number): void {
    this.insertBlock(index + 1, { type: 'divider', id: genBlockId() }, true);
    this.insertBlock(index + 2, createEmptyParagraph(), false);
  }

  insertCode(index: number): void {
    this.insertBlock(index + 1, {
      type: 'code', id: genBlockId(), text: '', collapsed: false, height: 200, wordWrap: false,
    }, true);
    this.insertBlock(index + 2, createEmptyParagraph(), false);
  }

  insertMermaid(index: number, text?: string): void {
    this.insertBlock(index + 1, createEmptyMermaid(text), true);
    this.insertBlock(index + 2, createEmptyParagraph(), false);
  }

  insertTable(index: number, rows: number, cols: number): void {
    this.insertBlock(index + 1, createEmptyTable(rows, cols), true);
    this.insertBlock(index + 2, createEmptyParagraph(), false);
  }

  insertImage(index: number, url: string, width?: number, naturalWidth?: number, naturalHeight?: number): void {
    this.insertBlock(index + 1, {
      type: 'image', id: genBlockId(), url, width, align: 'left',
      naturalWidth, naturalHeight, imageStyle: 'none', rotation: 0,
    }, true);
    this.insertBlock(index + 2, createEmptyParagraph(), false);
  }
}

export { buildOutlineTree, flattenOutline, findActiveOutlineId } from './outline';

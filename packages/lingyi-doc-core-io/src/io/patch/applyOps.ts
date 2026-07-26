import type { MindNode } from '@lingyi-doc/core-mindmap';
import { cloneMindNode } from '@lingyi-doc/core-mindmap';
import { deleteMindNode, findMindNode, updateMindNode } from '@lingyi-doc/core-mindmap';
import type { DocumentPatchKind, DocumentPatchOp } from './types';

type WorkbookJson = Record<string, unknown> & {
  activeSheetId?: string;
  sheetOrder?: string[];
  sheets?: Array<{ id: string; data: Record<string, unknown> }>;
};

function findSheet(workbook: WorkbookJson, sheetId: string) {
  return (workbook.sheets || []).find(s => s.id === sheetId) ?? null;
}

function ensureSheet(workbook: WorkbookJson, sheetId: string, data?: Record<string, unknown>) {
  if (!workbook.sheets) workbook.sheets = [];
  if (!workbook.sheetOrder) workbook.sheetOrder = [];
  let sheet = findSheet(workbook, sheetId);
  if (!sheet) {
    sheet = { id: sheetId, data: data || {} };
    workbook.sheets.push(sheet);
    if (!workbook.sheetOrder.includes(sheetId)) workbook.sheetOrder.push(sheetId);
  }
  return sheet;
}

function applyWorkbookOp(workbook: WorkbookJson, op: DocumentPatchOp): void {
  switch (op.type) {
    case 'set_workbook_meta':
      if (op.patch.activeSheetId != null) workbook.activeSheetId = op.patch.activeSheetId;
      if (op.patch.sheetOrder != null) workbook.sheetOrder = op.patch.sheetOrder;
      break;
    case 'add_sheet':
      if (!findSheet(workbook, op.sheet.id)) {
        ensureSheet(workbook, op.sheet.id, op.sheet.data);
      }
      break;
    case 'remove_sheet':
      workbook.sheets = (workbook.sheets || []).filter(s => s.id !== op.sheetId);
      workbook.sheetOrder = (workbook.sheetOrder || []).filter(id => id !== op.sheetId);
      if (workbook.activeSheetId === op.sheetId) workbook.activeSheetId = workbook.sheetOrder?.[0] || '';
      break;
    case 'set_sheet_meta':
      Object.assign(ensureSheet(workbook, op.sheetId).data, op.patch);
      break;
    case 'set_cell': {
      const sheet = ensureSheet(workbook, op.sheetId);
      if (!sheet.data.cells || typeof sheet.data.cells !== 'object') sheet.data.cells = {};
      const cells = sheet.data.cells as Record<string, unknown>;
      if (op.cell == null) delete cells[op.key];
      else cells[op.key] = op.cell;
      break;
    }
    case 'set_cells': {
      const sheet = ensureSheet(workbook, op.sheetId);
      if (!sheet.data.cells || typeof sheet.data.cells !== 'object') sheet.data.cells = {};
      const cells = sheet.data.cells as Record<string, unknown>;
      for (const [key, cell] of Object.entries(op.cells)) {
        if (cell == null) delete cells[key];
        else cells[key] = cell;
      }
      break;
    }
  }
}

function getContentArray(doc: Record<string, unknown>): unknown[] {
  if (Array.isArray(doc.content)) return doc.content;
  if (Array.isArray(doc.blocks)) return doc.blocks;
  return [];
}

function setContentArray(doc: Record<string, unknown>, content: unknown[]): void {
  doc.content = content;
  delete doc.blocks;
}

function applyRichTextOp(doc: Record<string, unknown>, op: DocumentPatchOp): void {
  switch (op.type) {
    case 'set_doc_meta':
      if (op.patch.title != null) doc.title = op.patch.title;
      if ('documentId' in op.patch && op.patch.documentId != null) {
        doc.documentId = op.patch.documentId;
      }
      break;
    case 'replace_content':
      setContentArray(doc, op.content);
      break;
    case 'update_content_block': {
      const content = [...getContentArray(doc)];
      if (op.index >= 0 && op.index < content.length) {
        content[op.index] = op.block;
        setContentArray(doc, content);
      }
      break;
    }
    case 'insert_content_block': {
      const content = [...getContentArray(doc)];
      content.splice(op.index, 0, op.block);
      setContentArray(doc, content);
      break;
    }
    case 'delete_content_block': {
      const content = [...getContentArray(doc)];
      content.splice(op.index, 1);
      setContentArray(doc, content);
      break;
    }
  }
}

function getMindNoteRoot(doc: Record<string, unknown>): MindNode {
  return (doc.root ?? {}) as MindNode;
}

function setMindNoteRoot(doc: Record<string, unknown>, root: MindNode): void {
  doc.root = root;
}

function applyMindNoteOp(doc: Record<string, unknown>, op: DocumentPatchOp): void {
  switch (op.type) {
    case 'set_doc_meta':
      if (op.patch.title != null) doc.title = op.patch.title;
      if ('documentId' in op.patch && op.patch.documentId != null) {
        doc.documentId = op.patch.documentId;
      }
      break;
    case 'set_settings':
      doc.settings = op.settings;
      break;
    case 'update_node': {
      const root = updateMindNode(getMindNoteRoot(doc), op.id, op.patch);
      setMindNoteRoot(doc, root);
      break;
    }
    case 'insert_node': {
      const root = cloneMindNode(getMindNoteRoot(doc));
      const parent = findMindNode(root, op.parentId);
      if (parent) {
        parent.node.children.splice(op.index, 0, cloneMindNode(op.node as unknown as MindNode));
        setMindNoteRoot(doc, root);
      }
      break;
    }
    case 'delete_node': {
      const root = deleteMindNode(getMindNoteRoot(doc), op.id);
      setMindNoteRoot(doc, root);
      break;
    }
    case 'move_node': {
      const root = cloneMindNode(getMindNoteRoot(doc));
      const found = findMindNode(root, op.id);
      if (!found?.parent) break;
      const nodeCopy = cloneMindNode(found.node);
      found.parent.children.splice(found.index, 1);
      const newParent = findMindNode(root, op.parentId);
      if (newParent) {
        newParent.node.children.splice(op.index, 0, nodeCopy);
        setMindNoteRoot(doc, root);
      }
      break;
    }
    case 'set_root':
      doc.root = op.root;
      break;
  }
}

type WhiteboardElementJson = Record<string, unknown> & { id: string };

function getWhiteboardElements(doc: Record<string, unknown>): WhiteboardElementJson[] {
  return Array.isArray(doc.elements)
    ? (doc.elements as WhiteboardElementJson[])
    : [];
}

function setWhiteboardElements(doc: Record<string, unknown>, elements: WhiteboardElementJson[]): void {
  doc.elements = elements;
}

function applyWhiteboardOp(doc: Record<string, unknown>, op: DocumentPatchOp): void {
  switch (op.type) {
    case 'set_doc_meta':
      if (op.patch.title != null) doc.title = op.patch.title;
      if ('documentId' in op.patch && op.patch.documentId != null) {
        doc.documentId = op.patch.documentId;
      }
      break;
    case 'set_viewport':
      doc.viewport = { ...op.viewport };
      break;
    case 'add_element': {
      const elements = getWhiteboardElements(doc);
      const id = (op.element as WhiteboardElementJson).id;
      if (!elements.some(el => el.id === id)) {
        setWhiteboardElements(doc, [...elements, op.element as WhiteboardElementJson]);
      }
      break;
    }
    case 'remove_element':
      setWhiteboardElements(doc, getWhiteboardElements(doc).filter(el => el.id !== op.id));
      break;
    case 'set_element':
      setWhiteboardElements(doc, getWhiteboardElements(doc).map(el =>
        el.id === op.id ? (op.element as WhiteboardElementJson) : el,
      ));
      break;
    case 'replace_all':
      doc.viewport = { ...op.snapshot.viewport };
      doc.elements = JSON.parse(JSON.stringify(op.snapshot.elements)) as WhiteboardElementJson[];
      break;
  }
}

export function applyDocumentPatch(
  kind: DocumentPatchKind,
  content: Record<string, unknown>,
  ops: DocumentPatchOp[],
): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(content)) as Record<string, unknown>;
  for (const op of ops) {
    if (kind === 'workbook') applyWorkbookOp(next as WorkbookJson, op);
    else if (kind === 'richtext') applyRichTextOp(next, op);
    else if (kind === 'whiteboard') applyWhiteboardOp(next, op);
    else applyMindNoteOp(next, op);
  }
  return next;
}

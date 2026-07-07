export type DocumentPatchOp =
  | { type: 'set_workbook_meta'; patch: { activeSheetId?: string; sheetOrder?: string[] } }
  | { type: 'add_sheet'; sheet: { id: string; data: Record<string, unknown> } }
  | { type: 'remove_sheet'; sheetId: string }
  | { type: 'set_sheet_meta'; sheetId: string; patch: Record<string, unknown> }
  | { type: 'set_cell'; sheetId: string; key: string; cell: unknown | null }
  | { type: 'set_doc_meta'; patch: { title?: string; documentId?: string } }
  | { type: 'replace_content'; content: unknown[] }
  | { type: 'update_content_block'; index: number; block: unknown }
  | { type: 'insert_content_block'; index: number; block: unknown }
  | { type: 'delete_content_block'; index: number }
  | { type: 'replace_blocks'; blocks: unknown[] }
  | { type: 'update_block'; blockId: string; block: unknown }
  | { type: 'insert_block'; index: number; block: unknown }
  | { type: 'delete_block'; blockId: string }
  | { type: 'set_settings'; settings: Record<string, unknown> }
  | { type: 'update_node'; id: string; patch: { text?: string; completed?: boolean; collapsed?: boolean } }
  | { type: 'insert_node'; parentId: string; index: number; node: Record<string, unknown> }
  | { type: 'delete_node'; id: string }
  | { type: 'move_node'; id: string; parentId: string; index: number }
  | { type: 'set_root'; root: Record<string, unknown> }
  | { type: 'set_viewport'; viewport: { x: number; y: number; zoom: number } }
  | { type: 'add_element'; element: Record<string, unknown> }
  | { type: 'remove_element'; id: string }
  | { type: 'set_element'; id: string; element: Record<string, unknown> }
  | { type: 'replace_all'; snapshot: { viewport: { x: number; y: number; zoom: number }; elements: Record<string, unknown>[] } };

export type DocumentPatchKind = 'workbook' | 'richtext' | 'mindnote' | 'whiteboard';

export function docTypeToPatchKind(docType: string): DocumentPatchKind {
  if (docType === 'richtext') return 'richtext';
  if (docType === 'mindnote') return 'mindnote';
  if (docType === 'whiteboard') return 'whiteboard';
  return 'workbook';
}

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
      if (!findSheet(workbook, op.sheet.id)) ensureSheet(workbook, op.sheet.id, op.sheet.data);
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
      if (op.patch.documentId != null) doc.documentId = op.patch.documentId;
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
    case 'replace_blocks':
      setContentArray(doc, op.blocks);
      break;
    case 'update_block': {
      const content = [...getContentArray(doc)];
      const idx = content.findIndex(
        b => b && typeof b === 'object' && 'id' in b && (b as { id: string }).id === op.blockId,
      );
      if (idx >= 0) content[idx] = op.block;
      setContentArray(doc, content);
      break;
    }
    case 'insert_block': {
      const content = [...getContentArray(doc)];
      content.splice(op.index, 0, op.block);
      setContentArray(doc, content);
      break;
    }
    case 'delete_block': {
      const content = getContentArray(doc).filter(
        b => !(b && typeof b === 'object' && 'id' in b && (b as { id: string }).id === op.blockId),
      );
      setContentArray(doc, content);
      break;
    }
  }
}

function applyMindNoteOp(doc: Record<string, unknown>, op: DocumentPatchOp): void {
  switch (op.type) {
    case 'set_doc_meta':
      if (op.patch.title != null) doc.title = op.patch.title;
      if (op.patch.documentId != null) doc.documentId = op.patch.documentId;
      break;
    case 'set_settings':
      doc.settings = op.settings;
      break;
    case 'update_node': {
      const root = updateMindNodeInDoc(getMindNoteRoot(doc), op.id, op.patch);
      setMindNoteRoot(doc, root);
      break;
    }
    case 'insert_node': {
      const root = cloneMindNodeJson(getMindNoteRoot(doc));
      const parent = findMindNodeInDoc(root, op.parentId);
      if (parent) {
        if (!parent.children) parent.children = [];
        parent.children.splice(op.index, 0, cloneMindNodeJson(op.node));
        setMindNoteRoot(doc, root);
      }
      break;
    }
    case 'delete_node': {
      const root = deleteMindNodeInDoc(getMindNoteRoot(doc), op.id);
      setMindNoteRoot(doc, root);
      break;
    }
    case 'move_node': {
      const root = cloneMindNodeJson(getMindNoteRoot(doc));
      const found = findMindNodePath(root, op.id);
      if (!found?.parent) break;
      const nodeCopy = cloneMindNodeJson(found.node);
      if (!found.parent.children) found.parent.children = [];
      found.parent.children.splice(found.index, 1);
      const newParent = findMindNodeInDoc(root, op.parentId);
      if (newParent) {
        if (!newParent.children) newParent.children = [];
        newParent.children.splice(op.index, 0, nodeCopy);
        setMindNoteRoot(doc, root);
      }
      break;
    }
    case 'set_root':
      doc.root = op.root;
      break;
  }
}

type MindNodeJson = Record<string, unknown> & {
  id: string;
  text?: string;
  completed?: boolean;
  collapsed?: boolean;
  children?: MindNodeJson[];
};

function getMindNoteRoot(doc: Record<string, unknown>): MindNodeJson {
  return (doc.root ?? {}) as MindNodeJson;
}

function setMindNoteRoot(doc: Record<string, unknown>, root: MindNodeJson): void {
  doc.root = root;
}

function cloneMindNodeJson(node: Record<string, unknown>): MindNodeJson {
  return JSON.parse(JSON.stringify(node)) as MindNodeJson;
}

function findMindNodeInDoc(root: MindNodeJson, id: string): MindNodeJson | null {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findMindNodeInDoc(child, id);
    if (found) return found;
  }
  return null;
}

function findMindNodePath(
  root: MindNodeJson,
  id: string,
  parent: MindNodeJson | null = null,
  index = 0,
): { node: MindNodeJson; parent: MindNodeJson; index: number } | null {
  if (root.id === id) {
    return parent ? { node: root, parent, index } : null;
  }
  for (let i = 0; i < (root.children ?? []).length; i++) {
    const child = root.children![i];
    if (child.id === id) return { node: child, parent: root, index: i };
    const found = findMindNodePath(child, id, root, i);
    if (found) return found;
  }
  return null;
}

function updateMindNodeInDoc(
  root: MindNodeJson,
  id: string,
  patch: { text?: string; completed?: boolean; collapsed?: boolean },
): MindNodeJson {
  const clone = cloneMindNodeJson(root);
  const target = findMindNodeInDoc(clone, id);
  if (target) Object.assign(target, patch);
  return clone;
}

function deleteMindNodeInDoc(root: MindNodeJson, targetId: string): MindNodeJson {
  const clone = cloneMindNodeJson(root);
  const found = findMindNodePath(clone, targetId);
  if (!found?.parent) return clone;
  const removed = found.parent.children!.splice(found.index, 1)[0];
  if (removed?.children?.length) {
    found.parent.children!.splice(found.index, 0, ...removed.children);
  }
  return clone;
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
      if (op.patch.documentId != null) doc.documentId = op.patch.documentId;
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

import {
  cloneMindNode,
  duplicateMindNode,
  findMindNode,
  moveMindSibling,
  updateMindNode,
  type MindNode,
} from '@lingyi-doc/core-mindmap';
import { applyMindmapAction, type MindmapNodeAction } from '@lingyi-doc/mind-map';
import {
  blobToMindmapImage,
  copyMindmapImageToClipboard,
  getMindmapImageClipboard,
  hasMindmapImageClipboard,
  readImageFromSystemClipboard,
} from '../mindmapImageClipboard';
import {
  copyMindmapNodeStyle,
  getMindmapNodeClipboard,
  getMindmapStyleClipboard,
  hasMindmapNodeClipboard,
  hasMindmapStyleClipboard,
  setMindmapNodeClipboard,
} from './clipboardState';
import type { MindmapContextMenuContext } from './types';

export interface MindmapContextMenuActionHandlers {
  dispatchNodeAction: (action: MindmapNodeAction, nodeId: string) => void;
  onRootChange: (root: MindNode, recordHistory?: boolean) => void;
  onSelectNode?: (id: string | null) => void;
  clearNodeImage?: (nodeId: string) => void;
  setSelectedImageNodeId?: (id: string | null) => void;
  copyNodeAsImage?: (nodeId: string) => Promise<boolean>;
}

export function buildContextMenuRuntimeFlags(): {
  canPaste: boolean;
  canPasteStyle: boolean;
} {
  return {
    canPaste: hasMindmapNodeClipboard() || hasMindmapImageClipboard(),
    canPasteStyle: hasMindmapStyleClipboard(),
  };
}

function genId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function reassignIdsDeep(node: MindNode): MindNode {
  return {
    ...node,
    id: genId(),
    children: node.children.map(reassignIdsDeep),
  };
}

function pasteAsSibling(root: MindNode, targetId: string, payload: MindNode): { root: MindNode; newId: string | null } {
  const copy = reassignIdsDeep(cloneMindNode(payload));
  const found = findMindNode(root, targetId);
  if (!found) return { root, newId: null };
  const next = cloneMindNode(root);
  if (!found.parent) {
    const r = findMindNode(next, targetId);
    if (!r) return { root, newId: null };
    r.node.children.unshift(copy);
    return { root: next, newId: copy.id };
  }
  const parent = findMindNode(next, found.parent.id);
  if (!parent) return { root, newId: null };
  parent.node.children.splice(found.index + 1, 0, copy);
  return { root: next, newId: copy.id };
}

/** 内置右键动作执行（插件未自行 execute 时由宿主调用） */
export async function executeBuiltinContextMenuAction(
  actionId: string,
  ctx: MindmapContextMenuContext,
  handlers: MindmapContextMenuActionHandlers,
): Promise<boolean> {
  const { nodeId, node, target } = ctx;
  if (!nodeId || !node) return false;

  if (
    node.locked
    && actionId !== 'lock'
    && actionId !== 'copy'
    && actionId !== 'copyImage'
    && actionId !== 'copyStyle'
  ) {
    return true;
  }

  switch (actionId) {
    case 'sibling':
      handlers.dispatchNodeAction('sibling', nodeId);
      return true;
    case 'child':
      handlers.dispatchNodeAction('child', nodeId);
      return true;
    case 'parent':
      handlers.dispatchNodeAction('parent', nodeId);
      return true;
    case 'copy': {
      if (target === 'nodeImage' && node.image) {
        await copyMindmapImageToClipboard({
          src: node.image,
          width: node.imageWidth,
          height: node.imageHeight,
          imageFlipH: node.imageFlipH,
          imageFlipV: node.imageFlipV,
        });
      } else {
        setMindmapNodeClipboard(cloneMindNode(node));
        try {
          await navigator.clipboard?.writeText?.(node.text ?? '');
        } catch {
          // ignore
        }
      }
      return true;
    }
    case 'copyImage': {
      if (node.image) {
        await copyMindmapImageToClipboard({
          src: node.image,
          width: node.imageWidth,
          height: node.imageHeight,
          imageFlipH: node.imageFlipH,
          imageFlipV: node.imageFlipV,
        });
        return true;
      }
      if (handlers.copyNodeAsImage) {
        return handlers.copyNodeAsImage(nodeId);
      }
      return true;
    }
    case 'paste': {
      if (target === 'nodeImage') {
        const memory = getMindmapImageClipboard();
        if (memory) {
          handlers.onRootChange(updateMindNode(ctx.root, nodeId, {
            image: memory.src,
            imageWidth: memory.width,
            imageHeight: memory.height,
            imageFlipH: memory.imageFlipH,
            imageFlipV: memory.imageFlipV,
          }), true);
          return true;
        }
        const blob = await readImageFromSystemClipboard();
        if (blob) {
          try {
            const img = await blobToMindmapImage(blob);
            handlers.onRootChange(updateMindNode(ctx.root, nodeId, {
              image: img.src,
              imageWidth: img.width,
              imageHeight: img.height,
              imageFlipH: undefined,
              imageFlipV: undefined,
            }), true);
          } catch {
            // ignore
          }
        }
        return true;
      }
      const clip = getMindmapNodeClipboard();
      if (clip) {
        const res = pasteAsSibling(ctx.root, nodeId, clip);
        if (res.newId) {
          handlers.onRootChange(res.root, true);
          handlers.onSelectNode?.(res.newId);
        }
        return true;
      }
      const imgMem = getMindmapImageClipboard();
      if (imgMem) {
        handlers.onRootChange(updateMindNode(ctx.root, nodeId, {
          image: imgMem.src,
          imageWidth: imgMem.width,
          imageHeight: imgMem.height,
          imageFlipH: imgMem.imageFlipH,
          imageFlipV: imgMem.imageFlipV,
        }), true);
      }
      return true;
    }
    case 'duplicate': {
      const res = duplicateMindNode(ctx.root, nodeId);
      if (res.newId) {
        handlers.onRootChange(res.root, true);
        handlers.onSelectNode?.(res.newId);
        if (target === 'nodeImage') handlers.setSelectedImageNodeId?.(res.newId);
      }
      return true;
    }
    case 'layer.front':
      handlers.onRootChange(moveMindSibling(ctx.root, nodeId, 'front'), true);
      return true;
    case 'layer.forward':
      handlers.onRootChange(moveMindSibling(ctx.root, nodeId, 'forward'), true);
      return true;
    case 'layer.backward':
      handlers.onRootChange(moveMindSibling(ctx.root, nodeId, 'backward'), true);
      return true;
    case 'layer.back':
      handlers.onRootChange(moveMindSibling(ctx.root, nodeId, 'back'), true);
      return true;
    case 'copyStyle':
      copyMindmapNodeStyle(node);
      return true;
    case 'pasteStyle': {
      const style = getMindmapStyleClipboard();
      if (style) handlers.onRootChange(updateMindNode(ctx.root, nodeId, style), true);
      return true;
    }
    case 'lock':
      handlers.onRootChange(updateMindNode(ctx.root, nodeId, { locked: !node.locked }), true);
      return true;
    case 'delete': {
      if (nodeId === ctx.root.id) return true;
      const res = applyMindmapAction(ctx.root, nodeId, 'delete');
      if (res) {
        handlers.onRootChange(res.root, true);
        if (res.nextActiveId) handlers.onSelectNode?.(res.nextActiveId);
      }
      return true;
    }
    case 'flipH':
      handlers.onRootChange(updateMindNode(ctx.root, nodeId, { imageFlipH: !node.imageFlipH }), true);
      return true;
    case 'flipV':
      handlers.onRootChange(updateMindNode(ctx.root, nodeId, { imageFlipV: !node.imageFlipV }), true);
      return true;
    case 'deleteImage':
      handlers.clearNodeImage?.(nodeId);
      return true;
    default:
      return false;
  }
}

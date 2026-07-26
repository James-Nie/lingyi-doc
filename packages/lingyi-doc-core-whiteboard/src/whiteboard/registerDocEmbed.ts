import { embeddedBlockRegistry } from '@lingyi-doc/core-types';
import { createFlowchartWhiteboard, createMindmapBoardWhiteboard } from './presets';
import { createEmptyWhiteboard, normalizeWhiteboardJSON } from './utils';
import { hasMindNodeFactory, hasTreeLayoutEngine } from '@lingyi-doc/core-types';
import type { WhiteboardJSON } from './types';

/**
 * 将白板实现注册到文档嵌入块注册表。
 * 由 whiteboard/index 侧载入，保证 import 白板入口后工厂可用。
 */
export function registerWhiteboardEmbeddedBlocks(): void {
  if (embeddedBlockRegistry.has('whiteboard')) return;

  embeddedBlockRegistry.register('whiteboard', {
    create(variant) {
      switch (variant) {
        case 'flowchart':
          return createFlowchartWhiteboard('流程图');
        case 'mindmap':
          if (!hasTreeLayoutEngine('mindmap') || !hasMindNodeFactory()) {
            return createEmptyWhiteboard('', '思维导图');
          }
          return createMindmapBoardWhiteboard('思维导图');
        case 'empty':
        default:
          return createEmptyWhiteboard('', '画板');
      }
    },
    normalize(raw) {
      if (!raw || typeof raw !== 'object') {
        return createEmptyWhiteboard('', '画板');
      }
      return normalizeWhiteboardJSON(raw as WhiteboardJSON);
    },
  });
}

registerWhiteboardEmbeddedBlocks();

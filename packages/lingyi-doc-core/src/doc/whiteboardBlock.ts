import type { WhiteboardJSON } from '../whiteboard/types';
import { createFlowchartWhiteboard, createMindmapBoardWhiteboard } from '../whiteboard/presets';
import { createEmptyWhiteboard, normalizeWhiteboardJSON } from '../whiteboard/utils';
import type { WhiteboardBlock } from './types';
import { genBlockId } from './utils';

function createWhiteboardBlock(title: string, json: WhiteboardJSON): WhiteboardBlock {
  return {
    type: 'whiteboard',
    id: genBlockId(),
    title,
    whiteboardData: json,
  };
}

/** 创建文档内嵌画板块 */
export function createEmptyWhiteboardBlock(): WhiteboardBlock {
  return createWhiteboardBlock('画板', createEmptyWhiteboard('', '画板'));
}

/** 创建文档内嵌流程图块（默认流程模板） */
export function createFlowchartWhiteboardBlock(): WhiteboardBlock {
  return createWhiteboardBlock('流程图', createFlowchartWhiteboard('流程图'));
}

/** 创建文档内嵌思维导图块（仅含一个主节点） */
export function createMindmapWhiteboardBlock(): WhiteboardBlock {
  return createWhiteboardBlock('思维导图', createMindmapBoardWhiteboard('思维导图'));
}

export function normalizeWhiteboardBlockData(raw: unknown): WhiteboardJSON {
  if (!raw || typeof raw !== 'object') {
    return createEmptyWhiteboard('', '画板');
  }
  return normalizeWhiteboardJSON(raw as WhiteboardJSON);
}

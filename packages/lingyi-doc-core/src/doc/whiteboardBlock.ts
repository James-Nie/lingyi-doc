import type { WhiteboardJSON } from '../whiteboard/types';
import { createEmptyWhiteboard, normalizeWhiteboardJSON } from '../whiteboard/utils';
import type { WhiteboardBlock } from './types';
import { genBlockId } from './utils';

/** 创建文档内嵌画板块 */
export function createEmptyWhiteboardBlock(): WhiteboardBlock {
  const json = createEmptyWhiteboard('', '画板');
  return {
    type: 'whiteboard',
    id: genBlockId(),
    title: '画板',
    whiteboardData: json,
  };
}

export function normalizeWhiteboardBlockData(raw: unknown): WhiteboardJSON {
  if (!raw || typeof raw !== 'object') {
    return createEmptyWhiteboard('', '画板');
  }
  return normalizeWhiteboardJSON(raw as WhiteboardJSON);
}

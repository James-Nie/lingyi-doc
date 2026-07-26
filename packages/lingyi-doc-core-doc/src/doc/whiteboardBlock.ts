import type { WhiteboardBlock, EmbeddedWhiteboardData } from './types';
import { genBlockId } from './utils';
import { embeddedBlockRegistry, type EmbeddedBlockVariant } from '@lingyi-doc/core-types';

function createWhiteboardBlock(title: string, json: unknown): WhiteboardBlock {
  return {
    type: 'whiteboard',
    id: genBlockId(),
    title,
    whiteboardData: json as EmbeddedWhiteboardData,
  };
}

function createViaRegistry(variant: EmbeddedBlockVariant, title: string): WhiteboardBlock {
  return createWhiteboardBlock(title, embeddedBlockRegistry.create('whiteboard', variant));
}

/** 创建文档内嵌画板块 */
export function createEmptyWhiteboardBlock(): WhiteboardBlock {
  return createViaRegistry('empty', '画板');
}

/** 创建文档内嵌流程图块（默认流程模板） */
export function createFlowchartWhiteboardBlock(): WhiteboardBlock {
  return createViaRegistry('flowchart', '流程图');
}

/** 创建文档内嵌思维导图块（仅含一个主节点） */
export function createMindmapWhiteboardBlock(): WhiteboardBlock {
  return createViaRegistry('mindmap', '思维导图');
}

export function normalizeWhiteboardBlockData(raw: unknown): EmbeddedWhiteboardData {
  return embeddedBlockRegistry.normalize('whiteboard', raw) as EmbeddedWhiteboardData;
}

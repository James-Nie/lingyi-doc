import { registerEditorEmbed } from '@lingyi-doc/editor-shared';
import { DocBaseBlock } from './DocBaseBlock';
import { DocWhiteboardBlock } from './DocWhiteboardBlock';
import { WhiteboardEmbedPreview } from '@lingyi-doc/editor-whiteboard';

/** 将文档内嵌块 / 预览实现注册到共享注册表（side-effect） */
export function registerDocEmbeds(): void {
  registerEditorEmbed('base', DocBaseBlock);
  registerEditorEmbed('whiteboard', DocWhiteboardBlock);
  registerEditorEmbed('whiteboard-preview', WhiteboardEmbedPreview);
}

registerDocEmbeds();

import type { ComponentType } from 'react';

/** 富文本文档内嵌块 / 预览渲染器，由 sheet/whiteboard 侧注册 */
export type EditorEmbedKind = 'base' | 'whiteboard' | 'whiteboard-preview';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EditorEmbedComponent = ComponentType<any>;

const embeds = new Map<EditorEmbedKind, EditorEmbedComponent>();

export function registerEditorEmbed(kind: EditorEmbedKind, component: EditorEmbedComponent): void {
  embeds.set(kind, component);
}

export function getEditorEmbed(kind: EditorEmbedKind): EditorEmbedComponent | undefined {
  return embeds.get(kind);
}

export function hasEditorEmbed(kind: EditorEmbedKind): boolean {
  return embeds.has(kind);
}

export function listEditorEmbeds(): EditorEmbedKind[] {
  return Array.from(embeds.keys());
}

import type { MindmapContextMenuPlugin } from '../types';

/** 节点图片翻转与删除 */
export const imageTransformContextMenuPlugin: MindmapContextMenuPlugin = {
  id: 'builtin.imageTransform',
  order: 45,
  targets: ['nodeImage'],
  contribute: () => [
    { id: 'flipH', label: '水平翻转', shortcut: 'Shift + H' },
    { id: 'flipV', label: '垂直翻转', shortcut: 'Shift + V' },
  ],
};

export const imageDeleteContextMenuPlugin: MindmapContextMenuPlugin = {
  id: 'builtin.imageDelete',
  order: 60,
  targets: ['nodeImage'],
  contribute: () => [
    { id: 'deleteImage', label: '删除', shortcut: '⌫', danger: true },
  ],
};

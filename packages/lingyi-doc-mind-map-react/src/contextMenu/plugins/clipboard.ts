import type { MindmapContextMenuPlugin } from '../types';

const MOD = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl';

/** 复制 / 粘贴 / 创建副本（节点与节点图片共用） */
export const clipboardContextMenuPlugin: MindmapContextMenuPlugin = {
  id: 'builtin.clipboard',
  order: 20,
  targets: ['node', 'nodeImage'],
  contribute: ctx => [
    { id: 'copy', label: '复制', shortcut: `${MOD} + C` },
    { id: 'copyImage', label: '复制为图片', shortcut: `${MOD} + Shift + C` },
    { id: 'paste', label: '粘贴', shortcut: `${MOD} + V`, disabled: !ctx.canPaste },
    { id: 'duplicate', label: '创建副本', shortcut: `${MOD} + D` },
  ],
};

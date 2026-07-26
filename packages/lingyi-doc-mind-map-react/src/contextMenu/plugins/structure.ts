import type { MindmapContextMenuPlugin } from '../types';

const MOD = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl';

/** 添加同级 / 子 / 父节点 */
export const structureContextMenuPlugin: MindmapContextMenuPlugin = {
  id: 'builtin.structure',
  order: 10,
  targets: ['node'],
  contribute: () => [
    { id: 'sibling', label: '添加同级节点', shortcut: 'Enter' },
    { id: 'child', label: '添加子节点', shortcut: 'Tab' },
    { id: 'parent', label: '添加父节点', shortcut: 'Shift + Tab' },
  ],
};

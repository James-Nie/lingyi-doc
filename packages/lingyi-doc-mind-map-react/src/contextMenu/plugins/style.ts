import type { MindmapContextMenuPlugin } from '../types';

const MOD = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl';
const ALT = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌥' : 'Alt';

/** 复制 / 粘贴样式 */
export const styleContextMenuPlugin: MindmapContextMenuPlugin = {
  id: 'builtin.style',
  order: 40,
  targets: ['node'],
  contribute: ctx => [
    { id: 'copyStyle', label: '复制样式', shortcut: `${MOD} + ${ALT} + C` },
    {
      id: 'pasteStyle',
      label: '粘贴样式',
      shortcut: `${MOD} + ${ALT} + V`,
      disabled: !ctx.canPasteStyle,
    },
  ],
};

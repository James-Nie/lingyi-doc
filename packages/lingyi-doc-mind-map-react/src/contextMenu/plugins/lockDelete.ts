import type { MindmapContextMenuPlugin } from '../types';

const MOD = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl';
const ALT = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌥' : 'Alt';

/** 锁定 / 删除 */
export const lockDeleteContextMenuPlugin: MindmapContextMenuPlugin = {
  id: 'builtin.lockDelete',
  order: 50,
  targets: ['node'],
  contribute: ctx => [
    {
      id: 'lock',
      label: ctx.node?.locked ? '解锁' : '锁定',
      shortcut: `${MOD} + ${ALT} + L`,
    },
    {
      id: 'delete',
      label: '删除',
      shortcut: '⌫',
      danger: true,
      disabled: ctx.nodeId === ctx.root.id || !!ctx.node?.locked,
    },
  ],
};

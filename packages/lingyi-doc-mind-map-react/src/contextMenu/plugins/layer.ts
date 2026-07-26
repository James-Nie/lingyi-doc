import type { MindmapContextMenuPlugin } from '../types';

/** 同级节点层级调整 */
export const layerContextMenuPlugin: MindmapContextMenuPlugin = {
  id: 'builtin.layer',
  order: 30,
  targets: ['node'],
  contribute: () => [
    {
      id: 'layer',
      label: '层级',
      children: [
        { id: 'layer.front', label: '置于顶层' },
        { id: 'layer.forward', label: '上移一层' },
        { id: 'layer.backward', label: '下移一层' },
        { id: 'layer.back', label: '置于底层' },
      ],
    },
  ],
};

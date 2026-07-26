import type { MindmapContextMenuPlugin } from './types';
import { clipboardContextMenuPlugin } from './plugins/clipboard';
import { imageDeleteContextMenuPlugin, imageTransformContextMenuPlugin } from './plugins/imageTransform';
import { layerContextMenuPlugin } from './plugins/layer';
import { lockDeleteContextMenuPlugin } from './plugins/lockDelete';
import { structureContextMenuPlugin } from './plugins/structure';
import { styleContextMenuPlugin } from './plugins/style';

/** 导图默认右键插件（可整体替换或按 id 卸载） */
export const DEFAULT_MINDMAP_CONTEXT_MENU_PLUGINS: MindmapContextMenuPlugin[] = [
  structureContextMenuPlugin,
  clipboardContextMenuPlugin,
  layerContextMenuPlugin,
  styleContextMenuPlugin,
  lockDeleteContextMenuPlugin,
  imageTransformContextMenuPlugin,
  imageDeleteContextMenuPlugin,
];

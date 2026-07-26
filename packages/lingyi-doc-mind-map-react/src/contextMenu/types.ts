import type { MindNode } from '@lingyi-doc/core-mindmap';

/** 右键命中目标 */
export type MindmapContextTarget = 'node' | 'nodeImage' | 'canvas';

/** 菜单上下文（插件贡献 / 执行时共用） */
export interface MindmapContextMenuContext {
  target: MindmapContextTarget;
  nodeId: string | null;
  node: MindNode | null;
  root: MindNode;
  readOnly: boolean;
  canPaste: boolean;
  canPasteStyle: boolean;
  /** 宿主可挂载扩展数据 */
  extras?: Record<string, unknown>;
}

export interface MindmapContextMenuItemDef {
  type?: 'item';
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  /** 子菜单 */
  children?: MindmapContextMenuEntry[];
}

export interface MindmapContextMenuSeparatorDef {
  type: 'separator';
  id?: string;
}

export type MindmapContextMenuEntry =
  | MindmapContextMenuItemDef
  | MindmapContextMenuSeparatorDef;

export interface MindmapContextMenuPlugin {
  /** 唯一 id，用于替换 / 卸载 */
  id: string;
  /** 越小越靠前；同序按注册顺序 */
  order?: number;
  /** 生效目标；省略则全部目标 */
  targets?: MindmapContextTarget[];
  /** 贡献菜单项（可返回空数组表示本轮不展示） */
  contribute: (ctx: MindmapContextMenuContext) => MindmapContextMenuEntry[];
  /**
   * 执行动作。返回 true 表示已处理。
   * 未实现时由宿主默认处理器兜底。
   */
  execute?: (
    actionId: string,
    ctx: MindmapContextMenuContext,
  ) => boolean | void | Promise<boolean | void>;
}

export interface MindmapContextMenuRegistry {
  register: (plugin: MindmapContextMenuPlugin) => () => void;
  unregister: (pluginId: string) => void;
  list: () => readonly MindmapContextMenuPlugin[];
  resolve: (ctx: MindmapContextMenuContext) => MindmapContextMenuEntry[];
  execute: (
    actionId: string,
    ctx: MindmapContextMenuContext,
  ) => Promise<boolean>;
}

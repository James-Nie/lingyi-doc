import type { CreateDocType } from '../components/CreateDocMenu';

/** 与后端 MembershipModuleKey 对齐 */
export type MembershipModuleKey =
  | 'mod.doc'
  | 'mod.sheet'
  | 'mod.whiteboard'
  | 'mod.mindmap'
  | 'mod.form'
  | 'mod.knowledge'
  | 'mod.collab'
  | 'mod.ai'
  | 'mod.mcp'
  | 'mod.enterprise';

const CREATE_TYPE_TO_MODULE: Record<CreateDocType, MembershipModuleKey> = {
  richtext: 'mod.doc',
  slides: 'mod.doc',
  freeform: 'mod.sheet',
  base: 'mod.sheet',
  whiteboard: 'mod.whiteboard',
  flowchart: 'mod.whiteboard',
  mindnote: 'mod.mindmap',
  mindmap: 'mod.mindmap',
  questionnaire: 'mod.form',
};

/** CreateDocMenu 菜单项 key → 模块 */
export const CREATE_MENU_KEY_TO_MODULE: Record<string, MembershipModuleKey> = {
  doc: 'mod.doc',
  sheet: 'mod.sheet',
  slides: 'mod.doc',
  base: 'mod.sheet',
  form: 'mod.form',
  mind: 'mod.mindmap',
  whiteboard: 'mod.whiteboard',
  mindmap: 'mod.mindmap',
  flow: 'mod.whiteboard',
};

export function moduleForCreateDocType(type: CreateDocType): MembershipModuleKey {
  return CREATE_TYPE_TO_MODULE[type];
}

export function isModuleEnabled(
  modules: Record<string, boolean> | null | undefined,
  key: MembershipModuleKey,
): boolean {
  // 未拉到 summary 时默认全开，避免闪烁隐藏
  if (!modules) return true;
  return modules[key] !== false;
}

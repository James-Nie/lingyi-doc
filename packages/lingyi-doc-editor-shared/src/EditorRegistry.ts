import type { ComponentType } from 'react';

/** 与后端 MembershipModuleKey / web membershipModules 对齐 */
export type MembershipModuleKey =
  | 'mod.doc'
  | 'mod.sheet'
  | 'mod.mindmap'
  | 'mod.whiteboard'
  | 'mod.form'
  | 'mod.knowledge'
  | 'mod.collab'
  | 'mod.mcp'
  | 'mod.ai'
  | 'mod.enterprise';

/** 编辑器能力键；与 membership modules / docType 对齐 */
export type EditorCapabilityKey =
  | 'richtext'
  | 'mindnote'
  | 'whiteboard'
  | 'freeform'
  | 'base'
  | 'form';

export type EditorLoader = () => Promise<{ default: ComponentType<Record<string, unknown>> }>;

const loaders = new Map<EditorCapabilityKey, EditorLoader>();

const DOC_TYPE_TO_CAPABILITY: Record<string, EditorCapabilityKey> = {
  richtext: 'richtext',
  mindnote: 'mindnote',
  whiteboard: 'whiteboard',
  freeform: 'freeform',
  base: 'base',
  questionnaire: 'form',
};

const MODULE_TO_CAPABILITIES: Partial<Record<MembershipModuleKey, EditorCapabilityKey[]>> = {
  'mod.doc': ['richtext'],
  'mod.mindmap': ['mindnote'],
  'mod.whiteboard': ['whiteboard'],
  'mod.sheet': ['freeform', 'base'],
  'mod.form': ['form'],
};

export function registerEditor(key: EditorCapabilityKey, loader: EditorLoader): void {
  loaders.set(key, loader);
}

export function getEditorLoader(key: EditorCapabilityKey): EditorLoader | undefined {
  return loaders.get(key);
}

export function requireEditorLoader(key: EditorCapabilityKey): EditorLoader {
  const loader = loaders.get(key);
  if (!loader) {
    throw new Error(`[EditorRegistry] 未注册编辑器: ${key}`);
  }
  return loader;
}

export function listRegisteredEditors(): EditorCapabilityKey[] {
  return Array.from(loaders.keys());
}

export function resolveEditorCapability(docType: string): EditorCapabilityKey {
  return DOC_TYPE_TO_CAPABILITY[docType] ?? 'freeform';
}

/** 按 membership.modules 过滤已注册编辑器（未配置 modules 时不过滤） */
export function filterEditorsByModules(
  modules: Partial<Record<MembershipModuleKey, boolean>> | null | undefined,
): EditorCapabilityKey[] {
  const registered = listRegisteredEditors();
  if (!modules) return registered;
  const allowed = new Set<EditorCapabilityKey>();
  for (const [mod, on] of Object.entries(modules)) {
    if (!on) continue;
    const caps = MODULE_TO_CAPABILITIES[mod as MembershipModuleKey];
    caps?.forEach(c => allowed.add(c));
  }
  return registered.filter(k => allowed.has(k));
}

export function isEditorCapabilityAllowed(
  key: EditorCapabilityKey,
  modules: Partial<Record<MembershipModuleKey, boolean>> | null | undefined,
): boolean {
  if (!modules) return true;
  for (const [mod, caps] of Object.entries(MODULE_TO_CAPABILITIES)) {
    if (caps?.includes(key)) {
      return modules[mod as MembershipModuleKey] !== false;
    }
  }
  return true;
}

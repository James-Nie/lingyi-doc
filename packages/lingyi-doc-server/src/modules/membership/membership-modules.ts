import type { MembershipModuleKey } from '../../types/membership';

/** 全部产品模块（授权 / 开源分层共用 ID） */
export const ALL_MEMBERSHIP_MODULES: readonly MembershipModuleKey[] = [
  'mod.doc',
  'mod.sheet',
  'mod.whiteboard',
  'mod.mindmap',
  'mod.form',
  'mod.knowledge',
  'mod.collab',
  'mod.ai',
  'mod.mcp',
  'mod.enterprise',
] as const;

/**
 * Community Edition 静态清单（与 SaaS Entitlement 并存、互不污染）。
 * 不含 AI / MCP / 企业安全等商业差异化能力。
 */
export const COMMUNITY_MODULES: readonly MembershipModuleKey[] = [
  'mod.doc',
  'mod.sheet',
  'mod.whiteboard',
  'mod.mindmap',
  'mod.form',
  'mod.knowledge',
  'mod.collab',
] as const;

export type DeployEdition = 'saas' | 'community';

export const MODULE_LABELS: Record<MembershipModuleKey, string> = {
  'mod.doc': '富文本文档',
  'mod.sheet': '表格/多维表',
  'mod.whiteboard': '白板',
  'mod.mindmap': '思维导图/思维笔记',
  'mod.form': '表单/问卷',
  'mod.knowledge': '知识库',
  'mod.collab': '实时协作',
  'mod.ai': 'AI 能力',
  'mod.mcp': 'MCP 接入',
  'mod.enterprise': '企业安全',
};

/**
 * 文档类型 → 产品模块。
 * 未知类型默认归入 mod.doc，避免误拦；新增 doc_type 时需同步此处。
 */
const DOC_TYPE_TO_MODULE: Record<string, MembershipModuleKey> = {
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

export function moduleForDocType(docType: string): MembershipModuleKey {
  return DOC_TYPE_TO_MODULE[docType] ?? 'mod.doc';
}

export function isMembershipModuleKey(value: string): value is MembershipModuleKey {
  return (ALL_MEMBERSHIP_MODULES as readonly string[]).includes(value);
}

/**
 * 解析 ENABLED_MODULES 配置。
 * - 空 / 未配置 / `*`：返回 null（表示不收窄，使用默认全开）
 * - 逗号分隔模块 ID：返回合法集合
 */
export function parseEnabledModulesConfig(raw: string | undefined | null): MembershipModuleKey[] | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '*') return null;

  const keys = trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter(isMembershipModuleKey);

  return keys.length > 0 ? keys : null;
}

/**
 * 构建模块开通表。
 * SaaS 默认全开（兼容现网）；若 deploy 配置了 enabledModules 则与之求交。
 */
export function buildModuleMap(
  enabledOverride: MembershipModuleKey[] | null,
): Record<MembershipModuleKey, boolean> {
  const out = {} as Record<MembershipModuleKey, boolean>;
  const allow = enabledOverride ? new Set(enabledOverride) : null;
  for (const key of ALL_MEMBERSHIP_MODULES) {
    out[key] = allow ? allow.has(key) : true;
  }
  return out;
}

/**
 * 统一策略入口：
 * - licenseModules：私有化 License 签发的 modules（最高优先）
 * - enabledOverride：ENABLED_MODULES
 * - edition=community：静态 COMMUNITY_MODULES 为基线，再与 override 求交
 * - edition=saas 且无 override：全开
 */
export function resolveModuleMap(opts: {
  edition?: DeployEdition;
  enabledOverride?: MembershipModuleKey[] | null;
  licenseModules?: MembershipModuleKey[] | null;
}): Record<MembershipModuleKey, boolean> {
  if (opts.licenseModules && opts.licenseModules.length > 0) {
    return buildModuleMap(opts.licenseModules);
  }

  const edition = opts.edition ?? 'saas';
  const override = opts.enabledOverride ?? null;

  if (edition === 'community') {
    const community = new Set(COMMUNITY_MODULES);
    if (!override) return buildModuleMap([...COMMUNITY_MODULES]);
    const intersect = override.filter((k) => community.has(k));
    return buildModuleMap(intersect.length > 0 ? intersect : [...COMMUNITY_MODULES]);
  }

  return buildModuleMap(override);
}

export function hasModule(
  modules: Record<string, boolean>,
  module: MembershipModuleKey,
): boolean {
  return modules[module] === true;
}

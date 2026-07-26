import type { ShapeKind } from '../types';
import { SHAPE_CATEGORY_IDS } from './categories';
import type {
  ListShapeCategoriesOptions,
  ListShapesOptions,
  ShapeCapabilities,
  ShapeCatalogEntry,
  ShapeCategoryDefinition,
  ShapeDefinition,
  ShapeElementDefaults,
  ShapeLifecycleContext,
  ShapeListItem,
  ShapePreset,
} from './types';

function resolveEnabled(flag: boolean | (() => boolean) | undefined, defaultValue = true): boolean {
  if (flag === undefined) return defaultValue;
  return typeof flag === 'function' ? flag() : flag;
}

function normalizeQuery(query: string | undefined): string {
  return (query ?? '').trim().toLowerCase();
}

function matchesQuery(def: ShapeDefinition, query: string): boolean {
  if (!query) return true;
  return def.label.toLowerCase().includes(query) || def.kind.toLowerCase().includes(query);
}

export class ShapeRegistry {
  private categories = new Map<string, ShapeCategoryDefinition>();
  private shapes = new Map<ShapeKind, ShapeDefinition>();
  private catalog: ShapeCatalogEntry[] = [];

  registerCategory(category: ShapeCategoryDefinition): void {
    const existing = this.categories.get(category.id);
    const next: ShapeCategoryDefinition = {
      ...existing,
      ...category,
      enabled: category.enabled ?? existing?.enabled ?? true,
    };
    this.categories.set(category.id, next);
  }

  unregisterCategory(categoryId: string): boolean {
    const hasEntries = this.catalog.some(s => s.categoryId === categoryId);
    if (hasEntries) return false;
    return this.categories.delete(categoryId);
  }

  /** 将图形登记到某一分类（同一 kind 可多次登记到不同分类） */
  registerCatalogEntry(entry: ShapeCatalogEntry): void {
    this.catalog = this.catalog.filter(
      c => !(c.kind === entry.kind && c.categoryId === entry.categoryId),
    );
    this.catalog.push({ ...entry });
  }

  registerShape(definition: ShapeDefinition): void {
    const existing = this.shapes.get(definition.kind);
    const next: ShapeDefinition = {
      ...existing,
      ...definition,
      enabled: definition.enabled ?? existing?.enabled ?? true,
      capabilities: {
        ...existing?.capabilities,
        ...definition.capabilities,
      },
      hooks: {
        ...existing?.hooks,
        ...definition.hooks,
      },
    };
    this.shapes.set(definition.kind, next);
    next.hooks?.onRegister?.(this.lifecycleCtx(definition.kind));

    if (definition.categoryId != null) {
      this.registerCatalogEntry({
        kind: definition.kind,
        categoryId: definition.categoryId,
        order: definition.order ?? 0,
        quickPick: definition.quickPick,
      });
    }
  }

  unregisterShape(kind: ShapeKind): boolean {
    const def = this.shapes.get(kind);
    if (!def) return false;
    def.hooks?.onUnregister?.(this.lifecycleCtx(kind));
    def.hooks?.onDestroy?.(this.lifecycleCtx(kind));
    return this.shapes.delete(kind);
  }

  attachCapabilities(kind: ShapeKind, capabilities: ShapeCapabilities): boolean {
    const def = this.shapes.get(kind);
    if (!def) return false;
    def.capabilities = { ...def.capabilities, ...capabilities };
    return true;
  }

  enableShape(kind: ShapeKind): boolean {
    const def = this.shapes.get(kind);
    if (!def) return false;
    def.enabled = true;
    def.hooks?.onEnable?.(this.lifecycleCtx(kind));
    return true;
  }

  disableShape(kind: ShapeKind): boolean {
    const def = this.shapes.get(kind);
    if (!def) return false;
    def.enabled = false;
    def.hooks?.onDisable?.(this.lifecycleCtx(kind));
    return true;
  }

  enableCategory(categoryId: string): boolean {
    const cat = this.categories.get(categoryId);
    if (!cat) return false;
    cat.enabled = true;
    return true;
  }

  disableCategory(categoryId: string): boolean {
    const cat = this.categories.get(categoryId);
    if (!cat) return false;
    cat.enabled = false;
    return true;
  }

  destroyShape(kind: ShapeKind): boolean {
    const def = this.shapes.get(kind);
    if (!def) return false;
    def.hooks?.onDestroy?.(this.lifecycleCtx(kind));
    def.capabilities = undefined;
    return this.shapes.delete(kind);
  }

  getCategory(categoryId: string): ShapeCategoryDefinition | undefined {
    return this.categories.get(categoryId);
  }

  getShape(kind: ShapeKind): ShapeDefinition | undefined {
    return this.shapes.get(kind);
  }

  isShapeEnabled(kind: ShapeKind): boolean {
    const def = this.shapes.get(kind);
    if (!def || !resolveEnabled(def.enabled)) return false;
    const placements = this.catalog.filter(c => c.kind === kind);
    if (placements.length === 0) {
      if (def.categoryId) {
        const cat = this.categories.get(def.categoryId);
        if (cat && !resolveEnabled(cat.enabled)) return false;
      }
      return true;
    }
    return placements.some(p => {
      const cat = this.categories.get(p.categoryId);
      return !cat || resolveEnabled(cat.enabled);
    });
  }

  listCategories(options: ListShapeCategoriesOptions = {}): ShapeCategoryDefinition[] {
    const { enabledOnly = true, includeEmpty = false } = options;
    return [...this.categories.values()]
      .filter(cat => !enabledOnly || resolveEnabled(cat.enabled))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .filter(cat => {
        if (includeEmpty) return true;
        if (!cat.hideWhenEmpty) return true;
        return this.listShapes({ categoryId: cat.id, enabledOnly }).length > 0;
      });
  }

  listShapes(options: ListShapesOptions = {}): ShapeListItem[] {
    const { categoryId, enabledOnly = true, quickPickOnly = false, query } = options;
    const q = normalizeQuery(query);
    const items: ShapeListItem[] = [];
    for (const entry of this.catalog) {
      if (categoryId && entry.categoryId !== categoryId) continue;
      if (quickPickOnly && !entry.quickPick) continue;
      const def = this.shapes.get(entry.kind);
      if (!def) continue;
      const item: ShapeListItem = {
        ...def,
        label: entry.label ?? def.label,
        categoryId: entry.categoryId,
        order: entry.order,
        quickPick: entry.quickPick,
      };
      if (enabledOnly && !this.isShapeEnabled(item.kind)) continue;
      if (!matchesQuery(item, q)) continue;
      items.push(item);
    }
    return items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.label.localeCompare(b.label, 'zh-CN'));
  }

  listShapePresets(options: ListShapesOptions = {}): ShapePreset[] {
    return this.listShapes(options).map(({ kind, label }) => ({ kind, label }));
  }

  /** 图形在 catalog 中登记的所有分类 */
  listCatalogCategoriesForKind(kind: ShapeKind): string[] {
    const ids: string[] = [];
    for (const entry of this.catalog) {
      if (entry.kind === kind && !ids.includes(entry.categoryId)) {
        ids.push(entry.categoryId);
      }
    }
    return ids;
  }

  /** 解析图形所属分类（优先元素已存分类，否则回退到 catalog 默认） */
  resolveShapeCategoryId(kind: ShapeKind, categoryId?: string): string {
    const entries = this.catalog.filter(e => e.kind === kind);
    if (categoryId && entries.some(e => e.categoryId === categoryId)) {
      return categoryId;
    }
    if (entries.length === 1) return entries[0].categoryId;
    const basic = entries.find(e => e.categoryId === SHAPE_CATEGORY_IDS.basic);
    if (basic) return SHAPE_CATEGORY_IDS.basic;
    return entries[0]?.categoryId ?? SHAPE_CATEGORY_IDS.basic;
  }

  /** 同分类下可替换的图形（更改图形面板用） */
  listReplaceableShapePresets(kind: ShapeKind, categoryId?: string): ShapePreset[] {
    const catId = this.resolveShapeCategoryId(kind, categoryId);
    const seen = new Set<ShapeKind>();
    const result: ShapePreset[] = [];
    for (const item of this.listShapes({ categoryId: catId })) {
      if (seen.has(item.kind)) continue;
      seen.add(item.kind);
      result.push({ kind: item.kind, label: item.label });
    }
    return result;
  }

  resolveDefaults(kind: ShapeKind): ShapeElementDefaults | undefined {
    const def = this.shapes.get(kind);
    if (!def) return undefined;
    if (def.defaults) {
      return typeof def.defaults === 'function' ? def.defaults() : def.defaults;
    }
    if (def.capabilities?.createDefaults) {
      return def.capabilities.createDefaults();
    }
    return undefined;
  }

  invoke<M extends keyof ShapeCapabilities>(
    kind: ShapeKind,
    method: M,
    ...args: Parameters<NonNullable<ShapeCapabilities[M]>>
  ): ReturnType<NonNullable<ShapeCapabilities[M]>> | undefined {
    if (!this.isShapeEnabled(kind)) return undefined;
    const def = this.shapes.get(kind);
    const fn = def?.capabilities?.[method];
    if (typeof fn !== 'function') return undefined;
    return (fn as (...a: unknown[]) => unknown)(...args) as ReturnType<NonNullable<ShapeCapabilities[M]>>;
  }

  hasCapability(kind: ShapeKind, method: keyof ShapeCapabilities): boolean {
    const def = this.shapes.get(kind);
    return typeof def?.capabilities?.[method] === 'function';
  }

  reset(): void {
    for (const kind of [...this.shapes.keys()]) {
      this.destroyShape(kind);
    }
    this.categories.clear();
    this.shapes.clear();
    this.catalog = [];
  }

  private lifecycleCtx(kind: ShapeKind): ShapeLifecycleContext {
    return { kind };
  }
}

let globalRegistry: ShapeRegistry | null = null;

export function getShapeRegistry(): ShapeRegistry {
  if (!globalRegistry) {
    globalRegistry = new ShapeRegistry();
  }
  return globalRegistry;
}

export function resetShapeRegistry(): void {
  globalRegistry?.reset();
  globalRegistry = null;
}

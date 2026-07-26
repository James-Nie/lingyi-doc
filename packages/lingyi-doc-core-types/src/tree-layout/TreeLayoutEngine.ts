/**
 * 树布局引擎接口（解除 whiteboard → mindnote/layout 运行时硬依赖）。
 * mindnote 侧注册实现；whiteboard presets/templates 只依赖本接口。
 */
export interface TreeLayoutResult {
  width: number;
  height: number;
}

export interface TreeLayoutEngine {
  computeLayout(
    root: unknown,
    structure?: string,
    branchStyle?: unknown,
    measure?: unknown,
  ): TreeLayoutResult;
}

export interface MindNodeFactory {
  createEmpty(text?: string): unknown;
  createMeasureOptions(): unknown;
  defaultBranchStyle: unknown;
  /** 规范化原始节点数据（由 mindmap 注册 normalizeMindNode） */
  normalize(raw: unknown): unknown;
}

const engines = new Map<string, TreeLayoutEngine>();
let mindNodeFactory: MindNodeFactory | null = null;

export function registerTreeLayoutEngine(id: string, engine: TreeLayoutEngine): void {
  engines.set(id, engine);
}

export function getTreeLayoutEngine(id = 'mindmap'): TreeLayoutEngine {
  const engine = engines.get(id);
  if (!engine) {
    throw new Error(`[TreeLayoutEngine] 未注册布局引擎: ${id}（请先 import mindnote 侧注册）`);
  }
  return engine;
}

export function hasTreeLayoutEngine(id = 'mindmap'): boolean {
  return engines.has(id);
}

export function registerMindNodeFactory(factory: MindNodeFactory): void {
  mindNodeFactory = factory;
}

export function getMindNodeFactory(): MindNodeFactory {
  if (!mindNodeFactory) {
    throw new Error('[MindNodeFactory] 未注册（请先 import mindnote 侧注册）');
  }
  return mindNodeFactory;
}

export function hasMindNodeFactory(): boolean {
  return mindNodeFactory != null;
}

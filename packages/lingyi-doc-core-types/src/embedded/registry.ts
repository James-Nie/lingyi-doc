/** 文档内嵌块工厂（解除 doc → whiteboard 运行时硬依赖） */
export type EmbeddedBlockVariant = 'empty' | 'flowchart' | 'mindmap';

export interface EmbeddedBlockFactory {
  /** 创建内嵌块的 data payload（如 WhiteboardJSON） */
  create(variant: EmbeddedBlockVariant): unknown;
  /** 规范化已有 data */
  normalize(raw: unknown): unknown;
}

export interface EmbeddedBlockRegistry {
  register(type: string, factory: EmbeddedBlockFactory): void;
  has(type: string): boolean;
  create(type: string, variant?: EmbeddedBlockVariant): unknown;
  normalize(type: string, raw: unknown): unknown;
}

const factories = new Map<string, EmbeddedBlockFactory>();

function emptyWhiteboardFallback(): unknown {
  return {
    documentId: '',
    title: '画板',
    viewport: { x: 0, y: 0, zoom: 1 },
    elements: [],
  };
}

export const embeddedBlockRegistry: EmbeddedBlockRegistry = {
  register(type, factory) {
    factories.set(type, factory);
  },
  has(type) {
    return factories.has(type);
  },
  create(type, variant = 'empty') {
    const factory = factories.get(type);
    if (!factory) {
      if (type === 'whiteboard') return emptyWhiteboardFallback();
      throw new Error(`[embeddedBlockRegistry] 未注册嵌入块类型: ${type}`);
    }
    return factory.create(variant);
  },
  normalize(type, raw) {
    const factory = factories.get(type);
    if (!factory) {
      if (type === 'whiteboard') {
        if (!raw || typeof raw !== 'object') return emptyWhiteboardFallback();
        return raw;
      }
      throw new Error(`[embeddedBlockRegistry] 未注册嵌入块类型: ${type}`);
    }
    return factory.normalize(raw);
  },
};

const cache = new Map<string, HTMLImageElement>();
const loading = new Map<string, Promise<HTMLImageElement>>();

export function getCachedMindmapImage(src: string): HTMLImageElement | null {
  return cache.get(src) ?? null;
}

export function loadMindmapImage(src: string): Promise<HTMLImageElement> {
  const cached = cache.get(src);
  if (cached) return Promise.resolve(cached);
  const pending = loading.get(src);
  if (pending) return pending;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      cache.set(src, img);
      loading.delete(src);
      resolve(img);
    };
    img.onerror = () => {
      loading.delete(src);
      reject(new Error('image load failed'));
    };
    img.src = src;
  });
  loading.set(src, promise);
  return promise;
}

export function preloadMindmapImages(srcs: string[], onLoaded?: () => void): void {
  let pending = 0;
  for (const src of srcs) {
    if (!src || cache.has(src)) continue;
    pending++;
    loadMindmapImage(src).finally(() => {
      pending--;
      if (pending === 0) onLoaded?.();
    });
  }
  if (pending === 0) onLoaded?.();
}

export function collectMindmapImageSrcs(root: { image?: string; children: unknown[] }): string[] {
  const out: string[] = [];
  const walk = (node: { image?: string; children: unknown[] }) => {
    if (node.image) out.push(node.image);
    for (const child of node.children) {
      walk(child as { image?: string; children: unknown[] });
    }
  };
  walk(root);
  return out;
}

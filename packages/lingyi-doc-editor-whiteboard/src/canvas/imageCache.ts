const cache = new Map<string, HTMLImageElement>();
const loading = new Map<string, Promise<HTMLImageElement>>();

export function getCachedImage(src: string): HTMLImageElement | null {
  return cache.get(src) ?? null;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
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

export function preloadImages(srcs: string[], onLoaded?: () => void): void {
  let pending = 0;
  for (const src of srcs) {
    if (cache.has(src)) continue;
    pending++;
    loadImage(src).finally(() => {
      pending--;
      if (pending === 0) onLoaded?.();
    });
  }
  if (pending === 0) onLoaded?.();
}

import { getCachedMindmapImage, loadMindmapImage } from '@lingyi-doc/mind-map';

export interface MindmapImageClipboardPayload {
  src: string;
  width?: number;
  height?: number;
  imageFlipH?: boolean;
  imageFlipV?: boolean;
}

let memoryClipboard: MindmapImageClipboardPayload | null = null;

export function setMindmapImageClipboard(payload: MindmapImageClipboardPayload | null): void {
  memoryClipboard = payload;
}

export function getMindmapImageClipboard(): MindmapImageClipboardPayload | null {
  return memoryClipboard;
}

export function hasMindmapImageClipboard(): boolean {
  return !!memoryClipboard;
}

async function srcToPngBlob(src: string, flipH = false, flipV = false): Promise<Blob | null> {
  try {
    await loadMindmapImage(src);
    const img = getCachedMindmapImage(src);
    if (!img) return null;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    if (canvas.width < 1 || canvas.height < 1) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(img, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
    return await new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve, 'image/png');
    });
  } catch {
    return null;
  }
}

export async function copyMindmapImageToClipboard(
  payload: MindmapImageClipboardPayload,
): Promise<boolean> {
  setMindmapImageClipboard(payload);
  const blob = await srcToPngBlob(payload.src, !!payload.imageFlipH, !!payload.imageFlipV);
  if (!blob || !navigator.clipboard?.write) return !!memoryClipboard;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return !!memoryClipboard;
  }
}

export async function readImageFromSystemClipboard(): Promise<Blob | null> {
  try {
    if (!navigator.clipboard?.read) return null;
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find(t => t.startsWith('image/'));
      if (!imageType) continue;
      return await item.getType(imageType);
    }
  } catch {
    // ignore
  }
  return null;
}

export function fitMindmapImageSize(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth = 400,
): { width: number; height: number } {
  if (naturalWidth <= maxWidth) {
    return { width: naturalWidth, height: naturalHeight };
  }
  const scale = maxWidth / naturalWidth;
  return {
    width: maxWidth,
    height: Math.max(1, Math.round(naturalHeight * scale)),
  };
}

export async function blobToMindmapImage(
  blob: Blob,
): Promise<{ src: string; width: number; height: number }> {
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'));
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('读取图片失败'));
    };
    reader.readAsDataURL(blob);
  });
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('解析图片失败'));
    img.onload = () => {
      const fitted = fitMindmapImageSize(img.naturalWidth, img.naturalHeight);
      resolve({ src, ...fitted });
    };
    img.src = src;
  });
}

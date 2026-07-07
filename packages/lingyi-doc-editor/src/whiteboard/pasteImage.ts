import type { ImageElement, WhiteboardPoint } from '@lingyi-doc/core';
import { genWhiteboardId } from '@lingyi-doc/core';

export const WHITEBOARD_IMAGE_MAX_WIDTH = 320;

export function fitWhiteboardImageSize(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth = WHITEBOARD_IMAGE_MAX_WIDTH,
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

export async function loadImageFromBlob(
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
      const fitted = fitWhiteboardImageSize(img.naturalWidth, img.naturalHeight);
      resolve({ src, ...fitted });
    };
    img.src = src;
  });
}

export function extractImageFileFromClipboard(dt: DataTransfer): File | null {
  if (dt.items?.length) {
    for (let i = 0; i < dt.items.length; i += 1) {
      const item = dt.items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) return file;
      }
    }
  }

  if (dt.files?.length) {
    for (let i = 0; i < dt.files.length; i += 1) {
      const file = dt.files[i];
      if (file.type.startsWith('image/')) return file;
    }
  }

  return null;
}

export async function readImageBlobFromSystemClipboard(): Promise<Blob | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.read) return null;
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find(type => type.startsWith('image/'));
      if (!imageType) continue;
      return await item.getType(imageType);
    }
  } catch {
    // 权限或环境不支持
  }
  return null;
}

export function createWhiteboardImageElement(
  anchor: WhiteboardPoint,
  zIndex: number,
  src: string,
  width: number,
  height: number,
  anchorMode: 'center' | 'topLeft' = 'center',
): ImageElement {
  return {
    id: genWhiteboardId(),
    type: 'image',
    x: anchorMode === 'center' ? anchor.x - width / 2 : anchor.x,
    y: anchorMode === 'center' ? anchor.y - height / 2 : anchor.y,
    width,
    height,
    zIndex,
    src,
  };
}

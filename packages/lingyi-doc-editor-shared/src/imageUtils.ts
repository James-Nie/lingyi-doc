import { MIND_NODE_MAX_WIDTH } from '@lingyi-doc/core-mindmap';

const OUTLINE_IMAGE_MAX_WIDTH = MIND_NODE_MAX_WIDTH;

export function fitMindNodeImageSize(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth = OUTLINE_IMAGE_MAX_WIDTH,
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

export function readImageFile(file: File): Promise<{ src: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'));
    reader.onload = () => {
      const src = typeof reader.result === 'string' ? reader.result : '';
      if (!src) {
        reject(new Error('读取图片失败'));
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error('解析图片失败'));
      img.onload = () => {
        const fitted = fitMindNodeImageSize(img.naturalWidth, img.naturalHeight);
        resolve({ src, ...fitted });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

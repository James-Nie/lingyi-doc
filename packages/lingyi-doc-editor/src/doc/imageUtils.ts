import { DocumentManager } from '@lingyi-doc/core';

const MAX_IMAGE_MB = 10;

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function loadImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = url;
  });
}

export function getImageFileFromClipboard(data: DataTransfer | null): File | null {
  if (!data) return null;
  const files = data.files;
  if (files?.length) {
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.startsWith('image/')) return files[i];
    }
  }
  const items = data.items;
  if (items) {
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) return file;
      }
    }
  }
  return null;
}

export function validateImageFile(file: File, maxMb = MAX_IMAGE_MB): string | null {
  if (!file.type.startsWith('image/')) return '请选择图片文件';
  if (file.size > maxMb * 1024 * 1024) return `图片大小不能超过 ${maxMb}MB`;
  return null;
}

/** 上传图片到 OSS 并返回公网 URL */
export async function uploadImageFile(file: File): Promise<string> {
  const err = validateImageFile(file);
  if (err) throw new Error(err);
  const result = await DocumentManager.uploadFile(file);
  return result.url;
}

export interface PreparedImagePayload {
  url: string;
  naturalWidth: number;
  naturalHeight: number;
  fileName: string;
}

/** 上传图片并读取尺寸，供文档插入使用 */
export async function prepareImageFileForInsert(file: File): Promise<PreparedImagePayload> {
  const err = validateImageFile(file);
  if (err) throw new Error(err);
  const result = await DocumentManager.uploadFile(file);
  const { width, height } = await loadImageSize(result.url);
  return {
    url: result.url,
    naturalWidth: width,
    naturalHeight: height,
    fileName: result.name || file.name,
  };
}

/** 上传任意文件到 OSS */
export async function uploadAttachmentFile(file: File) {
  return DocumentManager.uploadFile(file);
}

/** 异步读取剪贴板中的图片（Cmd/Ctrl+V 键盘粘贴） */
export async function getImageFileFromClipboardAsync(): Promise<File | null> {
  if (!navigator.clipboard?.read) return null;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find(t => t.startsWith('image/'));
      if (imageType) {
        const blob = await item.getType(imageType);
        const ext = imageType.split('/')[1] || 'png';
        return new File([blob], `paste.${ext}`, { type: imageType });
      }
    }
  } catch {
    return null;
  }
  return null;
}

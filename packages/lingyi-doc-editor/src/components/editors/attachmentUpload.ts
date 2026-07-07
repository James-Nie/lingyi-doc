import { DocumentManager } from '@lingyi-doc/core';
import type { AttachmentItem } from './AttachmentEditor';

export async function uploadAttachmentItems(files: File[]): Promise<AttachmentItem[]> {
  const results = await Promise.all(files.map(async file => {
    const uploaded = await DocumentManager.uploadFile(file);
    return {
      id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: uploaded.name || file.name,
      size: uploaded.size || file.size,
      type: uploaded.mimeType || file.type,
      url: uploaded.url,
    } satisfies AttachmentItem;
  }));
  return results;
}

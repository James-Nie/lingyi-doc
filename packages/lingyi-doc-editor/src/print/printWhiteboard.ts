import type { WhiteboardElement } from '@lingyi-doc/core';
import { printHtmlDocument, wrapImagePrintHtml } from '@lingyi-doc/core';
import { renderWhiteboardElementsToDataUrl } from '../whiteboard/exportWhiteboardImage';

/** 将画板内容渲染为图片并打开打印对话框 */
export async function printWhiteboard(
  elements: WhiteboardElement[],
  title: string,
): Promise<void> {
  const dataUrl = await renderWhiteboardElementsToDataUrl(elements);
  if (!dataUrl) throw new Error('画板为空，无法打印');
  await printHtmlDocument(wrapImagePrintHtml(title, dataUrl));
}

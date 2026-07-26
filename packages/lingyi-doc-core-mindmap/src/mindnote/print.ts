import type { MindNode } from './types';
import { displayMindmapNodeText } from './utils';
import { printHtmlDocument, wrapHtmlDocument } from '@lingyi-doc/core-types';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mindNodeOutlineHtml(node: MindNode): string {
  const text = escapeHtml(displayMindmapNodeText(node.text || ''));
  const children = node.collapsed ? [] : node.children;
  const childList = children.length
    ? `<ul>${children.map(mindNodeOutlineHtml).join('')}</ul>`
    : '';
  return `<li>${text}${childList}</li>`;
}

function mindNoteOutlineBody(root: MindNode): string {
  return `<ul style="padding-left:1.2em;line-height:1.8;">${mindNodeOutlineHtml(root)}</ul>`;
}

/** 将思维笔记大纲视图打印为 HTML */
export async function printMindNoteOutline(root: MindNode, title: string): Promise<void> {
  const body = mindNoteOutlineBody(root);
  const html = wrapHtmlDocument(body, title);
  await printHtmlDocument(html);
}

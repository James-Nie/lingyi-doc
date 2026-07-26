import { baseBlockToExportTable, genBlockId, type DocBlock, type ImageBlock, type MermaidBlock, type WhiteboardBlock } from '@lingyi-doc/core-doc';
import { DocumentManager } from '@lingyi-doc/core-client';
import mermaid from 'mermaid';
import { renderWhiteboardElementsToDataUrl, resolveWhiteboardElementsForExport } from './whiteboardExportHooks';

let mermaidReady = false;

function ensureMermaid() {
  if (mermaidReady) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'neutral',
    securityLevel: 'loose',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  });
  mermaidReady = true;
}

let mermaidCounter = 0;

async function mermaidToDataUrl(source: string, blockId: string): Promise<string | null> {
  const trimmed = source.trim();
  if (!trimmed) return null;
  ensureMermaid();
  try {
    const { svg } = await mermaid.render(`export-mermaid-${blockId}-${++mermaidCounter}`, trimmed);
    return svgToPngDataUrl(svg);
  } catch {
    return null;
  }
}

function svgToPngDataUrl(svg: string): Promise<string | null> {
  return new Promise(resolve => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const w = Math.max(1, img.naturalWidth || 800);
      const h = Math.max(1, img.naturalHeight || 600);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        resolve(null);
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function toImageBlock(source: DocBlock, dataUrl: string, alt: string, width?: number): ImageBlock {
  return {
    type: 'image',
    id: source.id,
    url: dataUrl,
    alt,
    width,
    align: 'center',
  };
}

async function prepareImageBlock(block: ImageBlock): Promise<DocBlock> {
  if (!block.url) {
    return {
      type: 'paragraph',
      id: block.id,
      text: '[图片]',
      marks: [],
    };
  }
  try {
    const dataUrl = await DocumentManager.fetchAssetAsDataUrl(block.url);
    return { ...block, url: dataUrl };
  } catch {
    return {
      type: 'paragraph',
      id: block.id,
      text: block.alt ? `[图片: ${block.alt}]` : '[图片加载失败]',
      marks: [],
    };
  }
}

async function prepareWhiteboardBlock(block: WhiteboardBlock): Promise<DocBlock> {
  const elements = await resolveWhiteboardElementsForExport(block.whiteboardData.elements ?? []);
  const dataUrl = await renderWhiteboardElementsToDataUrl(elements);
  if (dataUrl) {
    return toImageBlock(block, dataUrl, block.title ?? '画板', 640);
  }
  return {
    type: 'paragraph',
    id: block.id,
    text: `[${block.title ?? '画板'}]`,
    marks: [],
  };
}

async function prepareMermaidBlock(block: MermaidBlock): Promise<DocBlock> {
  const dataUrl = await mermaidToDataUrl(block.text, block.id);
  if (dataUrl) {
    return toImageBlock(block, dataUrl, 'Mermaid 图表', 640);
  }
  return {
    type: 'code',
    id: block.id,
    text: block.text || '',
    language: 'mermaid',
  };
}

/** 导出前预处理文档块：内嵌图片、渲染画板/Mermaid、展开多维表格 */
export async function prepareRichDocBlocksForExport(blocks: DocBlock[]): Promise<DocBlock[]> {
  const prepared: DocBlock[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case 'image':
        prepared.push(await prepareImageBlock(block));
        break;
      case 'whiteboard':
        prepared.push(await prepareWhiteboardBlock(block));
        break;
      case 'mermaid':
        prepared.push(await prepareMermaidBlock(block));
        break;
      case 'base':
        prepared.push(baseBlockToExportTable(block));
        break;
      default:
        prepared.push(block);
        break;
    }
  }
  return prepared;
}

/** 占位导出块 id（不应出现在持久化文档中） */
export function createExportPlaceholderParagraph(text: string): DocBlock {
  return { type: 'paragraph', id: genBlockId(), text, marks: [] };
}

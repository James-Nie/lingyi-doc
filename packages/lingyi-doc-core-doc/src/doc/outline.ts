import type { DocBlock, HeadingBlock, OutlineNode } from './types';

/** 从文档块解析 H1-H4 大纲树 */
export function buildOutlineTree(blocks: DocBlock[]): OutlineNode[] {
  const headings: OutlineNode[] = [];
  const stack: OutlineNode[] = [];

  blocks.forEach((block, index) => {
    if (block.type !== 'heading') return;
    const node: OutlineNode = {
      id: block.id,
      level: block.level,
      text: block.text.trim() || `标题 ${block.level}`,
      blockIndex: index,
      children: [],
    };

    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      headings.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  });

  return headings;
}

/** 扁平化大纲（用于滚动高亮） */
export function flattenOutline(nodes: OutlineNode[]): OutlineNode[] {
  const result: OutlineNode[] = [];
  const walk = (list: OutlineNode[]) => {
    for (const n of list) {
      result.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return result;
}

/** 查找当前滚动位置对应的大纲条目 */
export function findActiveOutlineId(
  blocks: DocBlock[],
  blockTops: Map<string, number>,
  scrollTop: number,
): string | null {
  let active: HeadingBlock | null = null;
  let activeTop = -Infinity;

  for (const block of blocks) {
    if (block.type !== 'heading') continue;
    const top = blockTops.get(block.id);
    if (top === undefined) continue;
    if (top <= scrollTop + 80 && top > activeTop) {
      activeTop = top;
      active = block;
    }
  }
  return active?.id ?? null;
}

import type { MindNode, MindNoteBranchStyle, MindNoteStructure } from './types';
import { computeMindMapLayout } from './layout';
import {
  createEmptyMindNode,
  createWhiteboardMeasureOptions,
  normalizeMindNode,
  WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT,
} from './utils';
import {
  registerMindNodeFactory,
  registerTreeLayoutEngine,
} from '@lingyi-doc/core-types';

/** 向白板布局注册表注入 mindnote 实现（side-effect） */
export function registerMindNoteTreeLayout(): void {
  registerTreeLayoutEngine('mindmap', {
    computeLayout(root, structure, branchStyle, measure) {
      return computeMindMapLayout(
        root as MindNode,
        (structure as MindNoteStructure | undefined) ?? 'right',
        (branchStyle as MindNoteBranchStyle | undefined) ?? WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT,
        measure as Parameters<typeof computeMindMapLayout>[3],
      );
    },
  });

  registerMindNodeFactory({
    createEmpty: (text = '') => createEmptyMindNode(text),
    createMeasureOptions: () => createWhiteboardMeasureOptions(),
    defaultBranchStyle: WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT,
    normalize: (raw) => normalizeMindNode(raw),
  });
}

registerMindNoteTreeLayout();

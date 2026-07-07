import type { MindNoteBranchStyle } from '@lingyi-doc/core';
import { MIND_NODE_MAX_WIDTH } from '@lingyi-doc/core';
import { mapLineStyle } from '../../smm/smmAdapter';

export const WB_MM_THEME = {
  accent: '#3370FF',
  line: '#BBBFC4',
  text: '#1F2329',
  rootFill: '#3370FF',
  rootText: '#FFFFFF',
} as const;

export function createWbMindmapTheme(branchStyle: MindNoteBranchStyle = 'straight') {
  return {
    backgroundColor: 'transparent',
    lineColor: WB_MM_THEME.line,
    lineWidth: 1.5,
    lineStyle: mapLineStyle(branchStyle),
    lineRadius: 5,
    paddingX: 14,
    paddingY: 8,
    imgPlacement: 'bottom',
    imgTextMargin: 8,
    imgMaxWidth: MIND_NODE_MAX_WIDTH - 48,
    imgMaxHeight: 480,
    hoverRectColor: WB_MM_THEME.accent,
    hoverRectRadius: 8,
    hoverRectPadding: 4,
    root: {
      shape: 'roundedRectangle',
      fillColor: WB_MM_THEME.rootFill,
      color: WB_MM_THEME.rootText,
      fontSize: 16,
      fontWeight: '600',
      borderColor: 'transparent',
      borderWidth: 0,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    second: {
      fillColor: 'transparent',
      color: WB_MM_THEME.text,
      fontSize: 14,
      fontWeight: 'normal',
      borderRadius: 6,
      borderColor: 'transparent',
      borderWidth: 0,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    node: {
      fillColor: 'transparent',
      color: WB_MM_THEME.text,
      fontSize: 14,
      fontWeight: 'normal',
      borderRadius: 4,
      borderColor: 'transparent',
      borderWidth: 0,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
  };
}

import type { MindNoteBranchStyle } from '@lingyi-doc/core-types';
import { MIND_NODE_MAX_WIDTH } from '@lingyi-doc/core-mindmap';
import { MN_COLORS } from './styles';
import { mapLineStyle } from '../smm/smmAdapter';

export function createMindMapThemeConfig(branchStyle: MindNoteBranchStyle = 'straight') {
  return {
    backgroundColor: MN_COLORS.mapBg,
    lineColor: MN_COLORS.line,
    lineWidth: 2,
    lineStyle: mapLineStyle(branchStyle),
    lineRadius: 5,
    paddingX: 16,
    paddingY: 8,
    imgPlacement: 'bottom',
    imgTextMargin: 8,
    imgMaxWidth: MIND_NODE_MAX_WIDTH - 48,
    imgMaxHeight: 480,
    hoverRectColor: MN_COLORS.selectedBorder,
    hoverRectRadius: 8,
    hoverRectPadding: 4,
    root: {
      shape: 'roundedRectangle',
      fillColor: MN_COLORS.rootBg,
      color: MN_COLORS.rootText,
      fontSize: 28,
      fontWeight: '500',
      borderColor: 'transparent',
      borderWidth: 0,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    second: {
      fillColor: MN_COLORS.nodeBg,
      color: MN_COLORS.text,
      fontSize: 24,
      fontWeight: 'normal',
      borderRadius: 8,
      borderColor: 'transparent',
      borderWidth: 0,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    node: {
      fillColor: 'transparent',
      color: MN_COLORS.text,
      fontSize: 20,
      fontWeight: 'normal',
      borderRadius: 6,
      borderColor: 'transparent',
      borderWidth: 0,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
  };
}

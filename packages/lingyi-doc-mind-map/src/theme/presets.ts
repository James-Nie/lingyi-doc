import type { MindmapTheme, MindmapThemeId } from '../types';

export const DEFAULT_THEME: MindmapTheme = {
  id: 'default',
  canvasBg: '#F7F8FA',
  lineColor: '#94BFFF',
  lineWidth: 2,
  accent: '#5B8FF9',
  text: '#1F2329',
  rootFill: '#5B8FF9',
  rootText: '#FFFFFF',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  rootFontSize: 28,
  branchFontSize: 24,
  leafFontSize: 20,
};

export const WHITEBOARD_THEME: MindmapTheme = {
  id: 'whiteboard',
  canvasBg: 'transparent',
  lineColor: '#BBBFC4',
  lineWidth: 1.5,
  accent: '#3370FF',
  text: '#1F2329',
  rootFill: '#3370FF',
  rootText: '#FFFFFF',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  rootFontSize: 16,
  branchFontSize: 14,
  leafFontSize: 14,
};

export const PRINT_THEME: MindmapTheme = {
  id: 'print',
  canvasBg: '#FFFFFF',
  lineColor: '#333333',
  lineWidth: 1.5,
  accent: '#333333',
  text: '#000000',
  rootFill: '#333333',
  rootText: '#FFFFFF',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  rootFontSize: 18,
  branchFontSize: 14,
  leafFontSize: 12,
};

const THEMES: Record<MindmapThemeId, MindmapTheme> = {
  default: DEFAULT_THEME,
  whiteboard: WHITEBOARD_THEME,
  print: PRINT_THEME,
};

export function resolveTheme(id: MindmapThemeId = 'default', patch?: Partial<MindmapTheme>): MindmapTheme {
  const base = THEMES[id] ?? DEFAULT_THEME;
  return patch ? { ...base, ...patch } : base;
}

export { THEMES as BUILTIN_THEMES };

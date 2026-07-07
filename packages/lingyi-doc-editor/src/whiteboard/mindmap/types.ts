export type WbMindmapAction =
  | 'sibling'
  | 'child'
  | 'parent'
  | 'duplicate'
  | 'delete'
  | 'collapse';

export const WB_MM_COLORS = [
  'transparent',
  '#FFFFFF',
  '#F5F6F7',
  '#E8E9EB',
  '#BBBFC4',
  '#8F959E',
  '#646A73',
  '#1F2329',
  '#7C6CFF',
  '#3370FF',
  '#245BDB',
  '#00B8A9',
  '#FFC60A',
  '#FF8800',
  '#F54A45',
] as const;

export const WB_MM_UI = {
  panelBg: '#FFFFFF',
  panelShadow: '0 2px 12px rgba(31, 35, 41, 0.12)',
  toolbarBorder: '#DEE0E3',
  accent: '#3370FF',
  muted: '#646A73',
  text: '#1F2329',
  radius: 8,
  selectBg: '#E6F0FF',
} as const;

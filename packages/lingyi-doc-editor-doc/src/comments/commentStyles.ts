import { DOC_COLORS } from '../styles';

export const COMMENT_PANEL_WIDTH = 320;

export const COMMENT_CARD = {
  bg: '#FFFFFF',
  border: '#E5E6EB',
  radius: 8,
  shadowSelected: '0 2px 12px rgba(31, 35, 41, 0.08)',
  shadowIdle: 'none',
  topBar: '#F7C900',
  topBarHeight: 3,
  quoteColor: '#86909C',
  quoteBorder: '#DEE0E3',
  metaColor: '#86909C',
  textColor: DOC_COLORS.text,
  replyBorder: '#3370FF',
  replyPlaceholder: '#C9CDD4',
} as const;

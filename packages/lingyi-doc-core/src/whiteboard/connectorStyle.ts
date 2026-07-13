import type { ArrowHeadStyle, ConnectorDashStyle, ConnectorElement } from './types';

export function resolveArrowHead(
  value: ArrowHeadStyle | boolean | undefined,
  fallback: ArrowHeadStyle,
): ArrowHeadStyle {
  if (typeof value === 'string') return value;
  if (value === true) return 'arrow';
  if (value === false) return 'none';
  return fallback;
}

export function connectorStartArrow(el: ConnectorElement): ArrowHeadStyle {
  return resolveArrowHead(el.arrowStart, 'none');
}

export function connectorEndArrow(el: ConnectorElement): ArrowHeadStyle {
  if (typeof el.arrowEnd === 'string') return el.arrowEnd;
  if (el.arrowEnd === false) return 'none';
  if (el.style === 'straight') return el.arrowEnd ? 'arrow' : 'none';
  return 'arrow';
}

export function connectorDashPattern(style: ConnectorDashStyle | undefined, strokeWidth: number): number[] {
  switch (style) {
    case 'dashed':
      return [Math.max(8, strokeWidth * 4), Math.max(6, strokeWidth * 3)];
    case 'dotted':
      return [Math.max(2, strokeWidth), Math.max(4, strokeWidth * 2)];
    default:
      return [];
  }
}

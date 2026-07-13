import type { ConnectorElement, ConnectorLabelPosition, ConnectorStyle, WhiteboardElement, WhiteboardPoint } from './types';
import { defaultElbowPoints, resolveElbowRoute } from './elbowConnector';
import { getConnectorEndpoints, getConnectorRoutePoints } from './connector';
import { sampleCurvePathPoints, ensureCurvePathPoints, normalizePathPoint } from './pathEditing';

export const CONNECTOR_LABEL_FONT_SIZE = 14;
export const CONNECTOR_LABEL_LINE_HEIGHT = 1.2;
export const CONNECTOR_LABEL_OFFSET = 12;
export const CONNECTOR_LABEL_PAD_X = 4;
export const CONNECTOR_LABEL_PAD_Y = 2;

export interface ConnectorPathFrame {
  point: WhiteboardPoint;
  tangent: WhiteboardPoint;
  normal: WhiteboardPoint;
}

export interface ConnectorLabelLayout {
  frame: ConnectorPathFrame;
  position: ConnectorLabelPosition;
}

function unitVector(dx: number, dy: number): WhiteboardPoint {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

function frameFromSegment(a: WhiteboardPoint, b: WhiteboardPoint, t = 0.5): ConnectorPathFrame {
  const point = {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
  const tangent = unitVector(b.x - a.x, b.y - a.y);
  return { point, tangent, normal: { x: -tangent.y, y: tangent.x } };
}

function sampleLegacyCurvePoints(a: WhiteboardPoint, b: WhiteboardPoint, steps = 24): WhiteboardPoint[] {
  const cx = (a.x + b.x) / 2;
  const points: WhiteboardPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    points.push({
      x: u * u * a.x + 2 * u * t * cx + t * t * b.x,
      y: u * u * a.y + 2 * u * t * a.y + t * t * b.y,
    });
  }
  return points;
}

function frameAtPolylineMidpoint(points: WhiteboardPoint[]): ConnectorPathFrame | null {
  if (points.length < 2) return null;
  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const len = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    segLens.push(len);
    total += len;
  }
  if (total < 1e-6) return frameFromSegment(points[0], points[points.length - 1]);

  const half = total / 2;
  let acc = 0;
  for (let i = 0; i < segLens.length; i++) {
    const segLen = segLens[i];
    if (acc + segLen >= half) {
      const t = segLen > 0 ? (half - acc) / segLen : 0;
      return frameFromSegment(points[i], points[i + 1], t);
    }
    acc += segLen;
  }
  return frameFromSegment(points[points.length - 2], points[points.length - 1]);
}

export function getConnectorPathFrameAtMidpoint(
  style: ConnectorStyle,
  a: WhiteboardPoint,
  b: WhiteboardPoint,
  route?: WhiteboardPoint[],
): ConnectorPathFrame | null {
  if (style === 'elbow') {
    const pts = route && route.length >= 2 ? route : defaultElbowPoints(a, b);
    return frameAtPolylineMidpoint(pts);
  }
  if (style === 'curve') {
    if (route && route.length >= 2) {
      const pathPoints = route.map((p, i) => normalizePathPoint(
        p,
        i === 0 || i === route.length - 1 ? 'corner' : 'smooth',
      ));
      return frameAtPolylineMidpoint(sampleCurvePathPoints(pathPoints));
    }
    return frameAtPolylineMidpoint(sampleLegacyCurvePoints(a, b));
  }
  return frameFromSegment(a, b);
}

export function resolveConnectorLabelPosition(
  conn: ConnectorElement,
): ConnectorLabelPosition {
  return conn.labelPosition ?? 'on';
}

export function getConnectorLabelLayout(
  conn: ConnectorElement,
  elements: WhiteboardElement[],
): ConnectorLabelLayout | null {
  const [a, b] = getConnectorEndpoints(conn, elements);
  const route = getConnectorRoutePoints(conn, elements);
  const frame = getConnectorPathFrameAtMidpoint(conn.style, a, b, route);
  if (!frame) return null;
  return {
    frame,
    position: resolveConnectorLabelPosition(conn),
  };
}

export function estimateConnectorLabelTextWidth(text: string, fontSize = CONNECTOR_LABEL_FONT_SIZE): number {
  let width = 0;
  for (const ch of text) {
    width += ch.charCodeAt(0) <= 0xff ? fontSize * 0.55 : fontSize;
  }
  return width;
}

export function getConnectorLabelTextHeight(fontSize = CONNECTOR_LABEL_FONT_SIZE): number {
  return fontSize * CONNECTOR_LABEL_LINE_HEIGHT;
}

export function getConnectorLabelAnchor(
  frame: ConnectorPathFrame,
  position: ConnectorLabelPosition,
  textHeight = getConnectorLabelTextHeight(),
): WhiteboardPoint {
  if (position === 'on') return frame.point;
  const sign = position === 'above' ? -1 : 1;
  const offset = CONNECTOR_LABEL_OFFSET + textHeight / 2;
  return {
    x: frame.point.x + frame.normal.x * sign * offset,
    y: frame.point.y + frame.normal.y * sign * offset,
  };
}

export function getConnectorLabelBounds(
  conn: ConnectorElement,
  elements: WhiteboardElement[],
  textWidth?: number,
): { x: number; y: number; w: number; h: number; anchor: WhiteboardPoint } | null {
  const text = conn.text?.trim();
  if (!text) return null;
  const layout = getConnectorLabelLayout(conn, elements);
  if (!layout) return null;
  const w = textWidth ?? estimateConnectorLabelTextWidth(text);
  const h = getConnectorLabelTextHeight();
  const anchor = getConnectorLabelAnchor(layout.frame, layout.position, h);
  return {
    x: anchor.x - w / 2 - CONNECTOR_LABEL_PAD_X,
    y: anchor.y - h / 2 - CONNECTOR_LABEL_PAD_Y,
    w: w + CONNECTOR_LABEL_PAD_X * 2,
    h: h + CONNECTOR_LABEL_PAD_Y * 2,
    anchor,
  };
}

export function snapConnectorLabelPosition(normalProjection: number): ConnectorLabelPosition {
  const threshold = CONNECTOR_LABEL_OFFSET * 0.45;
  if (normalProjection < -threshold) return 'above';
  if (normalProjection > threshold) return 'below';
  return 'on';
}

export function projectPointOnConnectorNormal(
  frame: ConnectorPathFrame,
  pt: WhiteboardPoint,
): number {
  return (pt.x - frame.point.x) * frame.normal.x + (pt.y - frame.point.y) * frame.normal.y;
}
